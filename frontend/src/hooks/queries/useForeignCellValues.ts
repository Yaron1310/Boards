import { useCallback, useEffect, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../../firebase';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import { getPersonalItemValues } from '@/services/personalHubService';
import { aggregateSummary, type CellRef } from '@/utils/formulaEngine';
import type { Item, PaginatedResponse } from '@/types';

const FOREIGN_ITEMS_LIMIT = 500;

export interface ForeignValues {
  /** Resolve a ref to a number, null (known but empty/non-numeric), or undefined (loading/broken).
   *  For relative refs (itemId === null) pass the current row's item id as `currentItemId`. */
  resolve: (ref: CellRef, currentItemId?: string | null) => number | null | undefined;
  isLoading: boolean;
}

/**
 * Loads the data needed to resolve cross-board formula references and keeps it live.
 * Board refs load that board's items (deduped via React Query); personal-hub refs load the
 * referenced items' personal values. A Firestore listener per referenced board invalidates
 * the cached items so results recompute when a source cell changes.
 */
export function useForeignCellValues(refs: CellRef[], orgId: string | undefined): ForeignValues {
  const qc = useQueryClient();

  const boardIds = useMemo(
    () => Array.from(new Set(refs.filter((r) => r.kind === 'b').map((r) => r.boardId))).sort(),
    [refs],
  );
  const personalItemIds = useMemo(
    () =>
      Array.from(
        new Set(refs.filter((r) => r.kind === 'p').map((r) => r.itemId).filter((x): x is string => !!x)),
      ).sort(),
    [refs],
  );
  const boardKey = boardIds.join(',');

  const boardQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.items.list({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      queryFn: () => wm.listItems({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      enabled: !!boardId,
      staleTime: 60 * 1000,
    })),
  });

  const personalQueries = useQueries({
    queries: [
      {
        queryKey: queryKeys.personalHub.itemValues(personalItemIds),
        queryFn: () => getPersonalItemValues(personalItemIds),
        enabled: personalItemIds.length > 0,
        staleTime: 60 * 1000,
      },
    ],
  });

  // Live recompute: subscribe to each referenced board's items collection and invalidate its
  // cached list so the queries above refetch. Waits for Firebase Auth (same reason as useBoardSnapshot).
  useEffect(() => {
    if (!orgId || boardIds.length === 0) return;
    let unsubs: Array<() => void> = [];

    const open = () => {
      unsubs = boardIds.map((boardId) => {
        const itemsQuery = query(
          collection(firestoreDb, `organizations/${orgId}/items`),
          where('boardId', '==', boardId),
        );
        return onSnapshot(
          itemsQuery,
          () => {
            void qc.invalidateQueries({
              predicate: (q) => {
                const k = q.queryKey;
                return (
                  Array.isArray(k) &&
                  k[0] === 'items' &&
                  typeof k[1] === 'object' &&
                  k[1] !== null &&
                  (k[1] as { boardId?: string }).boardId === boardId
                );
              },
            });
          },
          () => {},
        );
      });
    };
    const close = () => {
      unsubs.forEach((u) => u());
      unsubs = [];
    };

    const unsubAuth = onAuthStateChanged(firebaseAuth, (u) => {
      close();
      if (u) open();
    });
    return () => {
      unsubAuth();
      close();
    };
    // boardKey is a stable string form of boardIds — the effect only cares about the set of boards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, boardKey, qc]);

  const boardItemMap = useMemo(() => {
    const m = new Map<string, Map<string, Record<string, unknown>>>();
    boardIds.forEach((boardId, i) => {
      const data = boardQueries[i]?.data as PaginatedResponse<Item> | undefined;
      if (!data) return;
      const inner = new Map<string, Record<string, unknown>>();
      data.data.forEach((it) => inner.set(it.id, it.values ?? {}));
      m.set(boardId, inner);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, boardQueries]);

  // Full item lists per board, kept for group-summary aggregation (needs groupId).
  const boardItemsList = useMemo(() => {
    const m = new Map<string, Item[]>();
    boardIds.forEach((boardId, i) => {
      const data = boardQueries[i]?.data as PaginatedResponse<Item> | undefined;
      if (data) m.set(boardId, data.data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, boardQueries]);

  const personalData = personalQueries[0]?.data;
  const personalValues = useMemo(
    () => (personalData ?? {}) as Record<string, Record<string, unknown>>,
    [personalData],
  );

  const isLoading =
    boardQueries.some((q) => q.isLoading) || (personalQueries[0]?.isLoading ?? false);

  const resolve = useCallback(
    (ref: CellRef, currentItemId?: string | null): number | null | undefined => {
      // Group-summary reference: aggregate a NUMBER column across a group (board columns only).
      if (ref.agg) {
        if (ref.kind !== 'b') return undefined;
        const items = boardItemsList.get(ref.boardId);
        if (!items) return undefined; // board not loaded yet
        const vals = items
          .filter((i) => i.groupId === ref.groupId)
          .map((i) => i.values?.[ref.columnId])
          .filter((v) => v != null && v !== '')
          .map((v) => Number(v))
          .filter((n) => !isNaN(n));
        return aggregateSummary(vals, ref.agg);
      }

      const itemId = ref.itemId ?? currentItemId ?? null;
      if (!itemId) return undefined;

      let raw: unknown;
      if (ref.kind === 'b') {
        const inner = boardItemMap.get(ref.boardId);
        if (!inner || !inner.has(itemId)) return undefined; // not loaded yet, or deleted
        raw = inner.get(itemId)![ref.columnId];
      } else {
        const row = personalValues[itemId];
        if (!row) return undefined;
        raw = row[ref.columnId];
      }
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      return isNaN(n) ? null : n;
    },
    [boardItemMap, boardItemsList, personalValues],
  );

  return { resolve, isLoading };
}
