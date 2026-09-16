import React from 'react';

/**
 * Deploy-safe wrapper around React.lazy.
 *
 * Vite content-hashes every async chunk, and Firebase Hosting serves each release
 * as an exact file set — so the moment a new version is deployed, the hashed chunk
 * filenames baked into an already-open tab's index.html stop existing. When the user
 * then navigates to a lazy route, the dynamic import fails. Worse, the SPA rewrite in
 * firebase.json ("**" -> /index.html) means the missing .js file comes back as HTTP 200
 * with index.html's HTML body, so the browser reports a MIME type error rather than a 404.
 *
 * React.lazy permanently caches a rejected import: once it fails, the component re-throws
 * the same error on every subsequent render for the life of the document. No amount of
 * client-side navigation recovers it — only a full page load does.
 *
 * This wrapper does two things:
 *   1. Retries the import once, so a transient network blip doesn't surface as an error.
 *   2. Tags a second failure as a ChunkLoadError, which ErrorBoundary renders as an
 *      explicit "a new version was released, reload to continue" prompt.
 *
 * It deliberately never reloads the page by itself. An automatic reload here could
 * discard unsaved work (in-flight mutations, provider-level draft state), so the
 * decision to reload always belongs to the user.
 *
 * Caveat on the retry: per the HTML spec a module that fails to load is recorded in the
 * document's module map, and some browsers will not re-request the same specifier. The
 * retry is therefore best-effort — it helps where the browser does re-fetch, and costs
 * one short delay where it doesn't. The user-facing prompt in step 2 is the real fix.
 */

const RETRY_DELAY_MS = 400;

export class ChunkLoadError extends Error {
  /** Discriminator so ErrorBoundary can identify this across chunk boundaries. */
  readonly isChunkLoadError = true;

  constructor(public readonly originalError: unknown) {
    super(
      originalError instanceof Error
        ? `Failed to load application chunk: ${originalError.message}`
        : 'Failed to load application chunk',
    );
    this.name = 'ChunkLoadError';
  }
}

export function isChunkLoadError(error: unknown): error is ChunkLoadError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isChunkLoadError?: boolean }).isChunkLoadError === true
  );
}

/**
 * Heuristic for "this looks like a missing/stale chunk" rather than a genuine module
 * evaluation error. A module that loads but throws while executing must NOT be swallowed
 * and reported as a stale deploy — that would hide real bugs behind a reload prompt.
 */
function looksLikeFailedFetch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /failed to load module script/i.test(message) ||
    /expected a javascript(-or-wasm)? module script/i.test(message) ||
    /'text\/html' is not a valid javascript mime type/i.test(message) ||
    /importing a module script failed/i.test(message) ||
    /unable to preload css/i.test(message) ||
    // Chrome/Safari wording when the module map already holds a failed entry.
    /dynamically imported module/i.test(message)
  );
}

type ComponentModule<T extends React.ComponentType<never>> = { default: T };

export function lazyWithRetry<T extends React.ComponentType<never>>(
  factory: () => Promise<ComponentModule<T>>,
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (firstError) {
      if (!looksLikeFailedFetch(firstError)) {
        // A real error inside the module — surface it untouched.
        throw firstError;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

      try {
        return await factory();
      } catch (secondError) {
        throw new ChunkLoadError(secondError);
      }
    }
  });
}
