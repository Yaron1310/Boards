import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getBoardVersion } from '../services/workManagementService';
import { queryKeys } from './queries/queryKeys';

const CHECK_INTERVAL_MS = 20_000;
const INACTIVE_THRESHOLD_MS = 60_000;
const INTERACTION_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const lsKey = (boardId: string) => `board_version_${boardId}`;

/**
 * ETag-style live updates: every 20s (while the user is active within the last
 * 60s) fetches a single lightweight version timestamp from the backend.
 * Only invalidates items + groups queries when the server timestamp is newer
 * than the locally stored one — skipping the full fetch entirely when nothing
 * has changed.
 *
 * Cost: ~1 Firestore read per check (vs 60+ reads per check for blind polling).
 */
export function useLiveBoardVersion(boardId: string | undefined): void {
  const queryClient = useQueryClient();
  const lastInteractionRef = useRef(Date.now());
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  // Track any user interaction to determine "active" state
  useEffect(() => {
    const markActive = () => { lastInteractionRef.current = Date.now(); };
    INTERACTION_EVENTS.forEach((e) =>
      document.addEventListener(e, markActive, { passive: true }),
    );
    return () => {
      INTERACTION_EVENTS.forEach((e) =>
        document.removeEventListener(e, markActive),
      );
    };
  }, []);

  useEffect(() => {
    if (!boardId) return;

    // On mount: store the current server version as our baseline so the first
    // interval check doesn't trigger a redundant full refetch.
    getBoardVersion(boardId)
      .then(({ lastUpdatedAt }) => {
        if (lastUpdatedAt) localStorage.setItem(lsKey(boardId), lastUpdatedAt);
      })
      .catch(() => { /* non-critical */ });

    const checkVersion = async () => {
      const bid = boardIdRef.current;
      if (!bid) return;

      // Skip the check entirely if the user has been inactive for >60s
      if (Date.now() - lastInteractionRef.current > INACTIVE_THRESHOLD_MS) return;

      try {
        const { lastUpdatedAt } = await getBoardVersion(bid);
        if (!lastUpdatedAt) return;

        const stored = localStorage.getItem(lsKey(bid));

        // Only invalidate when the server version is strictly newer
        if (!stored || new Date(lastUpdatedAt) > new Date(stored)) {
          void queryClient.invalidateQueries({ queryKey: ['items'] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all(bid) });
          localStorage.setItem(lsKey(bid), lastUpdatedAt);
        }
      } catch {
        // Network errors are acceptable — stale data is fine until next check
      }
    };

    const timerId = setInterval(() => { void checkVersion(); }, CHECK_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [boardId, queryClient]);
}
