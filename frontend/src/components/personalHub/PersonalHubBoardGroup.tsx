import React from 'react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import ItemRow from '../boards/ItemRow';
import type { Item } from '../../types';
import { FiLoader } from 'react-icons/fi';

interface Props {
  boardId: string;
  items: Item[];
  onOpenDetail: (item: Item) => void;
  onOpenChat: (item: Item) => void;
}

/**
 * Renders one board's assigned items as a "group" in the Personal Hub — the
 * board name stands in for the group name, and each board keeps its own
 * column set since items here come from different boards.
 */
const PersonalHubBoardGroup: React.FC<Props> = ({ boardId, items, onOpenDetail, onOpenChat }) => {
  const { data: board, isLoading: boardLoading } = useBoard(boardId);
  const { data: columns = [] } = useColumns(boardId);

  const itemSectionWidth = 298 - 16;
  const itemIds = items.map((i) => i.id);

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
        </div>

        <BoardRenderProvider visibleItems={items} columns={columns} boardView="table" openChat={onOpenChat}>
          <DndContext onDragEnd={() => {}}>
            <div role="rowgroup" aria-label={`Items assigned to you in ${board.name}`} className="w-max">
              {items.length === 0 ? (
                <div className="px-4 py-4 text-xs text-gray-400 italic">No assigned items on this board.</div>
              ) : (
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} onOpenDetail={onOpenDetail} groupColor="#6366f1" />
                  ))}
                </SortableContext>
              )}
            </div>
          </DndContext>
        </BoardRenderProvider>
      </section>
    </div>
  );
};

export default PersonalHubBoardGroup;
