import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FiLoader, FiPlus, FiExternalLink } from 'react-icons/fi';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { usePersonalColumns, usePersonalItemValues } from '../../hooks/queries/usePersonalHubQueries';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { DependencyProvider } from '../../contexts/DependencyContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import PersonalHubItemRow from './PersonalHubItemRow';
import AddPersonalColumnModal from './AddPersonalColumnModal';
import { PERSONAL_COL_WIDTH } from './constants';
import type { Item } from '../../types';

interface Props {
  boardId: string;
  items: Item[];
  isOwn: boolean;
  onOpenDetail: (item: Item) => void;
  onOpenChat: (item: Item) => void;
}

/**
 * Renders one board's assigned items as a "group" in the Personal Hub — the
 * board name stands in for the group name, and each board keeps its own
 * column set since items here come from different boards.
 *
 * Source-board columns are the real, live item data — edits here save
 * straight back to the source board (same permission rules as viewing that
 * board directly). Personal columns (owned by the hub's user) are appended
 * after them and are only editable by the hub's owner.
 */
const PersonalHubBoardGroup: React.FC<Props> = ({ boardId, items, isOwn, onOpenDetail, onOpenChat }) => {
  const navigate = useNavigate();
  const { data: board, isLoading: boardLoading, isError: boardError } = useBoard(boardId);
  const { data: columns = [] } = useColumns(boardId);
  const { data: allPersonalColumns = [] } = usePersonalColumns();
  const [showAddColumn, setShowAddColumn] = useState(false);

  const personalColumns = useMemo(
    () => allPersonalColumns.filter((c) => c.scope === 'all' || c.boardId === boardId),
    [allPersonalColumns, boardId],
  );

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: personalValuesByItem = {} } = usePersonalItemValues(itemIds, isOwn);

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
          {personalColumns.map((col) => (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${PERSONAL_COL_WIDTH}px` }}
              className="flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-indigo-600 bg-indigo-50/50"
              title={`${col.name} (your personal column)`}
            >
              <span className="truncate">{col.name}</span>
            </div>
          ))}
          {isOwn && (
            <div className="flex-shrink-0 flex items-center justify-center px-1">
              <button
                type="button"
                onClick={() => setShowAddColumn(true)}
                className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                aria-label={`Add a personal column to ${board.name}`}
                title="Add personal column"
              >
                <FiPlus size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <BoardRenderProvider visibleItems={items} columns={columns} boardView="table" openChat={onOpenChat}>
          <DependencyProvider items={items}>
          <DndContext onDragEnd={() => {}}>
            <div role="rowgroup" aria-label={`Items assigned to you in ${board.name}`} className="w-max">
              {items.length === 0 ? (
                <div className="px-4 py-4 text-xs text-gray-400 italic">No assigned items on this board.</div>
              ) : (
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  {items.map((item) => (
                    <PersonalHubItemRow
                      key={item.id}
                      item={item}
                      boardId={boardId}
                      personalColumns={personalColumns}
                      personalValuesByItem={personalValuesByItem}
                      isOwn={isOwn}
                      onOpenDetail={onOpenDetail}
                    />
                  ))}
                </SortableContext>
              )}
            </div>
          </DndContext>
          </DependencyProvider>
        </BoardRenderProvider>
      </section>

      {showAddColumn && (
        <AddPersonalColumnModal boardId={boardId} boardName={board.name} onClose={() => setShowAddColumn(false)} />
      )}
    </div>
  );
};

export default PersonalHubBoardGroup;
