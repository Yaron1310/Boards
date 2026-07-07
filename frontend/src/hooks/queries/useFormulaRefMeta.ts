import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CellRef, SummaryCalc } from '@/utils/formulaEngine';
import type { Item, PaginatedResponse } from '@/types';

const FOREIGN_ITEMS_LIMIT = 500;

export interface RefMeta {
  isPersonal: boolean;
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
 */
export function useFormulaRefMeta(refs: CellRef[]) {
  const boardIds = useMemo(
    () => Array.from(new Set(refs.filter((r) => r.kind === 'b' && r.boardId).map((r) => r.boardId))).sort(),
    [refs],
  );
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

  function resolveMeta(ref: CellRef, currentItemId?: string | null): RefMeta | undefined {
    if (ref.kind === 'p') return { isPersonal: true };

    const boardName = boardNameMap.get(ref.boardId);
    const columnName = columnNameMap.get(ref.boardId)?.get(ref.columnId);

    if (ref.agg) {
      if (boardName === undefined || columnName === undefined) return undefined;
      const groupName = ref.groupId ? groupNameMap.get(ref.boardId)?.get(ref.groupId) : undefined;
      return { isPersonal: false, boardName, groupName, columnName, agg: ref.agg };
    }

    const itemId = ref.itemId ?? currentItemId ?? null;
    if (!itemId) return undefined;
    const item = itemMap.get(ref.boardId)?.get(itemId);
    if (boardName === undefined || columnName === undefined || !item) return undefined;
    const groupName = groupNameMap.get(ref.boardId)?.get(item.groupId);
    return { isPersonal: false, boardName, groupName, itemName: item.name, columnName };
  }

  return { resolveMeta };
}
