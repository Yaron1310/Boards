import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listGroups } from '../services/workManagementService';
import { queryKeys } from './queries/queryKeys';

// Polls the groups query every 20s and injects results into React Query cache.
// Designed to be upgraded to Firestore onSnapshot once client-side Firebase Auth
// is configured.
const POLL_INTERVAL_MS = 20_000;

export function useLiveGroups(boardId: string | undefined): void {
  const queryClient = useQueryClient();
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  useEffect(() => {
    if (!boardId) return;

    const poll = async () => {
      if (!boardIdRef.current) return;
      try {
        const groups = await listGroups(boardIdRef.current);
        queryClient.setQueryData(queryKeys.groups.all(boardIdRef.current), groups);
      } catch {
        // Silently ignore — stale data is acceptable; base query handles errors
      }
    };

    const timerId = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [boardId, queryClient]);
}
