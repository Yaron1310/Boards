#!/usr/bin/env node
/**
 * Retain the previous deploy's hashed assets so tabs opened before a deploy keep working.
 *
 * THE PROBLEM
 * Vite content-hashes every chunk and Firebase Hosting serves each release as an exact
 * file set: files absent from the new release stop being served the instant it goes live.
 * A tab loaded before the deploy still holds the old index.html, so its chunk filenames
 * now 404 -- and because firebase.json rewrites "**" to /index.html, they come back as
 * HTTP 200 with an HTML body, which the browser reports as a MIME type error.
 *
 * THE FIX
 * Before deploying, copy the currently-live assets into the new dist/ so they ship
 * alongside the new ones. Old tabs keep resolving their chunks; new visitors get the new
 * index.html and the new hashes. Nothing about the running app changes.
 *
 * WHY CRAWL THE LIVE SITE RATHER THAN KEEP A LOCAL ARCHIVE
 * A local archive is only correct on the machine that holds it, and deploys here are run
 * by hand. The deployed site already *is* an accurate record of what it serves, so we
 * rediscover it each time: index.html names the entry chunks, and Vite emits every lazy
 * import as a literal "./Name-HASH.js" inside the bundles, so the whole graph is
 * reachable by following those references.
 *
 * dist/retained-assets.json is the authoritative record of everything the previous deploy
 * shipped -- its own build plus what it had retained. Carrying that list forward is what
 * makes retention span more than a single generation: a chunk retained last time is not
 * referenced by anything in the new build, so crawling alone would never rediscover it and
 * it would be dropped after one deploy. The crawl bootstraps the first run (when no
 * manifest exists yet) and backstops the manifest thereafter. The manifest records, per
 * file, the last date it was part of a build -- a hashed filename carries no date of its own, and it is
 * that date, not first-seen, that the retention window should run from: a chunk unchanged
 * for a year is not stale, it is current, and it should still be kept for the full window
 * after it is finally replaced.
 *
 * FAILURE POSTURE
 * Network problems warn and exit 0. Without retention the deploy behaves exactly as it
 * does today, so blocking a release over it would trade a small regression for a large
 * one. A genuinely broken state (unwritable dist) exits non-zero.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ORIGIN = (process.env.RETAIN_ORIGIN || 'https://boards.logyx.co.il').replace(/\/+$/, '');
const RETENTION_DAYS = Number(process.env.RETAIN_DAYS || 30);
const DIST = process.env.RETAIN_DIST || join(__dirname, '..', 'dist');
const ASSETS_DIR = join(DIST, 'assets');
const MANIFEST_NAME = 'retained-assets.json';
const FETCH_TIMEOUT_MS = 20000;
const MAX_ASSETS = 2000;

const today = () => new Date().toISOString().slice(0, 10);
const log = (msg) => console.log(`[retain-assets] ${msg}`);
const warn = (msg) => console.warn(`[retain-assets] WARNING: ${msg}`);

/** Hashed asset filenames, e.g. WorkspaceHomePage-BXqkPxj5.js or index-Dzx3KbE8.css */
const ASSET_RE = /[A-Za-z0-9._-]+?-[A-Za-z0-9_-]{8}\.(?:js|css)/g;

async function fetchWithTimeout(url, asText, allowHtml = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    // The SPA rewrite turns any miss into index.html with a 200. For anything that should
    // not be HTML (a chunk, the manifest), an HTML body means "not there" -- saving it would
    // plant a file that looks like a chunk and fails to parse, which is worse than not
    // retaining it. index.html itself is fetched with allowHtml.
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (!allowHtml && type.includes('text/html')) {
      return { ok: false, reason: 'rewritten to index.html (not found)' };
    }

    const body = asText ? await res.text() : Buffer.from(await res.arrayBuffer());
    if (!allowHtml && !asText && body.slice(0, 15).toString('utf8').trim().toLowerCase().startsWith('<!doctype')) {
      return { ok: false, reason: 'HTML body (not found)' };
    }
    return { ok: true, body };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'timed out' : String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Walk the live site from index.html, following chunk references, and return every asset name. */
async function discoverLiveAssets() {
  const index = await fetchWithTimeout(`${ORIGIN}/index.html`, true, true);
  if (!index.ok) {
    warn(`could not read ${ORIGIN}/index.html (${index.reason}) -- skipping retention`);
    return null;
  }

  const seen = new Set();
  const queue = [];
  const enqueue = (text) => {
    for (const name of text.match(ASSET_RE) || []) {
      if (!seen.has(name) && seen.size < MAX_ASSETS) {
        seen.add(name);
        if (name.endsWith('.js')) queue.push(name);
      }
    }
  };

  enqueue(index.body);

  // Breadth-first: each JS chunk names the chunks it can load.
  const contents = new Map();
  while (queue.length) {
    const name = queue.shift();
    const res = await fetchWithTimeout(`${ORIGIN}/assets/${name}`, true);
    if (!res.ok) continue;
    contents.set(name, res.body);
    enqueue(res.body);
  }

  return { names: [...seen], contents };
}

async function main() {
  if (!existsSync(ASSETS_DIR)) {
    console.error(`[retain-assets] ERROR: ${ASSETS_DIR} does not exist -- run the build first.`);
    process.exit(1);
  }

  const built = new Set(readdirSync(ASSETS_DIR));
  log(`this build produced ${built.size} asset(s); checking ${ORIGIN} for what is live`);

  // Previous manifest tells us when each retained file was first seen.
  let previous = {};
  const live = await fetchWithTimeout(`${ORIGIN}/${MANIFEST_NAME}`, true);
  if (live.ok) {
    try {
      const parsed = JSON.parse(live.body);
      if (parsed && typeof parsed.lastCurrent === 'object') previous = parsed.lastCurrent;
      log(`found previous manifest with ${Object.keys(previous).length} entry/entries`);
    } catch {
      warn('previous manifest was not valid JSON -- starting a fresh one');
    }
  } else {
    log(`no previous manifest (${live.reason}) -- first run with retention enabled`);
  }

  const discovered = await discoverLiveAssets();
  if (!discovered) {
    writeManifest(built, previous);
    return;
  }

  // Everything the previous deploy shipped (from its manifest), plus anything the crawl
  // found. The manifest is what carries earlier generations forward; the crawl covers the
  // first run and anything the manifest somehow missed.
  const candidates = new Set([...Object.keys(previous), ...discovered.names]);

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  let retained = 0;
  let expired = 0;

  for (const name of candidates) {
    if (built.has(name)) continue; // the new build already produces this exact file

    // Unknown to the manifest means this is the first deploy with retention on, so treat
    // it as current today rather than immediately expiring an asset we cannot date.
    const lastCurrent = previous[name] || today();
    if (lastCurrent < cutoff) {
      expired++;
      continue;
    }

    const cached = discovered.contents.get(name);
    let body = cached !== undefined ? Buffer.from(cached, 'utf8') : null;
    if (body === null) {
      const res = await fetchWithTimeout(`${ORIGIN}/assets/${name}`, false);
      if (!res.ok) continue;
      body = res.body;
    }

    writeFileSync(join(ASSETS_DIR, name), body);
    previous[name] = lastCurrent;
    retained++;
  }

  log(`retained ${retained} asset(s) from the live site; ${expired} aged out past ${RETENTION_DAYS} days`);
  writeManifest(built, previous);
}

function writeManifest(built, previous) {
  const lastCurrent = {};
  const stamp = today();

  // Anything this build produced is current as of today -- including a chunk whose content
  // never changed, which is why this is written before the carried-forward entries below.
  for (const name of built) if (/\.(js|css)$/.test(name)) lastCurrent[name] = stamp;

  // Carry forward retained files at the date they were last current, so their window runs
  // from when they stopped being current rather than from now.
  for (const [name, date] of Object.entries(previous)) {
    if (lastCurrent[name]) continue;
    if (existsSync(join(ASSETS_DIR, name))) lastCurrent[name] = date;
  }

  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, MANIFEST_NAME), JSON.stringify({ updated: new Date().toISOString(), lastCurrent }, null, 2));
  log(`wrote ${MANIFEST_NAME} with ${Object.keys(lastCurrent).length} entry/entries`);
}

main().catch((err) => {
  warn(`unexpected failure (${err && err.message}) -- deploying without retention`);
  process.exit(0);
});
