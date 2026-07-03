import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FiLoader, FiExternalLink } from 'react-icons/fi';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { usePersonalColumns, usePersonalItemValues } from '../../hooks/queries/usePersonalHubQueries';
import { queryKeys } from '../../hooks/queries/queryKeys';
import * as wm from '../../services/workManagementService';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { DependencyProvider } from '../../contexts/DependencyContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import ItemRow from '../boards/ItemRow';
import GroupSummaryRow from '../boards/GroupSummaryRow';
import PersonalColumnCell from './PersonalColumnCell';
import { PERSONAL_COL_WIDTH } from './constants';
import type { BoardView } from '../../contexts/BoardRenderContext';
import type { PersonalGridContext } from './cells/types';
import type { Item, PersonalColumn } from '../../types';

interface Props {
  boardId: string;
  items: Item[];
  isOwn: boolean;
  boardView: BoardView;
  onOpenDetail: (item: Item) => void;
  onOpenChat: (item: Item) => void;
  onBoardResolved?: (boardId: string, name: string) => void;
  /**
   * Page-wide grid context for cross-group ("all groups") personal columns —
   * spans every board group's rows so a formula in any group can address a
   * Number cell in any other group's table. Falls back to this group's own
   * rows only if not provided.
   */
  crossGroupGridContext?: PersonalGridContext;
  /** Reports this group's resolved display rows + values up to the page once settled. */
  onRowsResolved?: (boardId: string, itemIds: string[], values: Record<string, Record<string, unknown>>) => void;
  /**
   * When a promoted parent item is expanded, only show subitems this user is
   * assigned to — not every subitem under that host, which is what the real
   * board's SubitemGroup shows by default.
   */
  subitemAssigneeFilterId?: string;
}

/** Always plain — the interactive rename/settings/delete menu lives only in the page-level header. */
const PersonalColumnHeaderLabel: React.FC<{ col: PersonalColumn }> = ({ col }) => (
  <div
    role="columnheader"
    style={{ width: `${PERSONAL_COL_WIDTH}px` }}
    className="flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-indigo-600 bg-indigo-50/50"
    title={`${col.name} (personal column)`}
  >
    <span className="text-indigo-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
    <span className="truncate">{col.name}</span>
  </div>
);

const renderPersonalCells = (
  columns: PersonalColumn[],
  item: Item,
  personalValuesByItem: Record<string, Record<string, unknown>>,
  isOwn: boolean,
  gridContext: PersonalGridContext,
): React.ReactNode =>
  columns.length === 0 ? null : (
    <>
      {columns.map((col) => (
        <div
          key={col.id}
          role="gridcell"
          style={{ width: `${PERSONAL_COL_WIDTH}px` }}
          className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0"
        >
          <PersonalColumnCell
            column={col}
            itemId={item.id}
            itemName={item.name}
            value={personalValuesByItem[item.id]?.[col.id]}
            editable={isOwn}
            gridContext={gridContext}
          />
        </div>
      ))}
    </>
  );

/**
 * Renders one board's assigned items as a "group" in the Personal Hub — the
 * board name stands in for the group name, and each board keeps its own
 * column set since items here come from different boards.
 *
 * Source-board columns are the real, live item data — edits here save
 * straight back to the source board (same permission rules as viewing that
 * board directly), and stay exactly as fetched — no column management here.
 * Cross-group personal columns (managed from the page-level header) are
 * woven in before them, on the left, and are only editable by the hub's owner.
 *
 * Subitems the user is assigned to are never shown as their own row here —
 * their hosting (parent) item is shown instead, exactly as on the source
 * board, and the user expands its chevron to reach the assigned subitem via
 * the real SubitemGroup panel (same one the source board uses).
 */
const PersonalHubBoardGroup: React.FC<Props> = ({ boardId, items, isOwn, boardView, onOpenDetail, onOpenChat, onBoardResolved, crossGroupGridContext: pageCrossGroupGridContext, onRowsResolved, subitemAssigneeFilterId }) => {
  const navigate = useNavigate();
  const { data: board, isLoading: boardLoading, isError: boardError } = useBoard(boardId);

  React.useEffect(() => {
    if (board) onBoardResolved?.(boardId, board.name);
  }, [board, boardId, onBoardResolved]);

  // Don't fire columns/groups lookups until the board itself has resolved — for
  // orphaned items (pointing at a hard-deleted board), the board fetch 404s and
  // this group renders nothing anyway, so there's no point also firing (and
  // console-logging) doomed columns/groups requests for it.
  const { data: columns = [] } = useColumns(boardId, !!board);
  const { data: allPersonalColumns = [] } = usePersonalColumns();

  const crossGroupColumns = useMemo(
    () => allPersonalColumns.filter((c) => c.scope === 'all'),
    [allPersonalColumns],
  );
  const boardOnlyColumns = useMemo(
    () => allPersonalColumns.filter((c) => c.scope === 'board' && c.boardId === boardId),
    [allPersonalColumns, boardId],
  );

  // Resolve each assigned item's group so subitems can be swapped out for their hosting item.
  // Gated on the board having resolved — see the useColumns note above.
  const groupResults = useQueries({
    queries: items.map((item) => ({
      queryKey: queryKeys.groups.one(boardId, item.groupId),
      queryFn: () => wm.getGroup(boardId, item.groupId),
      staleTime: 2 * 60 * 1000,
      enabled: !!board,
    })),
  });
  const groupsSettled = groupResults.every((r) => !r.isLoading);

  const { topLevelItems, parentItemIds } = useMemo(() => {
    const top: Item[] = [];
    const parentIds = new Set<string>();
    items.forEach((item, i) => {
      const group = groupResults[i]?.data;
      const groupErrored = groupResults[i]?.isError;
      if (group?.parentItemId && !groupErrored) {
        parentIds.add(group.parentItemId);
      } else {
        top.push(item);
      }
    });
    return { topLevelItems: top, parentItemIds: [...parentIds] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, groupResults.map((r) => r.data).join(','), groupResults.map((r) => r.isError).join(',')]);

  const parentItemResults = useQueries({
    queries: parentItemIds.map((id) => ({
      queryKey: queryKeys.items.one(id),
      queryFn: () => wm.getItem(id),
      staleTime: 60 * 1000,
    })),
  });
  const parentItemsSettled = parentItemResults.every((r) => !r.isLoading);

  const displayItems = useMemo(() => {
    const existingIds = new Set(topLevelItems.map((i) => i.id));
    const resolvedParents = parentItemResults
      .map((r) => r.data)
      .filter((p): p is Item => !!p && !existingIds.has(p.id));
    return [...topLevelItems, ...resolvedParents];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topLevelItems, parentItemResults.map((r) => r.data?.id).join(',')]);

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const displayItemIds = useMemo(() => displayItems.map((i) => i.id), [displayItems]);
  // Personal-column values are keyed by item — fetch for both the directly assigned
  // items and any hosting items we promoted into view.
  const { data: personalValuesByItem = {} } = usePersonalItemValues([...new Set([...itemIds, ...displayItemIds])], isOwn);

  // Cross-group columns get a real spreadsheet-style grid — every displayed row across
  // EVERY board group is addressable ({B3} etc.), matching the real board's formula
  // behavior. The page assembles this across all groups; fall back to this group's own
  // rows only if the page hasn't wired it up.
  const localCrossGroupGridContext = useMemo<PersonalGridContext>(
    () => ({ rowOrder: displayItemIds, columns: crossGroupColumns, valuesByItem: personalValuesByItem }),
    [displayItemIds, crossGroupColumns, personalValuesByItem],
  );
  const crossGroupGridContext = pageCrossGroupGridContext ?? localCrossGroupGridContext;
  const boardOnlyGridContext = useMemo<PersonalGridContext>(
    () => ({ rowOrder: displayItemIds, columns: boardOnlyColumns, valuesByItem: personalValuesByItem }),
    [displayItemIds, boardOnlyColumns, personalValuesByItem],
  );

  React.useEffect(() => {
    if (groupsSettled && parentItemsSettled) onRowsResolved?.(boardId, displayItemIds, personalValuesByItem);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, displayItemIds.join(','), personalValuesByItem, groupsSettled, parentItemsSettled, onRowsResolved]);

  const itemSectionWidth = 298 - 16;

  // The source board no longer exists (or is no longer accessible) — its items are
  // orphaned, so there's nothing meaningful to render for this group.
  if (boardError) return null;

  if (boardLoading || !board) {
    return (
      <div className="flex items-center justify-center py-6" role="status" aria-label={`Loading board ${boardId}`}>
        <FiLoader className="animate-spin text-indigo-400" size={18} aria-hidden="true" />
      </div>
    );
  }

  const stillResolving = !groupsSettled || !parentItemsSettled;

  return (
    <div className="flex flex-col pt-8" aria-label={`Board group: ${board.name}`}>
      <div className="sticky left-4 w-fit flex items-center gap-2 pb-2 z-[2]">
        <h2 className="text-xl font-bold truncate max-w-[280px] text-indigo-700">{board.name}</h2>
        <span className="text-sm text-gray-400 flex-shrink-0" aria-label={`${items.length} items`}>
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => navigate(`/boards/${boardId}`)}
          className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
          aria-label={`Go to the ${board.name} board`}
          title="Go to source board"
        >
          <FiExternalLink size={14} aria-hidden="true" />
        </button>
      </div>

      <section
        className="rounded-lg border border-gray-200 bg-white w-max shadow-md"
        aria-label={`Items assigned to you on board ${board.name}`}
      >
        <div
          className="flex flex-nowrap items-stretch border-b border-[#d2d2d4] bg-gray-50 w-max rounded-t-lg"
          role="row"
          aria-label={`Column headers for ${board.name}`}
        >
          <div
            className="flex-shrink-0 border-r border-[#d2d2d4] sticky left-4 bg-gray-50 z-[1] rounded-tl-lg"
            style={{ width: `${itemSectionWidth}px`, borderLeft: '4px solid #6366f1' }}
          />
          {crossGroupColumns.map((col) => (
            <PersonalColumnHeaderLabel key={col.id} col={col} />
          ))}
          {columns.map((col) => (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${col.width ?? calculateColumnWidth(col.name, col.type)}px` }}
              className="flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-gray-600"
              title={col.name}
            >
              <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
              <span className="truncate">{col.name}</span>
            </div>
          ))}
          {boardOnlyColumns.map((col) => (
            <PersonalColumnHeaderLabel key={col.id} col={col} />
          ))}
        </div>

        <BoardRenderProvider visibleItems={displayItems} columns={columns} boardView={boardView} openChat={onOpenChat}>
          <DependencyProvider items={displayItems}>
          <DndContext onDragEnd={() => {}}>
            <div role="rowgroup" aria-label={`Items assigned to you in ${board.name}`} className="w-max">
              {stillResolving ? (
                <div className="flex items-center justify-center py-4" role="status" aria-label="Resolving items">
                  <FiLoader className="animate-spin text-indigo-400" size={16} aria-hidden="true" />
                </div>
              ) : displayItems.length === 0 ? (
                <div className="px-4 py-4 text-xs text-gray-400 italic">No assigned items on this board.</div>
              ) : (
                <SortableContext items={displayItemIds} strategy={verticalListSortingStrategy}>
                  {displayItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      onOpenDetail={onOpenDetail}
                      groupColor="#6366f1"
                      leadingExtraCells={renderPersonalCells(crossGroupColumns, item, personalValuesByItem, isOwn, crossGroupGridContext)}
                      extraCells={renderPersonalCells(boardOnlyColumns, item, personalValuesByItem, isOwn, boardOnlyGridContext)}
                      subitemAssigneeFilterId={subitemAssigneeFilterId}
                    />
                  ))}
                </SortableContext>
              )}
            </div>
          </DndContext>

          {/* Sum / average summary row — same component, same per-column config, as a
              normal board group. summaryConfig lives on the (real, shared) Column doc,
              so setting it here reflects on the source board too, same as any other edit.
              Leading/trailing spacers reserve the exact width of the personal columns
              woven around the source columns in the data rows, so every source-column
              summary lines up with its column. */}
          {!stillResolving && (
            <GroupSummaryRow
              items={displayItems}
              columns={columns}
              leadingExtraCells={crossGroupColumns.length > 0 ? crossGroupColumns.map((col) => (
                <div
                  key={col.id}
                  role="gridcell"
                  aria-hidden="true"
                  style={{ width: `${PERSONAL_COL_WIDTH}px` }}
                  className="flex-shrink-0 border-r border-[#d2d2d4] bg-white"
                />
              )) : undefined}
              trailingExtraCells={boardOnlyColumns.length > 0 ? boardOnlyColumns.map((col) => (
                <div
                  key={col.id}
                  role="gridcell"
                  aria-hidden="true"
                  style={{ width: `${PERSONAL_COL_WIDTH}px` }}
                  className="flex-shrink-0 border-r border-[#d2d2d4] last:border-r-0 bg-white"
                />
              )) : undefined}
            />
          )}
          </DependencyProvider>
        </BoardRenderProvider>
      </section>
    </div>
  );
};

export default PersonalHubBoardGroup;
