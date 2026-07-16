import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { usePersonalColumns } from './usePersonalHubQueries';
import { useAuth } from '../useAuth';
import * as wm from '@/services/workManagementService';
import type { CellRef, SummaryCalc } from '@/utils/formulaEngine';
import type { Item, PaginatedResponse } from '@/types';

const FOREIGN_ITEMS_LIMIT = 500;

export interface RefMeta {
  isPersonal: boolean;
  /** Current user's display name, for personal refs ("{userName}'s Personal Hub"). */
  userName?: string;
  boardName?: string;
  groupName?: string;
  itemName?: string;
  columnName?: string;
  agg?: SummaryCalc;
}

/**
 * Resolves human-readable source info (board/group/item/column names) for formula refs,
 * for display only (e.g. a tooltip while recording). Kept separate from
 * useForeignCellValues so this extra metadata (board/column/group lookups for every ref,
 * not just group-summary ones) is only fetched while a formula is actively being recorded,
 * not on every formula cell render. Query keys match the hooks used elsewhere in the app,
 * so this reuses their cache instead of double-fetching.
 *
 * Personal Hub ("kind: 'p'") refs point at a real board Item (Personal Hub rows are the
 * user's assigned items with personal columns overlaid on top), so the same board/group/item
 * name resolution applies — the personal column's own name just comes from usePersonalColumns
 * instead of the board's column list. "All groups" (cross-board) personal columns don't carry
 * a boardId on the ref (they aren't scoped to one board), so their board is resolved by
 * fetching the referenced item individually first.
 */
export function useFormulaRefMeta(refs: CellRef[], currentItemId: string | null = null) {
  const { user } = useAuth();
  const userName = (user as { name?: string } | null | undefined)?.name;

  const hasPersonalRefs = useMemo(() => refs.some((r) => r.kind === 'p'), [refs]);
  const { data: personalColumns } = usePersonalColumns(undefined, hasPersonalRefs);
  const personalColumnNameMap = useMemo(() => {
    const m = new Map<string, string>();
    (personalColumns ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [personalColumns]);

  // "All groups" personal cells don't carry a boardId on the ref — resolve the underlying
  // item individually first to learn which board it actually lives on.
  const looseItemIds = useMemo(() => {
    const ids = new Set<string>();
    refs.forEach((r) => {
      if (r.kind === 'p' && !r.agg && !r.boardId) {
        const id = r.itemId ?? currentItemId;
        if (id) ids.add(id);
      }
    });
    return Array.from(ids).sort();
  }, [refs, currentItemId]);
  const looseItemKey = looseItemIds.join(',');

  const looseItemQueries = useQueries({
    queries: looseItemIds.map((id) => ({
      queryKey: queryKeys.items.one(id),
      queryFn: () => wm.getItem(id),
      enabled: !!id,
      staleTime: 60 * 1000,
    })),
  });

  const looseItemMap = useMemo(() => {
    const m = new Map<string, Item>();
    looseItemIds.forEach((id, i) => {
      const it = looseItemQueries[i]?.data;
      if (it) m.set(id, it);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looseItemKey, looseItemQueries]);

  const boardIds = useMemo(() => {
    const ids = new Set<string>();
    refs.forEach((r) => { if (r.boardId) ids.add(r.boardId); });
    looseItemMap.forEach((it) => ids.add(it.boardId));
    return Array.from(ids).sort();
  }, [refs, looseItemMap]);
  const boardKey = boardIds.join(',');

  const boardQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.boards.one(boardId),
      queryFn: () => wm.getBoard(boardId),
      enabled: !!boardId,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const columnQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.columns.board(boardId),
      queryFn: () => wm.listColumns(boardId),
      enabled: !!boardId,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const groupQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.groups.all(boardId),
      queryFn: () => wm.listGroups(boardId, false),
      enabled: !!boardId,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const itemQueries = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.items.list({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      queryFn: () => wm.listItems({ boardId, limit: FOREIGN_ITEMS_LIMIT }),
      enabled: !!boardId,
      staleTime: 60 * 1000,
    })),
  });

  const boardNameMap = useMemo(() => {
    const m = new Map<string, string>();
    boardIds.forEach((id, i) => {
      const b = boardQueries[i]?.data;
      if (b) m.set(id, b.name);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, boardQueries]);

  const columnNameMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    boardIds.forEach((id, i) => {
      const cols = columnQueries[i]?.data;
      if (!cols) return;
      const cm = new Map<string, string>();
      cols.forEach((c) => cm.set(c.id, c.name));
      m.set(id, cm);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, columnQueries]);

  const groupNameMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    boardIds.forEach((id, i) => {
      const groups = groupQueries[i]?.data;
      if (!groups) return;
      const gm = new Map<string, string>();
      groups.forEach((g) => gm.set(g.id, g.name));
      m.set(id, gm);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, groupQueries]);

  const itemMap = useMemo(() => {
    const m = new Map<string, Map<string, Item>>();
    boardIds.forEach((id, i) => {
      const data = itemQueries[i]?.data as PaginatedResponse<Item> | undefined;
      if (!data) return;
      const im = new Map<string, Item>();
      data.data.forEach((it) => im.set(it.id, it));
      m.set(id, im);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, itemQueries]);

  function resolveMeta(ref: CellRef, current?: string | null): RefMeta | undefined {
    if (ref.kind === 'p') {
      const columnName = personalColumnNameMap.get(ref.columnId);

      if (ref.agg) {
        if (!ref.boardId) return undefined;
        const boardName = boardNameMap.get(ref.boardId);
        const groupName = ref.groupId ? groupNameMap.get(ref.boardId)?.get(ref.groupId) : undefined;
        if (boardName === undefined || columnName === undefined) return undefined;
        return { isPersonal: true, userName, boardName, groupName, columnName, agg: ref.agg };
      }

      const itemId = ref.itemId ?? current ?? currentItemId ?? null;
      if (!itemId) return undefined;
      const item = (ref.boardId ? itemMap.get(ref.boardId)?.get(itemId) : undefined) ?? looseItemMap.get(itemId);
      if (!item || columnName === undefined) return undefined;
      const boardName = boardNameMap.get(item.boardId);
      if (boardName === undefined) return undefined;
      const groupName = groupNameMap.get(item.boardId)?.get(item.groupId);
      return { isPersonal: true, userName, boardName, groupName, itemName: item.name, columnName };
    }

    const boardName = boardNameMap.get(ref.boardId);
    const columnName = columnNameMap.get(ref.boardId)?.get(ref.columnId);

    if (ref.agg) {
      if (boardName === undefined || columnName === undefined) return undefined;
      const groupName = ref.groupId ? groupNameMap.get(ref.boardId)?.get(ref.groupId) : undefined;
      return { isPersonal: false, boardName, groupName, columnName, agg: ref.agg };
    }

    const itemId = ref.itemId ?? current ?? currentItemId ?? null;
    if (!itemId) return undefined;
    const item = itemMap.get(ref.boardId)?.get(itemId);
    if (boardName === undefined || columnName === undefined || !item) return undefined;
    const groupName = groupNameMap.get(ref.boardId)?.get(item.groupId);
    return { isPersonal: false, boardName, groupName, itemName: item.name, columnName };
  }

  return { resolveMeta };
}
