import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listItems } from '../services/workManagementService';
import { queryKeys } from './queries/queryKeys';

// Polls the items query every 15s and injects results into React Query cache,
// providing near-real-time updates. Designed to be upgraded to Firestore
// onSnapshot once client-side Firebase Auth is configured.
const POLL_INTERVAL_MS = 15_000;

export function useLiveItems(boardId: string | undefined): void {
  const queryClient = useQueryClient();
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  useEffect(() => {
    if (!boardId) return;

    const params = { boardId, limit: 200 };

    const poll = async () => {
      if (!boardIdRef.current) return;
      try {
        const result = await listItems({ boardId: boardIdRef.current, limit: 200 });
        queryClient.setQueryData(queryKeys.items.list(params), result);
      } catch {
        // Silently ignore — stale data is acceptable; base query handles errors
      }
    };

    const timerId = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [boardId, queryClient]);
}
