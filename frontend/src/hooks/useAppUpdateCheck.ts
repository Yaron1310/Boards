import { useCallback, useEffect, useState } from 'react';

/** How often an open tab checks for a newer build, besides whenever it regains focus. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Reports whether a newer build of the app has been deployed since this tab loaded.
 *
 * Each build writes /version.json carrying its buildId (see vite.config.ts), and the same id
 * is baked into the bundle as __BUILD_ID__. This polls that file — a tiny static file served
 * by the hosting CDN, not a backend call — when the tab becomes visible again and every
 * 15 minutes, and flags an update once the ids differ. Dev builds have no version.json, so
 * the check only runs in production.
 */
export function useAppUpdateCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const { buildId } = (await res.json()) as { buildId?: string };
      if (buildId && buildId !== __BUILD_ID__) setUpdateAvailable(true);
    } catch {
      // Offline or a transient failure — the next check will try again.
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV || updateAvailable) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearInterval(timer);
    };
  }, [check, updateAvailable]);

  return updateAvailable;
}
