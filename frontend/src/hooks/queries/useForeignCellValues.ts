import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../../firebase';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import { getPersonalItemValues } from '@/services/personalHubService';
import { BOARD_TOTAL_GROUP_ID, computeSummaryNumeric, evaluateFormula, extractRefs, type CellRef } from '@/utils/formulaEngine';
import { ColumnType } from '@/types';
import type { Column, Item, PaginatedResponse } from '@/types';

const FOREIGN_ITEMS_LIMIT = 500;

/**
 * Maximum board-hops a formula reference chain may traverse (the formula's own board's direct
 * references are hop 1, boards referenced by THOSE boards' formulas are hop 2, and so on). Bounds
 * a pathological reference web so a chain of formulas can't pull in an unbounded slice of the org —
 * a reference beyond the cap simply never loads and resolves as unavailable (shown as `#ref`).
 */
const MAX_HOPS = 4;

export interface ForeignValues {
  /** Resolve a ref to a number, null (known but empty/non-numeric), or undefined (loading/broken).
   *  For relative refs (itemId === null) pass the current row's item id as `currentItemId`. */
  resolve: (ref: CellRef, currentItemId?: string | null) => number | null | undefined;
  isLoading: boolean;
}

/** Every {ref:...} inside a board's SIMPLE_FORMULA columns (the column default plus each item's
 *  own override) — used to discover further boards referenced transitively through a chain of
 *  formula cells, so multi-hop cross-board formula references resolve. */
function formulaRefsInBoard(items: Item[], columns: Column[]): CellRef[] {
  const out: CellRef[] = [];
  for (const col of columns) {
    if (col.type !== ColumnType.SIMPLE_FORMULA) continue;
    const settings = col.settings as unknown as { defaultFormula?: string } | undefined;
    if (settings?.defaultFormula) out.push(...extractRefs(settings.defaultFormula));
    for (const item of items) {
      const stored = item.values[col.id];
      if (typeof stored === 'string' && stored) out.push(...extractRefs(stored));
    }
  }
  return out;
}

/**
 * Loads the data needed to resolve cross-board formula references and keeps it live.
 * Board refs load that board's items (deduped via React Query); personal-hub refs load the
 * referenced items' personal values. A Firestore listener per referenced board invalidates
 * the cached items so results recompute when a source cell changes.
 *
 * The set of boards to load isn't just the formula's direct references: when a reference points
 * at a formula cell on another board, THAT cell's own formula may reference further boards, which
 * can't be known until its board is loaded. So the load set starts at the direct references (hop 1)
 * and grows by scanning each newly-loaded board's formula columns for more references, up to
 * MAX_HOPS.
 */
export function useForeignCellValues(refs: CellRef[], orgId: string | undefined): ForeignValues {
  const qc = useQueryClient();

  const directBoardIds = useMemo(
    () => Array.from(new Set(refs.filter((r) => r.kind === 'b').map((r) => r.boardId))).sort(),
    [refs],
  );
  const directKey = directBoardIds.join(',');

  const [boardIds, setBoardIds] = useState<string[]>(directBoardIds);
  const hopRef = useRef(directBoardIds.length > 0 ? 1 : 0);

  // The formula changed (or its direct refs did) — restart the discovery closure from hop 1.
  useEffect(() => {
    setBoardIds(directBoardIds);
    hopRef.current = directBoardIds.length > 0 ? 1 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directKey]);

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

  // Columns for every referenced board — needed to (a) type group-summary aggregation and
  // (b) detect when a ref points to a SIMPLE_FORMULA cell so it can be evaluated to its value
  // (a foreign board exposes only the stored formula text, so we must compute it ourselves).
  const columnQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.columns.board(boardId),
      queryFn: () => wm.listColumns(boardId),
      enabled: !!boardId,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const boardColumnsMap = useMemo(() => {
    const m = new Map<string, Column[]>();
    boardIds.forEach((boardId, i) => {
      const cols = columnQueries[i]?.data as Column[] | undefined;
      if (cols) m.set(boardId, cols);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, columnQueries]);

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

  // Grow the load set: once the current hop's boards have all loaded, scan their formula columns
  // for references to boards not yet in the set. Each pass that finds new boards advances one hop;
  // the loop stops naturally when a pass finds nothing new, or at MAX_HOPS.
  useEffect(() => {
    if (hopRef.current === 0 || hopRef.current >= MAX_HOPS) return;
    if (boardIds.length === 0) return;
    const allSettled = boardQueries.every((q) => !q.isLoading) && columnQueries.every((q) => !q.isLoading);
    if (!allSettled) return;

    const known = new Set(boardIds);
    const discovered = new Set<string>();
    for (const boardId of boardIds) {
      const items = boardItemsList.get(boardId);
      const cols = boardColumnsMap.get(boardId);
      if (!items || !cols) continue;
      for (const r of formulaRefsInBoard(items, cols)) {
        if (r.kind === 'b' && r.boardId && !known.has(r.boardId)) discovered.add(r.boardId);
      }
    }
    if (discovered.size > 0) {
      hopRef.current += 1;
      setBoardIds((prev) => Array.from(new Set([...prev, ...discovered])).sort());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, boardQueries, columnQueries, boardItemsList, boardColumnsMap]);

  const personalData = personalQueries[0]?.data;
  const personalValues = useMemo(
    () => (personalData ?? {}) as Record<string, Record<string, unknown>>,
    [personalData],
  );

  const isLoading =
    boardQueries.some((q) => q.isLoading) ||
    columnQueries.some((q) => q.isLoading) ||
    (personalQueries[0]?.isLoading ?? false);

  const resolve = useCallback(
    (ref: CellRef, currentItemId?: string | null): number | null | undefined => {
      // `visited` keys the formula cells already on the resolution stack (across boards) so a
      // cross-board reference cycle (A → B → A) terminates by contributing 0 where it closes.
      const inner = (r: CellRef, cid: string | null | undefined, visited: Set<string>): number | null | undefined => {
        // Group-summary reference: aggregate a column across a group. Board columns only —
        // personal-hub summaries are resolved locally on the Personal Hub, not cross-context.
        if (r.agg) {
          if (r.kind !== 'b') return undefined;
          const items = boardItemsList.get(r.boardId);
          const colType = boardColumnsMap.get(r.boardId)?.find((c) => c.id === r.columnId)?.type;
          if (!items || !colType) return undefined; // board items/columns not loaded yet
          if (colType === ColumnType.SIMPLE_FORMULA) return undefined; // loop guard
          const rows = r.groupId === BOARD_TOTAL_GROUP_ID ? items : items.filter((i) => i.groupId === r.groupId);
          return computeSummaryNumeric(rows, colType, r.columnId, r.agg);
        }

        const itemId = r.itemId ?? cid ?? null;
        if (!itemId) return undefined;

        if (r.kind === 'b') {
          const cols = boardColumnsMap.get(r.boardId);
          if (!cols) return undefined; // columns not loaded yet (or beyond MAX_HOPS — never will)
          const col = cols.find((c) => c.id === r.columnId);

          // A reference to a formula cell on another board: evaluate its formula to its live value,
          // in that board's own row/column context. Same-board refs inside it resolve locally;
          // any further foreign refs recurse through `inner` (carrying the cycle guard) — resolved
          // as long as that board made it into the discovered load set (within MAX_HOPS).
          if (col?.type === ColumnType.SIMPLE_FORMULA) {
            const items = boardItemsList.get(r.boardId);
            if (!items) return undefined;
            const idx = items.findIndex((it) => it.id === itemId);
            if (idx < 0) return undefined;
            const key = `${r.boardId}:${r.columnId}:${itemId}`;
            if (visited.has(key)) return null; // cross-board cycle → contributes 0
            const nextVisited = new Set(visited);
            nextVisited.add(key);
            const stored = items[idx].values[r.columnId];
            const settings = col.settings as unknown as { defaultFormula?: string } | undefined;
            const formula = typeof stored === 'string' ? stored : (settings?.defaultFormula ?? '');
            if (!formula.trim()) return null;
            return evaluateFormula(formula, {}, {
              allItems: items,
              columns: cols,
              currentRowIndex: idx,
              homeBoardId: r.boardId,
              resolveRef: (rr) => inner(rr, items[idx].id, nextVisited),
            });
          }

          const map = boardItemMap.get(r.boardId);
          if (!map || !map.has(itemId)) return undefined; // not loaded yet, or deleted
          const raw = map.get(itemId)![r.columnId];
          if (raw == null || raw === '') return null;
          const n = Number(raw);
          return isNaN(n) ? null : n;
        }

        const row = personalValues[itemId];
        if (!row) return undefined;
        const raw = row[r.columnId];
        if (raw == null || raw === '') return null;
        const n = Number(raw);
        return isNaN(n) ? null : n;
      };

      return inner(ref, currentItemId, new Set<string>());
    },
    [boardItemMap, boardItemsList, boardColumnsMap, personalValues],
  );

  return { resolve, isLoading };
}
