#!/usr/bin/env node
/**
 * Repair subitems orphaned by the subitem-panel teardown bug (fixed in PR #36).
 *
 * The bug: when a subitem panel's row load failed (missing Firestore index), the panel deleted
 * the subitem group doc and its column docs. The subitem rows survived, still pointing at the
 * deleted group id, with their values keyed by the deleted column ids. This script reattaches
 * them.
 *
 * How the parent is found. The deleted group doc was the only record of its parent item, so the
 * script reads the Cloud Run request logs: right after deleting a group, the panel told the app to
 * reload that one parent's subitem table, so the logs show
 *     DELETE /api/boards/<board>/groups/<table>
 *     GET    /api/boards/<board>/groups?parentItemId=<parent>     (same browser, moments later)
 * Subitems archived together with their parent (archivedVia "item:<parent>") give the parent
 * directly.
 *
 * Columns. The deleted column docs (names / types / settings) aren't in the logs. The script
 * recreates them under their ORIGINAL ids — so every stored value reconnects — inferring each
 * type from the stored values: Person / Status / Date get their default names and settings (every
 * subitem table was created with those), other columns come back as "Recovered column N".
 *
 * Two steps — nothing is written until `apply`:
 *
 *   cd backend
 *   gcloud auth application-default login
 *   gcloud auth application-default set-quota-project boards-f313e
 *
 *   node scripts/repair-orphaned-subitems.mjs report --out subitem-repair.json
 *     → read-only: prints a summary and writes the full plan. Review it. For a table without a
 *       proposed parent, fill in "parentItemId" yourself; set "apply": false to skip a table.
 *
 *   node scripts/repair-orphaned-subitems.mjs apply --in subitem-repair.json
 *     → recreates the subitem tables from the (edited) plan. Safe to re-run: tables that already
 *       exist are skipped. When the parent already has a subitem table (e.g. someone created new
 *       subitems since), the recovered subitems are merged into it instead.
 *
 * Options: --project <id> (default boards-f313e), --database <id> (default = project id),
 *          --since <ISO date> (default 2026-10-04), --org <orgId> (limit to one organization),
 *          --debug-table <tableId> (with report: print the log lines around that table's
 *          deletion instead of writing a plan),
 *          --logs-file <file> (use exported log entries — JSON array, e.g. from
 *          `gcloud logging read … --format=json` — instead of querying Cloud Logging).
 * Needs: Firestore read/write and Logs Viewer (roles/logging.viewer) on the project.
 */
import fs from 'node:fs';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------
const [command, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1];
const PROJECT = opts.project ?? 'boards-f313e';
const DATABASE = opts.database ?? PROJECT;
const SINCE = opts.since ?? '2026-10-04T00:00:00Z';
if (command !== 'report' && command !== 'apply') {
  console.error('Usage: node scripts/repair-orphaned-subitems.mjs report --out plan.json | apply --in plan.json');
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT });
const db = getFirestore(admin.app(), DATABASE);
const orgDoc = (orgId) => db.collection('organizations').doc(orgId);

const DEFAULT_STATUS_OPTIONS = [
  { id: 'todo', label: 'To Do', color: '#94a3b8' },
  { id: 'inprogress', label: 'In Progress', color: '#6366f1' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];
const DEFAULT_STATUS_IDS = new Set(DEFAULT_STATUS_OPTIONS.map((o) => o.id));

// ---------------------------------------------------------------------------------------------
// Request logs → table id → parent item id
// ---------------------------------------------------------------------------------------------
async function loadRequestLogs() {
  if (opts['logs-file']) return JSON.parse(fs.readFileSync(opts['logs-file'], 'utf8'));
  const filter = [
    `logName="projects/${PROJECT}/logs/run.googleapis.com%2Frequests"`,
    `timestamp>="${SINCE}"`,
    '((httpRequest.requestMethod="DELETE" AND httpRequest.requestUrl:"/groups/") OR httpRequest.requestUrl:"parentItemId=")',
  ].join(' AND ');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/logging.read'] });
  const client = await auth.getClient();
  const entries = [];
  let pageToken;
  do {
    const res = await client.request({
      url: 'https://logging.googleapis.com/v2/entries:list',
      method: 'POST',
      data: { resourceNames: [`projects/${PROJECT}`], filter, orderBy: 'timestamp asc', pageSize: 1000, pageToken },
    });
    entries.push(...(res.data.entries ?? []));
    pageToken = res.data.nextPageToken;
    process.stderr.write(`\r  read ${entries.length} request log entries…`);
  } while (pageToken);
  process.stderr.write('\n');
  return entries;
}

/** Prints every logged request that matters for one table: its DELETE, and every subitem-table
 *  load on its board within 10 minutes either side — to see what the matcher sees. */
function debugTable(tableId, tables, parsed) {
  const table = tables.find((t) => t.tableId === tableId);
  if (!table) { console.log(`Table ${tableId} is not among the orphaned tables.`); return; }
  const del = parsed.find((p) => p.kind === 'delete' && p.groupId === tableId);
  if (!del) { console.log(`No DELETE of ${tableId} in the logs.`); return; }
  const clients = new Map();
  const tag = (c) => { if (!clients.has(c)) clients.set(c, `browser${clients.size + 1}`); return clients.get(c); };
  console.log(`Board ${table.boardName} (${table.boardId}); DELETE at ${new Date(del.t).toISOString()} from ${tag(del.client)}`);
  const near = parsed.filter((p) => p.boardId === table.boardId && Math.abs(p.t - del.t) <= 10 * 60_000).sort((a, b) => a.t - b.t);
  for (const p of near) {
    const dt = ((p.t - del.t) / 1000).toFixed(3).padStart(9);
    if (p.kind === 'delete') console.log(`${dt}s  ${tag(p.client)}  DELETE group ${p.groupId}${p.groupId === tableId ? '   <== this table' : ''}`);
    else console.log(`${dt}s  ${tag(p.client)}  GET parent ${p.parentItemId}  status ${p.status}  ${p.size} bytes`);
  }
  for (const [c, name] of clients) console.log(`${name} = ${c}`);
}

/** Timeline match first; the reload-right-after-delete match confirms or fills in. */
function combineMatches(timeline, reload) {
  if (!timeline) return reload.parentItemId ? { ...reload, confidence: reload.confidence === 'high' ? 'medium' : 'low' } : reload;
  if (reload.parentItemId === timeline.parentItemId) {
    return { ...timeline, confidence: 'high', evidence: [...timeline.evidence, 'confirmed: the same browser reloaded exactly this parent right after the delete'] };
  }
  return timeline;
}

/** One parsed request: what it touched, when, from which browser (IP + user agent). */
function parseEntry(e) {
  const r = e.httpRequest;
  if (!r?.requestUrl) return null;
  let url;
  try { url = new URL(r.requestUrl); } catch { return null; }
  const t = Date.parse(e.timestamp);
  const client = `${r.remoteIp ?? ''}|${r.userAgent ?? ''}`;
  const del = r.requestMethod === 'DELETE' && url.pathname.match(/\/boards\/([^/]+)\/groups\/([^/]+)$/);
  if (del) return { kind: 'delete', boardId: del[1], groupId: del[2], t, client, status: r.status };
  const get = url.pathname.match(/\/boards\/([^/]+)\/groups$/);
  const parentItemId = url.searchParams.get('parentItemId');
  if (r.requestMethod === 'GET' && get && parentItemId) {
    return { kind: 'parent', boardId: get[1], parentItemId, t, client, status: Number(r.status ?? 0), size: Number(r.responseSize ?? NaN) };
  }
  return null;
}

/**
 * For a deleted table: the parent whose subitem table the same browser reloaded right after the
 * delete. Also reports whether that reload came back smaller than earlier ones (non-empty → empty).
 */
function matchParentFromLogs(tableId, boardId, parsed) {
  const deletes = parsed.filter((p) => p.kind === 'delete' && p.groupId === tableId && p.boardId === boardId);
  if (deletes.length === 0) return { parentItemId: null, confidence: 'none', evidence: ['no DELETE of this table found in the request logs'] };
  const del = deletes[0];
  const WINDOW_MS = 15_000;
  const after = parsed.filter((p) => p.kind === 'parent' && p.boardId === boardId && p.client === del.client && p.t >= del.t && p.t <= del.t + WINDOW_MS);
  if (after.length === 0) {
    return { parentItemId: null, confidence: 'none', evidence: [`deleted at ${new Date(del.t).toISOString()} but no parent reload followed within ${WINDOW_MS / 1000}s`] };
  }
  const first = after[0];
  const distinctSoon = [...new Set(after.filter((p) => p.t <= first.t + 2000).map((p) => p.parentItemId))];
  const earlierSizes = parsed
    .filter((p) => p.kind === 'parent' && p.parentItemId === first.parentItemId && p.t < del.t && p.status === 200 && Number.isFinite(p.size))
    .map((p) => p.size);
  const shrank = Number.isFinite(first.size) && earlierSizes.length > 0 && Math.max(...earlierSizes) > first.size;
  const confidence = distinctSoon.length === 1 ? (shrank ? 'high' : 'medium') : 'low';
  return {
    parentItemId: first.parentItemId,
    confidence,
    evidence: [
      `DELETE …/groups/${tableId} at ${new Date(del.t).toISOString()}`,
      `then GET …/groups?parentItemId=${first.parentItemId} ${first.t - del.t} ms later from the same browser`,
      shrank ? `that reload was smaller than earlier ones for this parent (${first.size} vs up to ${Math.max(...earlierSizes)} bytes): its table had just gone`
        : 'no earlier, larger reload of this parent to compare with',
      ...(distinctSoon.length > 1 ? [`other parents reloaded in the same 2 s: ${distinctSoon.filter((x) => x !== first.parentItemId).join(', ')}`] : []),
    ],
  };
}

/**
 * Main signal: every board load asks for each row's subitem table, and the response is larger
 * while the table exists than when it doesn't ("[]"). A deleted table belongs to the parent whose
 * responses go from larger to empty across the moment of that table's DELETE — no other response
 * from that parent in between. Works whether or not the panel reloaded the parent right after.
 * Returns tableId → { parentItemId, confidence, evidence } for the tables it could place.
 */
function matchByTimeline(tables, parsed) {
  const results = new Map();
  const deletesById = new Map();
  for (const p of parsed) if (p.kind === 'delete' && !deletesById.has(p.groupId)) deletesById.set(p.groupId, p);

  for (const boardId of new Set(tables.map((t) => t.boardId))) {
    const series = new Map();
    for (const p of parsed) {
      // Only full responses tell whether a table existed — a 304 "not modified" carries no body.
      if (p.kind !== 'parent' || p.boardId !== boardId || p.status !== 200 || !Number.isFinite(p.size)) continue;
      series.set(p.parentItemId, [...(series.get(p.parentItemId) ?? []), p]);
    }
    const sizes = [...series.values()].flat().map((r) => r.size);
    if (sizes.length === 0) continue;
    // Most rows have no subitems, so the commonest full-response size is the empty "[]" answer.
    const counts = new Map();
    for (const z of sizes) counts.set(z, (counts.get(z) ?? 0) + 1);
    const emptySize = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    for (const list of series.values()) list.sort((a, b) => a.t - b.t);

    // Every parent whose "had a table" → "no table" switch brackets the table's DELETE.
    const candidatesFor = (tableId) => {
      const del = deletesById.get(tableId);
      if (!del || del.boardId !== boardId) return [];
      const out = [];
      for (const [parentItemId, list] of series) {
        const before = list.filter((r) => r.t <= del.t);
        const lastBig = [...before].reverse().find((r) => r.size > emptySize);
        if (!lastBig || before[before.length - 1] !== lastBig) continue; // already empty before the delete
        const next = list.find((r) => r.t > del.t);
        if (!next || next.size !== emptySize) continue; // still had a table afterwards
        out.push({ parentItemId, key: `${parentItemId}@${lastBig.t}`, lastBig, next, del, span: next.t - lastBig.t });
      }
      return out.sort((a, b) => a.span - b.span);
    };

    const pending = tables.filter((t) => t.boardId === boardId).map((t) => ({ t, cands: candidatesFor(t.tableId) }));
    const taken = new Set();
    // Place the unambiguous tables first; each parent's switch can explain only one table.
    for (let changed = true; changed;) {
      changed = false;
      for (const entry of pending) {
        if (results.has(entry.t.tableId)) continue;
        const free = entry.cands.filter((c) => !taken.has(c.key));
        if (free.length !== 1) continue;
        const c = free[0];
        taken.add(c.key);
        changed = true;
        results.set(entry.t.tableId, {
          parentItemId: c.parentItemId,
          confidence: 'high',
          evidence: [
            `DELETE …/groups/${entry.t.tableId} at ${new Date(c.del.t).toISOString()}`,
            `parent ${c.parentItemId} had a table at ${new Date(c.lastBig.t).toISOString()} (${c.lastBig.size} bytes) and none from ${new Date(c.next.t).toISOString()} (${c.next.size} bytes)`,
            'no other parent on this board lost its table across that delete',
          ],
        });
      }
    }
    for (const entry of pending) {
      if (results.has(entry.t.tableId)) continue;
      const free = entry.cands.filter((c) => !taken.has(c.key));
      if (free.length === 0) continue;
      results.set(entry.t.tableId, {
        parentItemId: free[0].parentItemId,
        confidence: 'low',
        evidence: [
          `DELETE …/groups/${entry.t.tableId} at ${new Date(free[0].del.t).toISOString()}`,
          `${free.length} parents lost their table across that delete: ${free.map((c) => c.parentItemId).join(', ')} — closest-in-time proposed`,
        ],
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Column type inference from stored values
// ---------------------------------------------------------------------------------------------
function inferColumn(columnId, values, userIds) {
  const vals = values.filter((v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));
  const all = (pred) => vals.length > 0 && vals.every(pred);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  let type = 'text';
  let settings = {};
  if (all((v) => Array.isArray(v) && v.every((e) => isObj(e) && typeof e.minutes === 'number' && e.loggedAt))) type = 'hours_log';
  else if (all((v) => Array.isArray(v) && v.every((e) => isObj(e) && typeof e.value === 'number' && e.loggedAt))) type = 'number_log';
  else if (all((v) => Array.isArray(v) && v.every((e) => isObj(e) && e.url && e.mimeType))) type = 'files';
  else if (all((v) => Array.isArray(v) && v.every((e) => typeof e === 'string'))) {
    const ids = vals.flat();
    if (ids.some((id) => userIds.has(id))) { type = 'person'; settings = { multiple: true }; }
    else { type = 'tags'; settings = { allowCustom: true }; }
  } else if (all((v) => isObj(v) && ('start' in v || 'end' in v))) type = 'time_range';
  else if (all((v) => isObj(v) && 'address' in v)) type = 'location';
  else if (all((v) => typeof v === 'number')) type = 'number';
  else if (all((v) => typeof v === 'boolean')) type = 'checkbox';
  else if (all((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) { type = 'date'; settings = { includeTime: false }; }
  else if (all((v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v))) type = 'time';
  else if (vals.length > 0 && vals.every((v) => typeof v === 'string') && vals.some((v) => DEFAULT_STATUS_IDS.has(v))) {
    type = 'status';
    const unknown = [...new Set(vals.filter((v) => !DEFAULT_STATUS_IDS.has(v)))];
    settings = { options: [...DEFAULT_STATUS_OPTIONS, ...unknown.map((id, i) => ({ id, label: `Recovered status ${i + 1}`, color: '#9ca3af' }))] };
  }
  return { id: columnId, type, settings, valuesCount: vals.length };
}

/** Columns for a recovered table: inferred from the values, default names, Person/Status/Date first. */
function planColumns(subitems, userIds, mirroredHours) {
  const keys = [...new Set(subitems.flatMap((s) => Object.keys(s.values ?? {})))];
  const cols = keys.map((k) => inferColumn(k, subitems.map((s) => s.values?.[k]), userIds));
  const named = new Set();
  let n = 0;
  const DEFAULT_NAMES = { person: 'Person', status: 'Status', date: 'Date' };
  for (const c of cols) {
    if (DEFAULT_NAMES[c.type] && !named.has(c.type)) { c.name = DEFAULT_NAMES[c.type]; named.add(c.type); continue; }
    if (c.type === 'hours_log' && mirroredHours && !named.has('hours_log')) {
      c.name = mirroredHours.name; c.settings = { mirroredFromColumnId: mirroredHours.id }; named.add('hours_log'); continue;
    }
    c.name = `Recovered column ${++n}`;
  }
  const rank = { person: 0, status: 1, date: 2, hours_log: 3 };
  return cols.sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------
async function report() {
  const out = opts.out ?? 'subitem-repair.json';
  console.log(`Reading Firestore (project ${PROJECT}, database ${DATABASE})…`);
  const userIds = new Set((await db.collection('users').select().get()).docs.map((d) => d.id));
  const orgIds = opts.org ? [opts.org] : (await db.collection('organizations').select().get()).docs.map((d) => d.id);

  const tables = [];
  for (const orgId of orgIds) {
    const boards = await orgDoc(orgId).collection('boards').get();
    const groupIdsByBoard = new Map();
    const boardNames = new Map();
    const mirroredByBoard = new Map();
    for (const b of boards.docs) {
      boardNames.set(b.id, b.data().name ?? b.id);
      groupIdsByBoard.set(b.id, new Set((await b.ref.collection('groups').select().get()).docs.map((d) => d.id)));
      const mirrors = (await b.ref.collection('columns').where('type', '==', 'hours_log').get()).docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => !c.parentGroupId && c.settings?.subitemsOnly);
      mirroredByBoard.set(b.id, mirrors.length === 1 ? { id: mirrors[0].id, name: mirrors[0].name } : null);
    }
    const items = (await orgDoc(orgId).collection('items').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const byTable = new Map();
    for (const it of items) {
      const groups = groupIdsByBoard.get(it.boardId);
      if (!groups || !it.groupId || groups.has(it.groupId)) continue;
      const key = `${it.boardId}/${it.groupId}`;
      byTable.set(key, [...(byTable.get(key) ?? []), it]);
    }
    for (const [key, subitems] of byTable) {
      const [boardId, tableId] = key.split('/');
      tables.push({ orgId, boardId, boardName: boardNames.get(boardId), tableId, subitems, mirroredHours: mirroredByBoard.get(boardId) });
    }
  }
  console.log(`Found ${tables.reduce((n, t) => n + t.subitems.length, 0)} orphaned rows in ${tables.length} deleted tables.`);
  if (tables.length === 0) return;

  console.log('Reading request logs…');
  const parsed = (await loadRequestLogs()).map(parseEntry).filter(Boolean);
  if (opts['debug-table']) { debugTable(opts['debug-table'], tables, parsed); return; }

  const timeline = matchByTimeline(tables, parsed);
  const plan = [];
  for (const t of tables) {
    const viaArchive = [...new Set(t.subitems.map((s) => (typeof s.archivedVia === 'string' && s.archivedVia.startsWith('item:') ? s.archivedVia.slice(5) : null)).filter(Boolean))];
    const match = viaArchive.length === 1
      ? { parentItemId: viaArchive[0], confidence: 'exact', evidence: [`subitems archived together with item ${viaArchive[0]}`] }
      : combineMatches(timeline.get(t.tableId), matchParentFromLogs(t.tableId, t.boardId, parsed));

    let parent = null;
    let parentProblem = null;
    if (match.parentItemId) {
      const doc = await orgDoc(t.orgId).collection('items').doc(match.parentItemId).get();
      if (!doc.exists) parentProblem = 'proposed parent item no longer exists';
      else if (doc.data().boardId !== t.boardId) parentProblem = 'proposed parent is on another board';
      else parent = { id: doc.id, name: doc.data().name, isArchived: !!doc.data().isArchived };
    }
    const existingTable = parent
      ? (await orgDoc(t.orgId).collection('boards').doc(t.boardId).collection('groups').where('parentItemId', '==', parent.id).get()).docs[0]
      : undefined;

    plan.push({
      apply: !!parent && !parentProblem && ['exact', 'high', 'medium'].includes(match.confidence),
      orgId: t.orgId,
      boardId: t.boardId,
      boardName: t.boardName,
      tableId: t.tableId,
      parentItemId: parent?.id ?? null,
      parentItemName: parent?.name ?? null,
      confidence: parentProblem ? 'none' : match.confidence,
      evidence: parentProblem ? [...match.evidence, parentProblem] : match.evidence,
      mergeIntoExistingTable: existingTable?.id ?? null,
      subitems: t.subitems.map((s) => ({ id: s.id, name: s.name, isArchived: !!s.isArchived })),
      columns: planColumns(t.subitems, userIds, t.mirroredHours),
    });
  }

  fs.writeFileSync(out, JSON.stringify(plan, null, 2));
  for (const p of plan) {
    console.log(`\n[${p.apply ? 'WILL RESTORE' : 'NEEDS YOU   '}] board "${p.boardName}" — table ${p.tableId} (${p.subitems.length} subitems: ${p.subitems.slice(0, 3).map((s) => `"${s.name}"`).join(', ')}${p.subitems.length > 3 ? ', …' : ''})`);
    console.log(`   parent: ${p.parentItemId ? `"${p.parentItemName}" (${p.parentItemId})` : '— not found —'}   confidence: ${p.confidence}${p.mergeIntoExistingTable ? '   (parent already has a subitem table → will merge)' : ''}`);
    for (const e of p.evidence) console.log(`   · ${e}`);
    console.log(`   columns: ${p.columns.map((c) => `${c.name} [${c.type}]`).join(', ') || '(no stored values)'}`);
  }
  const ready = plan.filter((p) => p.apply).length;
  console.log(`\nPlan written to ${out}: ${ready} of ${plan.length} tables ready to restore.`);
  console.log('Review it (fill in "parentItemId" / set "apply" as needed), then run: node scripts/repair-orphaned-subitems.mjs apply --in ' + out);
}

// ---------------------------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------------------------
async function apply() {
  const plan = JSON.parse(fs.readFileSync(opts.in ?? 'subitem-repair.json', 'utf8'));
  let restored = 0;
  for (const p of plan) {
    if (!p.apply || !p.parentItemId) continue;
    const board = orgDoc(p.orgId).collection('boards').doc(p.boardId);
    const parentDoc = await orgDoc(p.orgId).collection('items').doc(p.parentItemId).get();
    if (!parentDoc.exists || parentDoc.data().boardId !== p.boardId) { console.log(`skip ${p.tableId}: parent ${p.parentItemId} not found on this board`); continue; }
    if ((await board.collection('groups').doc(p.tableId).get()).exists) { console.log(`skip ${p.tableId}: table already exists`); continue; }

    const now = FieldValue.serverTimestamp();
    const existing = (await board.collection('groups').where('parentItemId', '==', p.parentItemId).get()).docs[0];
    const targetId = existing?.id ?? p.tableId;
    const batch = db.batch();

    // Columns: reuse the live table's column of the same type for Person/Status/Date/Hours log
    // when merging; otherwise recreate the recovered column under its original id.
    const liveCols = existing ? (await board.collection('columns').where('parentGroupId', '==', existing.id).get()).docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    const remap = new Map();
    let order = liveCols.length;
    for (const c of p.columns) {
      const reuse = ['person', 'status', 'date', 'hours_log'].includes(c.type) ? liveCols.find((l) => l.type === c.type) : undefined;
      if (reuse) { remap.set(c.id, reuse.id); continue; }
      batch.set(board.collection('columns').doc(c.id), {
        id: c.id, boardId: p.boardId, name: c.name, type: c.type, settings: c.settings ?? {},
        parentGroupId: targetId, order: order++, createdAt: now, updatedAt: now,
      });
    }
    // A table needs its default Person / Status / Date columns even if no subitem had a value there.
    if (!existing) {
      for (const [type, name, settings] of [['person', 'Person', { multiple: true }], ['status', 'Status', { options: DEFAULT_STATUS_OPTIONS }], ['date', 'Date', {}]]) {
        if (p.columns.some((c) => c.type === type)) continue;
        const ref = board.collection('columns').doc();
        batch.set(ref, { id: ref.id, boardId: p.boardId, name, type, settings, parentGroupId: targetId, order: order++, createdAt: now, updatedAt: now });
      }
      const groupCount = (await board.collection('groups').count().get()).data().count;
      batch.set(board.collection('groups').doc(p.tableId), {
        id: p.tableId, workspaceId: p.orgId, boardId: p.boardId, name: 'Subitems', color: '#94a3b8',
        order: groupCount, isCollapsed: false, parentItemId: p.parentItemId, createdAt: now, updatedAt: now,
      });
    }
    // Merging into a live table: move the rows there and point remapped values at its columns.
    if (existing) {
      for (const s of p.subitems) {
        const ref = orgDoc(p.orgId).collection('items').doc(s.id);
        const snap = await ref.get();
        if (!snap.exists) continue;
        const patch = { groupId: targetId, updatedAt: now };
        for (const [from, to] of remap) {
          const v = snap.data().values?.[from];
          if (v !== undefined) { patch[`values.${to}`] = v; patch[`values.${from}`] = FieldValue.delete(); }
        }
        batch.update(ref, patch);
      }
    }
    await batch.commit();
    await orgDoc(p.orgId).collection('boardVersions').doc(p.boardId).set({ lastUpdatedAt: now }, { merge: true });
    restored++;
    console.log(`restored table ${p.tableId} → "${p.parentItemName ?? p.parentItemId}"${existing ? ` (merged into ${existing.id})` : ''}: ${p.subitems.length} subitems`);
  }
  console.log(`\nDone: ${restored} tables restored.`);
}

await (command === 'report' ? report() : apply());
process.exit(0);
