import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { collection, doc, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../../firebase';
import { queryKeys } from './queryKeys';
import { useAuth } from '../useAuth';
import * as wm from '@/services/workManagementService';
import { getPersonalItemValues, listPersonalColumns } from '@/services/personalHubService';
import { getPersonalHubTemplateTotal, getPersonalHubTemplateItemTotal, getPersonalHubTemplateItemTotalsBatch } from '@/services/geminiService';
import { aggregateSummary, BOARD_TOTAL_GROUP_ID, HUB_ROWS_GROUP_ID, computeSummaryNumeric, evaluateFormula, extractRefs, hasAbsolutePositionalRefs, serializeRef, type CellRef } from '@/utils/formulaEngine';
import { hubGridColumns, hubRowOrder, makePersonalFormulaEvaluator } from '@/utils/personalHubGrid';
import { formulaLog, formulaRefLog, sameColumnTrace } from '@/utils/formulaDebug';
import { ColumnType } from '@/types';
import type { Column, Group, Item, PaginatedResponse, PersonalColumn } from '@/types';

const FOREIGN_ITEMS_LIMIT = 500;

/** Stands in for "the viewer's own hub" in the per-owner maps, where `undefined` can't be a key. */
const SELF_OWNER = 'self';

/**
 * Maximum board-hops a formula reference chain may traverse (the formula's own board's direct
 * references are hop 1, boards referenced by THOSE boards' formulas are hop 2, and so on). Bounds
 * a pathological reference web so a chain of formulas can't pull in an unbounded slice of the org —
 * a reference beyond the cap simply never loads and resolves as unavailable (shown as `#ref`).
 */
const MAX_HOPS = 4;

/** Above this many distinct items for one item-scoped Personal Hub template column, fetch every
 *  item's total in a single batched request instead of one request per item — worthwhile once a
 *  column has enough rows that per-item requests would otherwise fan out heavily, not worth the
 *  extra code path below it (individual per-item requests cache more precisely and are simpler). */
const ITEM_TOTAL_BATCH_THRESHOLD = 40;

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
/**
 * `contextItemIds`: the item id(s) `resolve()` might be called with as `currentItemId` — needed
 * up front only for 'ph' refs scoped `phScope: 'item'`, since their per-item total has to be
 * fetched per (templateColumnId, itemId) pair and `resolve()` itself must return synchronously
 * from already-loaded data. Callers that only ever resolve against one row (e.g. a single formula
 * cell) pass that one id; a caller that evaluates the same formula across many rows (e.g. a group
 * summary footer) passes all of them.
 */
export function useForeignCellValues(refs: CellRef[], orgId: string | undefined, contextItemIds: string[] = []): ForeignValues {
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

  const { user } = useAuth();
  const viewerId = (user as { id?: string } | null | undefined)?.id;

  /**
   * References found inside OTHER boards' formula cells. A formula on board B may itself read a
   * Personal Hub value, and evaluating B's cell here means resolving that too — but it isn't in
   * the formula being displayed, so nothing would otherwise load it and the term would quietly
   * contribute 0, handing back a smaller number that looks perfectly plausible. Discovered by the
   * effect below once a board's items and columns are in, and folded into the loading sets that
   * follow exactly as if they had been written in the formula directly.
   */
  const [nestedRefs, setNestedRefs] = useState<CellRef[]>([]);
  /** Row ids of the boards those nested references were found on — what a row-relative one
   *  ({ref:p:…:@}) resolves against, since it means "the row this formula is evaluated for". */
  const [nestedRowIds, setNestedRowIds] = useState<string[]>([]);

  const allRefs = useMemo(() => [...refs, ...nestedRefs], [refs, nestedRefs]);

  // Every Personal Hub a reference points at. `undefined` (the viewer's own) is the common case
  // and is kept as the literal 'self' so it shares one cache entry with the Hub page itself; an
  // explicit owner appears only on references picked from someone else's hub.
  const personalOwners = useMemo(() => {
    const owners = new Set<string>();
    for (const r of allRefs) {
      if (r.kind !== 'p') continue;
      owners.add(r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER);
    }
    return Array.from(owners).sort();
  }, [allRefs, viewerId]);
  const personalOwnersKey = personalOwners.join(',');
  /** The `userId` argument the personal-hub endpoints want: omitted for your own hub. */
  const ownerParam = (owner: string): string | undefined => (owner === SELF_OWNER ? undefined : owner);

  const personalItemIdsByOwner = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (owner: string, itemId: string) => {
      const list = m.get(owner) ?? [];
      if (!list.includes(itemId)) list.push(itemId);
      m.set(owner, list);
    };
    for (const r of allRefs) {
      if (r.kind !== 'p') continue;
      const owner = r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER;
      if (r.itemId) add(owner, r.itemId);
      // A row-relative personal reference names no item: it resolves against whichever row is
      // being evaluated, so every row of the boards it was found on is a candidate.
      else if (!r.agg) nestedRowIds.forEach((id) => add(owner, id));
    }
    m.forEach((ids) => ids.sort());
    return m;
  }, [allRefs, nestedRowIds, viewerId]);

  // Hubs that need their whole table reconstructed, not just a named cell: a summary covers a
  // slice of a hub, so resolving one away from the Hub page means loading that hub's assigned
  // items, values and column definitions.
  const summaryOwners = useMemo(() => {
    const owners = new Set<string>();
    for (const r of allRefs) {
      const isPersonalSummary = r.kind === 'p' && !!r.agg;
      const isHubRowsSummary = r.kind === 'b' && !!r.agg && r.groupId === HUB_ROWS_GROUP_ID;
      if (!isPersonalSummary && !isHubRowsSummary) continue;
      owners.add(r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER);
    }
    return Array.from(owners).sort();
  }, [allRefs, viewerId]);
  const summaryOwnersKey = summaryOwners.join(',');

  // Another user's hub is admin-only server-side, so for a viewer without that access these
  // simply fail and every reference into that hub reads as unavailable — which is the intended
  // outcome, not something to retry into.
  const hubItemsQueries = useQueries({
    queries: summaryOwners.map((owner) => {
      const assignee = ownerParam(owner) ?? viewerId;
      return {
        queryKey: queryKeys.items.list({ assignee, limit: FOREIGN_ITEMS_LIMIT }),
        queryFn: () => wm.listItems({ assignee, limit: FOREIGN_ITEMS_LIMIT }),
        enabled: !!assignee,
        staleTime: 60 * 1000,
        retry: owner === SELF_OWNER ? undefined : false,
      };
    }),
  });
  const hubItemsByOwner = useMemo(() => {
    const m = new Map<string, Item[]>();
    summaryOwners.forEach((owner, i) => {
      m.set(owner, (hubItemsQueries[i]?.data as PaginatedResponse<Item> | undefined)?.data ?? []);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryOwnersKey, hubItemsQueries]);

  const hubValuesQueries = useQueries({
    queries: summaryOwners.map((owner) => {
      const ids = (hubItemsByOwner.get(owner) ?? []).map((i) => i.id).sort();
      return {
        queryKey: queryKeys.personalHub.itemValues(ids, ownerParam(owner)),
        queryFn: () => getPersonalItemValues(ids, ownerParam(owner)),
        enabled: ids.length > 0,
        staleTime: 60 * 1000,
        retry: owner === SELF_OWNER ? undefined : false,
      };
    }),
  });
  const hubValuesByOwner = useMemo(() => {
    const m = new Map<string, Record<string, Record<string, unknown>>>();
    summaryOwners.forEach((owner, i) => {
      const data = hubValuesQueries[i]?.data as Record<string, Record<string, unknown>> | undefined;
      if (data) m.set(owner, data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryOwnersKey, hubValuesQueries]);

  // Boards whose hub footer is referenced. Working out which rows such a footer covers needs the
  // board's groups: an assigned SUBITEM isn't shown as its own row in a hub — its hosting item is
  // shown instead — and a group knows whether it belongs to a parent item.
  const hubRowsBoardIds = useMemo(
    () => Array.from(new Set(
      allRefs.filter((r) => r.kind === 'b' && r.agg && r.groupId === HUB_ROWS_GROUP_ID).map((r) => r.boardId),
    )).sort(),
    [allRefs],
  );
  const hubRowsBoardKey = hubRowsBoardIds.join(',');

  const hubGroupQueries = useQueries({
    queries: hubRowsBoardIds.map((boardId) => ({
      queryKey: queryKeys.groups.all(boardId),
      queryFn: () => wm.listGroups(boardId, false),
      enabled: !!boardId,
      staleTime: 2 * 60 * 1000,
    })),
  });
  const hubGroupsByBoard = useMemo(() => {
    const m = new Map<string, Map<string, Group>>();
    hubRowsBoardIds.forEach((boardId, i) => {
      const groups = hubGroupQueries[i]?.data as Group[] | undefined;
      if (!groups) return;
      m.set(boardId, new Map(groups.map((g) => [g.id, g])));
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubRowsBoardKey, hubGroupQueries]);

  const personalColumnsQueries = useQueries({
    queries: personalOwners.map((owner) => ({
      queryKey: queryKeys.personalHub.columns(ownerParam(owner)),
      queryFn: () => listPersonalColumns(ownerParam(owner)),
      staleTime: 60 * 1000,
      retry: owner === SELF_OWNER ? undefined : false,
    })),
  });
  const personalColumnsByOwner = useMemo(() => {
    const m = new Map<string, PersonalColumn[]>();
    personalOwners.forEach((owner, i) => {
      const data = personalColumnsQueries[i]?.data as PersonalColumn[] | undefined;
      if (data) m.set(owner, data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalOwnersKey, personalColumnsQueries]);

  // Trace what each hub's loads are doing — a personal summary can only resolve once all three
  // have landed, so this is where to look first when a token stays at "…".
  useEffect(() => {
    if (personalOwners.length === 0) return;
    formulaLog('personal hub data', {
      page: typeof location !== 'undefined' ? location.pathname : '(unknown)',
      viewerId: viewerId ?? '(none)',
      hubs: personalOwners.map((owner) => {
        const si = summaryOwners.indexOf(owner);
        return {
          hub: owner === SELF_OWNER ? 'your own' : owner,
          columns: { status: personalColumnsQueries[personalOwners.indexOf(owner)]?.status, count: personalColumnsByOwner.get(owner)?.length ?? 0 },
          assignedItems: si < 0 ? '(not needed — no summary ref)' : { status: hubItemsQueries[si]?.status, count: hubItemsByOwner.get(owner)?.length ?? 0 },
          values: si < 0 ? '(not needed — no summary ref)' : { status: hubValuesQueries[si]?.status, items: Object.keys(hubValuesByOwner.get(owner) ?? {}).length },
        };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalOwnersKey, summaryOwnersKey, viewerId, personalColumnsByOwner, hubItemsByOwner, hubValuesByOwner]);

  // Personal Hub template totals — org-wide running sums, not tied to any board. Referenced by
  // templateColumnId (held in `columnId` for 'ph' refs). Global (whole-org) scope only here —
  // 'item'-scoped refs are handled separately below, since they need a (templateColumnId, itemId)
  // pair rather than just a templateColumnId.
  const templateColumnIds = useMemo(
    () => Array.from(new Set(allRefs.filter((r) => r.kind === 'ph' && r.phScope !== 'item').map((r) => r.columnId))).sort(),
    [allRefs],
  );
  const templateTotalQueries = useQueries({
    queries: templateColumnIds.map((templateColumnId) => ({
      queryKey: queryKeys.personalHubTemplateTotals.one(templateColumnId),
      queryFn: () => getPersonalHubTemplateTotal(templateColumnId),
      enabled: !!templateColumnId,
      staleTime: 30 * 1000,
    })),
  });
  const templateTotalsMap = useMemo(() => {
    const m = new Map<string, { total: number; frozen: boolean }>();
    templateColumnIds.forEach((id, i) => {
      const data = templateTotalQueries[i]?.data;
      if (data) m.set(id, data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateColumnIds.join(','), templateTotalQueries]);

  // Live recompute: subscribe to each referenced template total doc so a value change anywhere
  // in the org invalidates the cached total and refetches it.
  useEffect(() => {
    if (!orgId || templateColumnIds.length === 0) return;
    let unsubs: Array<() => void> = [];

    const open = () => {
      unsubs = templateColumnIds.map((templateColumnId) => {
        const totalDocRef = doc(firestoreDb, `organizations/${orgId}/personalHubTemplateTotals/${templateColumnId}`);
        return onSnapshot(
          totalDocRef,
          () => {
            void qc.invalidateQueries({ queryKey: queryKeys.personalHubTemplateTotals.one(templateColumnId) });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, templateColumnIds.join(','), qc]);

  // 'item'-scoped template totals: computed on demand per (templateColumnId, itemId), not a
  // maintained counter, so there's no single doc to live-subscribe to — polled instead. Every
  // item-scoped template column referenced, paired with the distinct item ids the caller says it
  // might resolve against.
  const itemScopedTemplateColumnIds = useMemo(
    () => Array.from(new Set(allRefs.filter((r) => r.kind === 'ph' && r.phScope === 'item').map((r) => r.columnId))).sort(),
    [allRefs],
  );
  const dedupedContextItemIds = useMemo(
    () => Array.from(new Set([...contextItemIds, ...nestedRowIds].filter((id): id is string => !!id))).sort(),
    [contextItemIds, nestedRowIds],
  );

  // Past the threshold, fetch one column's worth of item totals in a single request instead of
  // fanning out one request per item — e.g. a formula column with many rows all sharing the same
  // default formula. Below it, per-item requests are simpler and cache more precisely, so keep them.
  const useBatchFetch = dedupedContextItemIds.length > ITEM_TOTAL_BATCH_THRESHOLD;

  const batchQueries = useQueries({
    queries: (useBatchFetch ? itemScopedTemplateColumnIds : []).map((templateColumnId) => ({
      queryKey: queryKeys.personalHubTemplateTotals.batchForItems(templateColumnId, dedupedContextItemIds),
      queryFn: () => getPersonalHubTemplateItemTotalsBatch(templateColumnId, dedupedContextItemIds),
      staleTime: 60 * 1000,
      refetchInterval: 60 * 1000,
      refetchOnMount: 'always' as const,
      enabled: dedupedContextItemIds.length > 0,
    })),
  });

  const itemTotalPairs = useMemo(() => {
    if (useBatchFetch || itemScopedTemplateColumnIds.length === 0 || dedupedContextItemIds.length === 0) {
      return [] as Array<{ templateColumnId: string; itemId: string }>;
    }
    const pairs: Array<{ templateColumnId: string; itemId: string }> = [];
    for (const templateColumnId of itemScopedTemplateColumnIds) {
      for (const itemId of dedupedContextItemIds) pairs.push({ templateColumnId, itemId });
    }
    return pairs;
  }, [useBatchFetch, itemScopedTemplateColumnIds, dedupedContextItemIds]);
  const itemTotalPairsKey = itemTotalPairs.map((p) => `${p.templateColumnId}:${p.itemId}`).join(',');

  const itemTotalQueries = useQueries({
    queries: itemTotalPairs.map(({ templateColumnId, itemId }) => ({
      queryKey: queryKeys.personalHubTemplateTotals.oneForItem(templateColumnId, itemId),
      queryFn: () => getPersonalHubTemplateItemTotal(templateColumnId, itemId),
      staleTime: 60 * 1000,
      refetchInterval: 60 * 1000,
      // Without this, navigating back to a board within `staleTime` of the last fetch reuses
      // the cached (possibly outdated) total instead of checking the server — refetchOnMount
      // 'always' forces every mount (e.g. returning from another board) to fetch fresh.
      refetchOnMount: 'always' as const,
    })),
  });
  const itemTotalsMap = useMemo(() => {
    const m = new Map<string, number>();
    if (useBatchFetch) {
      itemScopedTemplateColumnIds.forEach((templateColumnId, i) => {
        const totals = batchQueries[i]?.data?.totals;
        if (!totals) return;
        Object.entries(totals).forEach(([itemId, total]) => m.set(`${templateColumnId}:${itemId}`, total));
      });
      return m;
    }
    itemTotalPairs.forEach(({ templateColumnId, itemId }, i) => {
      const data = itemTotalQueries[i]?.data;
      if (data) m.set(`${templateColumnId}:${itemId}`, data.total);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBatchFetch, itemScopedTemplateColumnIds.join(','), batchQueries, itemTotalPairsKey, itemTotalQueries]);

  const boardKey = boardIds.join(',');

  const boardQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.items.list({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      queryFn: () => wm.listItems({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      enabled: !!boardId,
      staleTime: 60 * 1000,
    })),
  });

  // Named-cell personal references, fetched per hub they point at.
  const personalQueries = useQueries({
    queries: personalOwners.map((owner) => {
      const ids = personalItemIdsByOwner.get(owner) ?? [];
      return {
        queryKey: queryKeys.personalHub.itemValues(ids, ownerParam(owner)),
        queryFn: () => getPersonalItemValues(ids, ownerParam(owner)),
        enabled: ids.length > 0,
        staleTime: 60 * 1000,
        retry: owner === SELF_OWNER ? undefined : false,
      };
    }),
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

  // Personal Hub and template references living inside those boards' formula cells. Board
  // references drive the hop expansion above; these drive the personal/template loading sets, so
  // that a formula reading someone's hub value still resolves it when reached through another
  // board's cell rather than written in the formula on screen.
  useEffect(() => {
    const found: CellRef[] = [];
    const rowIds = new Set<string>();
    for (const boardId of boardIds) {
      const items = boardItemsList.get(boardId);
      const cols = boardColumnsMap.get(boardId);
      if (!items || !cols) continue;
      let anyHere = false;
      for (const r of formulaRefsInBoard(items, cols)) {
        if (r.kind === 'b') continue;
        found.push(r);
        anyHere = true;
      }
      if (anyHere) items.forEach((i) => rowIds.add(i.id));
    }
    const nextRefs = found.map((r) => serializeRef(r)).sort().join('|');
    const nextRows = Array.from(rowIds).sort();
    setNestedRefs((prev) => (prev.map((r) => serializeRef(r)).sort().join('|') === nextRefs ? prev : found));
    setNestedRowIds((prev) => (prev.join(',') === nextRows.join(',') ? prev : nextRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, boardItemsList, boardColumnsMap]);

  const personalValuesByOwner = useMemo(() => {
    const m = new Map<string, Record<string, Record<string, unknown>>>();
    personalOwners.forEach((owner, i) => {
      const data = personalQueries[i]?.data as Record<string, Record<string, unknown>> | undefined;
      if (data) m.set(owner, data);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalOwnersKey, personalQueries]);

  const isLoading =
    boardQueries.some((q) => q.isLoading) ||
    columnQueries.some((q) => q.isLoading) ||
    templateTotalQueries.some((q) => q.isLoading) ||
    itemTotalQueries.some((q) => q.isLoading) ||
    batchQueries.some((q) => q.isLoading) ||
    hubItemsQueries.some((q) => q.isLoading) ||
    hubValuesQueries.some((q) => q.isLoading) ||
    personalColumnsQueries.some((q) => q.isLoading) ||
    personalQueries.some((q) => q.isLoading);

  const resolve = useCallback(
    (ref: CellRef, currentItemId?: string | null): number | null | undefined => {
      // Shared by every formula evaluated while resolving this one ref, so a foreign board's
      // group summaries are aggregated once instead of once per row that references them (a
      // summary's value doesn't depend on which row is asking). The engine creates these itself
      // when a caller doesn't supply them; here one set spans the whole cross-board walk.
      const summaryCache = new Map<string, number>();
      const cycleFlag = { hit: false };

      // `visited` keys the formula cells already on the resolution stack (across boards) so a
      // cross-board reference cycle (A → B → A) terminates by contributing 0 where it closes.
      const inner = (r: CellRef, cid: string | null | undefined, visited: Set<string>): number | null | undefined => {
        // Personal Hub template total: a sum across every user's Personal Hub, not tied to any
        // board. 'global' resolves straight from the live-subscribed org-wide counter; 'item'
        // scopes it to the row currently being evaluated (cid) and resolves from the (bounded,
        // polled rather than live) per-item total instead.
        if (r.kind === 'ph') {
          if (r.phScope === 'item') {
            const itemId = cid ?? currentItemId ?? null;
            if (!itemId) return undefined;
            return itemTotalsMap.get(`${r.columnId}:${itemId}`);
          }
          const data = templateTotalsMap.get(r.columnId);
          return data ? data.total : undefined;
        }

        // A Personal Hub summary: aggregate the viewer's own hub rows — every board's for the
        // whole-hub total, one board's for a board group's footer, matching the row set the cell
        // itself shows.
        if (r.agg && r.kind === 'p') {
          const owner = r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER;
          const personalColumnDefs = personalColumnsByOwner.get(owner);
          const hubItems = hubItemsByOwner.get(owner) ?? [];
          const col = personalColumnDefs?.find((c) => c.id === r.columnId);
          const hubValues = hubValuesByOwner.get(owner);
          if (!col || !hubValues) {
            formulaRefLog(serializeRef(r), 'unresolved',
              !personalColumnDefs ? 'your personal columns have not loaded'
                : !col ? 'no personal column has this id'
                : 'your personal values have not loaded',
              {
                page: typeof location !== 'undefined' ? location.pathname : '(unknown)',
                hub: owner === SELF_OWNER ? 'your own' : owner,
                lookingForColumnId: r.columnId,
                columnsInThatHub: (personalColumnDefs ?? []).map((c) => `${c.name}=${c.id}`).join(' | ') || '(none)',
                assignedItemsLoaded: hubItems.length,
                valuesLoaded: !!hubValues,
              });
            return undefined;
          }
          const scoped = (r.groupId === BOARD_TOTAL_GROUP_ID
            ? hubItems
            : hubItems.filter((i) => i.boardId === r.boardId)
          ).filter((i) => !i.isArchived);

          if (col.type !== ColumnType.SIMPLE_FORMULA) {
            const rows = scoped.map((i) => ({ id: i.id, values: hubValues[i.id] ?? {} }));
            const total = computeSummaryNumeric(rows, col.type, r.columnId, r.agg);
            formulaRefLog(serializeRef(r), total === null ? 'empty' : 'ok',
              total === null ? 'no row in this scope has a value for the column' : 'aggregated',
              {
                column: col.name,
                scope: r.groupId === BOARD_TOTAL_GROUP_ID ? 'whole hub' : `board ${r.boardId}`,
                rowsInScope: scoped.length,
                rowsWithAValue: rows.filter((row) => row.values[r.columnId] != null && row.values[r.columnId] !== '').length,
                total,
              });
            return total;
          }

          // A personal formula column holds formula text, not values, so totalling it means
          // rebuilding the grid those formulas are written against and evaluating each row —
          // the same grid and the same evaluator the Hub uses, so both arrive at one number.
          const summaryKey = `pagg:${r.boardId}:${r.columnId}:${r.groupId ?? ''}:${r.agg}`;
          if (visited.has(summaryKey)) { cycleFlag.hit = true; return null; }
          const nextVisited = new Set(visited);
          nextVisited.add(summaryKey);

          const gridBoardId = col.scope === 'board' ? col.boardId : undefined;
          const gridItems = gridBoardId ? hubItems.filter((i) => i.boardId === gridBoardId) : hubItems;
          const grid = {
            rowOrder: hubRowOrder(gridItems),
            columns: hubGridColumns(personalColumnDefs ?? [], gridBoardId),
            valuesByItem: hubValues,
            boardId: gridBoardId ?? '',
          };

          // Absolute positional formulas ({C3}) only mean the right cell in the exact row order
          // they were written against, and this order is reconstructed rather than read off the
          // rendered Hub. Rather than return a number that looks fine and isn't, leave the whole
          // summary unresolved so it reads as unavailable.
          const settings = col.settings as unknown as { defaultFormula?: string } | undefined;
          const formulas = [settings?.defaultFormula ?? '', ...grid.rowOrder.map((id) => {
            const v = hubValues[id]?.[col.id];
            return typeof v === 'string' ? v : '';
          })];
          if (formulas.some((f) => f && hasAbsolutePositionalRefs(f))) {
            formulaRefLog(serializeRef(r), 'unresolved',
              'the column uses absolute positional refs like {C3}, which need the Hub’s exact row order',
              { column: col.name });
            return undefined;
          }

          const evalRow = makePersonalFormulaEvaluator(col, grid, (ref, itemId) => inner(ref, itemId, nextVisited));
          const vals = scoped
            .map((i) => evalRow(i))
            .filter((n): n is number => n !== null && !isNaN(n));
          const total = aggregateSummary(vals, r.agg);
          formulaRefLog(serializeRef(r), total === null ? 'empty' : 'ok',
            total === null ? 'no row in this scope produced a formula value' : 'aggregated',
            {
              column: col.name,
              gridRows: grid.rowOrder.length,
              gridColumns: grid.columns.map((c) => c.name),
              rowsInScope: scoped.length,
              rowsThatEvaluated: vals.length,
              total,
            });
          return total;
        }

        // Group-summary reference: aggregate a column across a group. Board columns only.
        if (r.agg) {
          if (r.kind !== 'b') {
            formulaRefLog(serializeRef(r), 'unresolved', `summary refs of kind '${r.kind}' have no resolver here`);
            return undefined;
          }
          const items = boardItemsList.get(r.boardId);
          const cols = boardColumnsMap.get(r.boardId);
          const col = cols?.find((c) => c.id === r.columnId);
          if (!items || !cols || !col) {
            formulaRefLog(serializeRef(r), 'unresolved',
              !items ? 'the source board’s items have not loaded'
                : !cols ? 'the source board’s columns have not loaded'
                : 'no column on that board has this id',
              { boardId: r.boardId, lookingForColumnId: r.columnId, knownColumnIds: (cols ?? []).map((c) => c.id).join(' | ') || '(none)' });
            return undefined; // board items/columns not loaded yet
          }
          // A Personal Hub board group totals the rows that hub shows for this board — its
          // owner's assigned items — rather than one group of the board.
          const hubOwner = r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER;
          let hubRowIds: Set<string> | null = null;
          if (r.groupId === HUB_ROWS_GROUP_ID) {
            const groups = hubGroupsByBoard.get(r.boardId);
            const assigned = hubItemsByOwner.get(hubOwner) ?? [];
            if (!groups || assigned.length === 0) {
              formulaRefLog(serializeRef(r), 'unresolved',
                !groups ? 'that board’s groups have not loaded' : 'that hub’s assigned items have not loaded',
                { board: r.boardId, hub: hubOwner === SELF_OWNER ? 'your own' : hubOwner });
              return undefined;
            }
            // An assigned subitem never appears as its own row in a hub — the item hosting it does,
            // and any value shown on that row belongs to the host. Counting the subitem instead
            // leaves the host's row out of the total entirely.
            hubRowIds = new Set<string>();
            for (const it of assigned) {
              if (it.boardId !== r.boardId) continue;
              const host = groups.get(it.groupId)?.parentItemId;
              hubRowIds.add(host ?? it.id);
            }
          }
          const rows = hubRowIds ? items.filter((i) => hubRowIds!.has(i.id) && !i.isArchived)
            : r.groupId === BOARD_TOTAL_GROUP_ID ? items
            : items.filter((i) => i.groupId === r.groupId);

          if (col.type !== ColumnType.SIMPLE_FORMULA) {
            const total = computeSummaryNumeric(rows, col.type, r.columnId, r.agg);
            formulaRefLog(serializeRef(r), total === null ? 'empty' : 'ok',
              total === null ? 'no row in that group has a value for the column' : 'aggregated',
              { board: r.boardId, column: col.name, group: r.groupId, rowsInGroup: rows.length, total });
            return total;
          }

          // Aggregating a formula column on another board: evaluate each row's formula in that
          // board's own context, exactly as the board renders it. The summary joins `visited`
          // so a formula that (directly or through further hops) aggregates its own column
          // contributes 0 where the cycle closes instead of recursing forever.
          const summaryKey = `agg:${r.boardId}:${r.columnId}:${r.groupId ?? ''}:${r.agg}`;
          if (visited.has(summaryKey)) { cycleFlag.hit = true; return null; }
          const memoized = summaryCache.get(summaryKey);
          if (memoized !== undefined) return memoized;

          const nextVisited = new Set(visited);
          nextVisited.add(summaryKey);
          const settings = col.settings as unknown as { defaultFormula?: string } | undefined;
          const outerHit = cycleFlag.hit;
          cycleFlag.hit = false;
          const vals: number[] = [];
          let rowMissing = false;
          for (const row of rows) {
            const stored = row.values[r.columnId];
            const formula = typeof stored === 'string' ? stored : (settings?.defaultFormula ?? '');
            if (!formula.trim()) continue;
            const idx = items.findIndex((it) => it.id === row.id);
            const v = evaluateFormula(formula, {}, {
              allItems: items,
              columns: cols,
              currentRowIndex: idx >= 0 ? idx : undefined,
              homeBoardId: r.boardId,
              summaryCache,
              cycleFlag,
              resolveRef: (rr) => inner(rr, row.id, nextVisited),
              onUnresolvedRef: () => { rowMissing = true; },
            });
            if (v !== null) vals.push(v);
          }
          // One row short of its own answer makes the total short too — better unknown than wrong.
          if (rowMissing) {
            formulaRefLog(serializeRef(r), 'unresolved',
              'a row in that group depends on something not available yet', { board: r.boardId, column: col.name });
            return undefined;
          }
          const aggregated = aggregateSummary(vals, r.agg);
          formulaRefLog(serializeRef(r), aggregated === null ? 'empty' : 'ok',
            aggregated === null ? 'no row in that group produced a formula value' : 'aggregated',
            { board: r.boardId, column: col.name, group: r.groupId, rowsInGroup: rows.length, rowsThatEvaluated: vals.length, total: aggregated });
          // Only a cycle-free result generalizes past the stack it was computed on — see the
          // matching rule in the engine's resolveLocalSummary.
          if (!cycleFlag.hit && aggregated !== null) summaryCache.set(summaryKey, aggregated);
          cycleFlag.hit = cycleFlag.hit || outerHit;
          return aggregated;
        }

        const itemId = r.itemId ?? cid ?? null;
        if (!itemId) return undefined;

        if (r.kind === 'b') {
          const cols = boardColumnsMap.get(r.boardId);
          if (!cols) {
            sameColumnTrace('L1. LOADER GIVES UP — that board’s columns are not loaded', {
              token: serializeRef(r), boardId: r.boardId, boardsLoaded: [...boardColumnsMap.keys()].join(','),
            });
            return undefined; // columns not loaded yet (or beyond MAX_HOPS — never will)
          }
          const col = cols.find((c) => c.id === r.columnId);
          if (!r.agg) {
            sameColumnTrace('L1. loader has the column', {
              token: serializeRef(r), columnId: r.columnId, found: !!col, type: col?.type,
            });
          }

          // A reference to a formula cell on another board: evaluate its formula to its live value,
          // in that board's own row/column context. Same-board refs inside it resolve locally;
          // any further foreign refs recurse through `inner` (carrying the cycle guard) — resolved
          // as long as that board made it into the discovered load set (within MAX_HOPS).
          if (col?.type === ColumnType.SIMPLE_FORMULA) {
            const items = boardItemsList.get(r.boardId);
            if (!items) {
              sameColumnTrace('L2. LOADER GIVES UP — that board’s items are not loaded', { boardId: r.boardId });
              return undefined;
            }
            const idx = items.findIndex((it) => it.id === itemId);
            if (idx < 0) {
              sameColumnTrace('L2. LOADER GIVES UP — that item is not in the board’s item list', {
                wantedItemId: itemId, itemsLoaded: items.length,
              });
              return undefined;
            }
            const key = `${r.boardId}:${r.columnId}:${itemId}`;
            if (visited.has(key)) {
              sameColumnTrace('L3. LOADER RETURNS 0 — circular: this cell is already being computed higher up', {
                itemId, columnId: r.columnId, stack: [...visited].join(' > '),
              });
              cycleFlag.hit = true; return null;
            } // cross-board cycle → contributes 0
            const nextVisited = new Set(visited);
            nextVisited.add(key);
            const stored = items[idx].values[r.columnId];
            const settings = col.settings as unknown as { defaultFormula?: string } | undefined;
            const formula = typeof stored === 'string' ? stored : (settings?.defaultFormula ?? '');
            sameColumnTrace('L3. loader found the referenced cell', {
              itemId, storedType: typeof stored, storedValue: stored,
              columnDefault: settings?.defaultFormula ?? '(none)', formulaItWillUse: formula || '(empty)',
            });
            if (!formula.trim()) {
              formulaRefLog(serializeRef(r), 'empty', 'that formula cell has no formula — neither its own nor a column default',
                { board: r.boardId, column: col.name, itemId });
              return null;
            }
            let nestedMissing = false;
            const formulaResult = evaluateFormula(formula, {}, {
              allItems: items,
              columns: cols,
              currentRowIndex: idx,
              homeBoardId: r.boardId,
              summaryCache,
              cycleFlag,
              resolveRef: (rr) => inner(rr, items[idx].id, nextVisited),
              onUnresolvedRef: () => { nestedMissing = true; },
            });
            // That cell's own formula reaches somewhere this evaluation cannot follow — usually
            // data still arriving. Its terms are treated as zero inside the engine, so the number
            // it produced is short by exactly those, and passing it on would bake the shortfall
            // into whatever referenced it. Report unknown and let it resolve once the data lands.
            if (nestedMissing) {
              sameColumnTrace('L4. LOADER REPORTS UNKNOWN — part of that cell’s own formula is not available yet', {
                itemId, formula, partialResult: formulaResult,
              });
              return undefined;
            }
            sameColumnTrace('L4. loader evaluated it', { itemId, formula, result: formulaResult });
            formulaRefLog(serializeRef(r), formulaResult === null ? 'empty' : 'ok',
              formulaResult === null ? 'the formula did not produce a number' : 'evaluated on its own board',
              { board: r.boardId, column: col.name, itemId, formula, result: formulaResult });
            return formulaResult;
          }

          const map = boardItemMap.get(r.boardId);
          if (!map || !map.has(itemId)) {
            formulaRefLog(serializeRef(r), 'unresolved', 'that board\'s items are not loaded, or the item was deleted',
              { board: r.boardId, itemId });
            return undefined;
          }
          const raw = map.get(itemId)![r.columnId];
          if (raw == null || raw === '') {
            formulaRefLog(serializeRef(r), 'empty', 'that cell is empty', { board: r.boardId, itemId, columnId: r.columnId });
            return null;
          }
          const n = Number(raw);
          formulaRefLog(serializeRef(r), isNaN(n) ? 'empty' : 'ok', isNaN(n) ? 'cell value is not a number' : 'read from the board',
            { board: r.boardId, itemId, raw });
          return isNaN(n) ? null : n;
        }

        const owner = r.ownerId && r.ownerId !== viewerId ? r.ownerId : SELF_OWNER;
        const personalValues = personalValuesByOwner.get(owner) ?? {};
        const row = personalValues[itemId];
        if (!row) {
          formulaRefLog(serializeRef(r), 'unresolved', 'personal values for this item were not fetched', {
            itemId,
            itemsFetched: Object.keys(personalValues),
          });
          return undefined;
        }
        const raw = row[r.columnId];
        if (raw == null || raw === '') {
          // The single most useful line for a personal cell that reads 0: `columnsWithAValue`
          // lists the column ids this item DOES hold, so a mismatch against the id being asked
          // for is visible at a glance rather than inferred.
          formulaRefLog(serializeRef(r), 'empty', 'this item holds no value for that personal column', {
            page: typeof location !== 'undefined' ? location.pathname : '(unknown)',
            itemId,
            lookingForColumnId: r.columnId,
            columnsWithAValue: Object.keys(row).join(' | ') || '(none — this item has no personal values at all)',
          });
          return null;
        }
        const n = Number(raw);
        formulaRefLog(serializeRef(r), isNaN(n) ? 'empty' : 'ok', isNaN(n) ? 'stored value is not a number' : 'read from your hub',
          { itemId, raw });
        return isNaN(n) ? null : n;
      };

      return inner(ref, currentItemId, new Set<string>());
    },
    [boardItemMap, boardItemsList, boardColumnsMap, templateTotalsMap, itemTotalsMap, viewerId,
     personalValuesByOwner, hubItemsByOwner, hubValuesByOwner, personalColumnsByOwner, hubGroupsByBoard],
  );

  return { resolve, isLoading };
}
