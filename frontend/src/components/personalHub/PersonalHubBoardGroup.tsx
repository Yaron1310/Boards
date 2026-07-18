import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FiLoader, FiExternalLink } from 'react-icons/fi';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { usePersonalColumns, usePersonalItemValues, useUpdatePersonalColumn } from '../../hooks/queries/usePersonalHubQueries';
import { queryKeys } from '../../hooks/queries/queryKeys';
import * as wm from '../../services/workManagementService';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { DependencyProvider } from '../../contexts/DependencyContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import { evaluateFormula } from '../../utils/formulaEngine';
import type { FormulaRow } from '../../utils/formulaEngine';
import ItemRow from '../boards/ItemRow';
import GroupSummaryRow, { SummaryCell } from '../boards/GroupSummaryRow';
import type { SummaryColumn, CellConfig } from '../boards/GroupSummaryRow';
import PersonalColumnCell from './PersonalColumnCell';
import { PERSONAL_COL_WIDTH } from './constants';
import { ColumnType } from '../../types';
import type { BoardView } from '../../contexts/BoardRenderContext';
import type { PersonalGridContext } from './cells/types';
import type { Item, PersonalColumn, SimpleFormulaColumnSettings } from '../../types';

interface Props {
  boardId: string;
  items: Item[];
  isOwn: boolean;
  /**
   * Whose personal columns/values to load. `undefined` = the logged-in user's own
   * hub; set to another user's id when an admin is viewing their hub (read-only —
   * `isOwn` stays false, so cells and summary controls remain non-editable).
   */
  ownerUserId?: string;
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
  /**
   * The page's uniform board width — the widest board group on the page. Every group's
   * rows are stretched to this so their sticky item cell stays pinned across the full
   * horizontal scroll even when this board has fewer columns; the space past this
   * board's own cells is filled grey. Undefined until measured (first paint).
   */
  groupMinWidth?: number;
}

/**
 * Build a per-item evaluator for a personal Simple Formula column, using the same
 * {Letter}{Row} grid addressing the cells use. Returned per-item so the summary
 * row can aggregate over exactly the items it's scoped to (this group, or this
 * group plus every group above it when cumulative), same as a board formula.
 */
export const makePersonalFormulaEvaluator = (col: PersonalColumn, gridContext: PersonalGridContext) => {
  const settings = col.settings as SimpleFormulaColumnSettings;
  const defaultFormula = settings?.defaultFormula ?? '';
  const allRows: FormulaRow[] = gridContext.rowOrder.map((id) => ({ values: gridContext.valuesByItem[id] ?? {} }));
  return (item: Item): number | null => {
    const stored = gridContext.valuesByItem[item.id]?.[col.id];
    const formula = typeof stored === 'string' ? stored : defaultFormula;
    if (!formula) return null;
    const idx = gridContext.rowOrder.indexOf(item.id);
    const r = evaluateFormula(formula, {}, {
      allItems: allRows,
      columns: gridContext.columns,
      currentRowIndex: idx >= 0 ? idx : undefined,
    });
    return r !== null && !isNaN(r) ? r : null;
  };
};

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
const PersonalHubBoardGroup: React.FC<Props> = ({ boardId, items, isOwn, ownerUserId, boardView, onOpenDetail, onOpenChat, onBoardResolved, crossGroupGridContext: pageCrossGroupGridContext, onRowsResolved, subitemAssigneeFilterId, groupMinWidth }) => {
  const navigate = useNavigate();
  const { mutate: updatePersonalColumn } = useUpdatePersonalColumn();
  const { data: board, isLoading: boardLoading, isError: boardError } = useBoard(boardId);

  React.useEffect(() => {
    if (board) onBoardResolved?.(boardId, board.name);
  }, [board, boardId, onBoardResolved]);

  // Don't fire columns/groups lookups until the board itself has resolved — for
  // orphaned items (pointing at a hard-deleted board), the board fetch 404s and
  // this group renders nothing anyway, so there's no point also firing (and
  // console-logging) doomed columns/groups requests for it.
  const { data: columns = [] } = useColumns(boardId, !!board);
  const { data: allPersonalColumns = [] } = usePersonalColumns(ownerUserId);

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
  // Load for the hub's owner (self, or the user an admin is viewing). Fetch in both
  // cases — the admin needs to see the owner's values; `editable={isOwn}` keeps it read-only.
  const { data: personalValuesByItem = {} } = usePersonalItemValues([...new Set([...itemIds, ...displayItemIds])], ownerUserId);

  // Cross-group columns get a real spreadsheet-style grid — every displayed row across
  // EVERY board group is addressable ({B3} etc.), matching the real board's formula
  // behavior. The page assembles this across all groups; fall back to this group's own
  // rows only if the page hasn't wired it up.
  const localCrossGroupGridContext = useMemo<PersonalGridContext>(
    () => ({ rowOrder: displayItemIds, columns: crossGroupColumns, valuesByItem: personalValuesByItem, boardId }),
    [displayItemIds, crossGroupColumns, personalValuesByItem, boardId],
  );
  const crossGroupGridContext = pageCrossGroupGridContext ?? localCrossGroupGridContext;
  const boardOnlyGridContext = useMemo<PersonalGridContext>(
    () => ({ rowOrder: displayItemIds, columns: boardOnlyColumns, valuesByItem: personalValuesByItem, boardId }),
    [displayItemIds, boardOnlyColumns, personalValuesByItem, boardId],
  );

  // For cumulative cross-group summaries: rows from every board group above this one.
  // The page-wide grid's rowOrder is all groups' rows in display order, so anything
  // before this group's first row is "above". Values live in the same page-wide grid,
  // so lightweight {id}-only pseudo-items are enough for the summary aggregation.
  const crossGroupItemsAbove = useMemo<Item[]>(() => {
    if (displayItemIds.length === 0) return [];
    const start = crossGroupGridContext.rowOrder.indexOf(displayItemIds[0]);
    if (start <= 0) return [];
    return crossGroupGridContext.rowOrder.slice(0, start).map((id) => ({ id } as Item));
  }, [crossGroupGridContext, displayItemIds]);

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
    <div
      className="flex flex-col pt-8"
      aria-label={`Board group: ${board.name}`}
      // Match the board's uniform width so the sticky board-name below has room to stay
      // pinned across the full scroll. Without this the group root is only viewport-wide
      // (the table overflows it), so the name scrolls away once you pass that width.
      style={groupMinWidth ? { minWidth: `${groupMinWidth}px` } : undefined}
    >
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
          data-phub-row=""
          className="flex flex-nowrap items-stretch border-b border-[#d2d2d4] bg-gray-50 w-max rounded-t-lg"
          role="row"
          aria-label={`Column headers for ${board.name}`}
          style={groupMinWidth ? { minWidth: `${groupMinWidth}px` } : undefined}
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
          {/* Grey filler to the page's uniform board width — see ItemRow's groupMinWidth. */}
          {groupMinWidth ? <div className="flex-1 bg-gray-100 rounded-tr-lg" aria-hidden="true" /> : null}
        </div>

        <BoardRenderProvider visibleItems={displayItems} columns={columns} boardView={boardView} openChat={onOpenChat} groupsComplete={false}>
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
                      groupMinWidth={groupMinWidth}
                    />
                  ))}
                </SortableContext>
              )}
            </div>
          </DndContext>

          {/* Sum / average summary row — same component, same per-column config, as a
              normal board group. The source-column summaries persist to the shared
              Column doc (reflecting on the source board, like any other edit here);
              the personal cross-group / board-only column summaries are woven in
              around them with the same SummaryCell, computed client-side over the
              personal values and persisted to the personal column. */}
          {!stillResolving && (
            <GroupSummaryRow
              items={displayItems}
              columns={columns}
              minWidth={groupMinWidth}
              leadingExtraCells={crossGroupColumns.length > 0
                ? crossGroupColumns.map((col) => (
                    <SummaryCell
                      key={col.id}
                      col={col as unknown as SummaryColumn}
                      items={displayItems}
                      itemsAbove={crossGroupItemsAbove}
                      numberCols={[]}
                      widthOverride={PERSONAL_COL_WIDTH}
                      // Page-wide value source so both this group's rows and rows from
                      // groups above (cumulative scope) resolve.
                      getValue={(item) => crossGroupGridContext.valuesByItem[item.id]?.[col.id]}
                      evalFormula={col.type === ColumnType.SIMPLE_FORMULA ? makePersonalFormulaEvaluator(col, crossGroupGridContext) : undefined}
                      onPersist={(c: CellConfig) => { if (isOwn) updatePersonalColumn({ id: col.id, patch: { summaryConfig: c } }); }}
                      cumulative={col.summaryCumulativeByBoard?.[boardId] ?? false}
                      onCumulativeChange={isOwn ? (b) => updatePersonalColumn({ id: col.id, patch: { summaryCumulativeByBoard: { ...(col.summaryCumulativeByBoard ?? {}), [boardId]: b } } }) : undefined}
                    />
                  ))
                : undefined}
              trailingExtraCells={boardOnlyColumns.length > 0
                ? boardOnlyColumns.map((col) => (
                    <SummaryCell
                      key={col.id}
                      col={col as unknown as SummaryColumn}
                      items={displayItems}
                      numberCols={[]}
                      widthOverride={PERSONAL_COL_WIDTH}
                      getValue={(item) => personalValuesByItem[item.id]?.[col.id]}
                      evalFormula={col.type === ColumnType.SIMPLE_FORMULA ? makePersonalFormulaEvaluator(col, boardOnlyGridContext) : undefined}
                      onPersist={(c: CellConfig) => { if (isOwn) updatePersonalColumn({ id: col.id, patch: { summaryConfig: c } }); }}
                      cumulative={col.summaryCumulativeByBoard?.[boardId] ?? false}
                      onCumulativeChange={isOwn ? (b) => updatePersonalColumn({ id: col.id, patch: { summaryCumulativeByBoard: { ...(col.summaryCumulativeByBoard ?? {}), [boardId]: b } } }) : undefined}
                    />
                  ))
                : undefined}
            />
          )}
          </DependencyProvider>
        </BoardRenderProvider>
      </section>
    </div>
  );
};

export default PersonalHubBoardGroup;
