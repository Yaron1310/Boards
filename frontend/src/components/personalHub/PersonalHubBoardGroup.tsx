import React, { useMemo, useState } from 'react';
import { FiLoader, FiPlus } from 'react-icons/fi';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { usePersonalColumns, usePersonalItemValues } from '../../hooks/queries/usePersonalHubQueries';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import { ColumnCell } from '../boards/cells';
import { formatItemName } from '../../utils/formatItemName';
import PersonalColumnCell from './PersonalColumnCell';
import AddPersonalColumnModal from './AddPersonalColumnModal';
import type { Item } from '../../types';

interface Props {
  boardId: string;
  items: Item[];
  isOwn: boolean;
  onOpenDetail: (item: Item) => void;
  onOpenChat: (item: Item) => void;
}

const PERSONAL_COL_WIDTH = 160;

/**
 * Renders one board's assigned items as a "group" in the Personal Hub — the
 * board name stands in for the group name, and each board keeps its own
 * column set since items here come from different boards.
 *
 * Source-board columns are always rendered read-only (BoardRenderProvider's
 * isBoardReadOnly locks CellWrapper editing) — this page mirrors real data,
 * it never mutates it. Personal columns (owned by the hub's user) are the
 * only editable fields here, and only the hub owner can edit them.
 */
const PersonalHubBoardGroup: React.FC<Props> = ({ boardId, items, isOwn, onOpenDetail, onOpenChat }) => {
  const { data: board, isLoading: boardLoading } = useBoard(boardId);
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
              title={`${col.name} (read-only — mirrors the source board)`}
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

        <BoardRenderProvider visibleItems={items} columns={columns} boardView="table" isBoardReadOnly openChat={onOpenChat}>
          <div role="rowgroup" aria-label={`Items assigned to you in ${board.name}`} className="w-max">
            {items.length === 0 ? (
              <div className="px-4 py-4 text-xs text-gray-400 italic">No assigned items on this board.</div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  role="row"
                  className="flex flex-nowrap items-stretch border-b border-[#d2d2d4] last:border-b-0 hover:bg-indigo-50/40 transition-colors w-max bg-white"
                >
                  <div
                    className="flex flex-shrink-0 items-center border-r border-[#d2d2d4] sticky left-4 z-[1] bg-white pl-3 py-2"
                    style={{ width: `${itemSectionWidth}px`, borderLeft: '4px solid #6366f1' }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenDetail(item)}
                      className="text-sm font-medium text-gray-800 truncate text-left hover:text-indigo-600 transition-colors"
                      aria-label={`Open details for ${item.name} (read-only)`}
                    >
                      {formatItemName(item.name)}
                    </button>
                  </div>

                  {columns.map((col) => (
                    <ColumnCell key={col.id} item={item} column={col} />
                  ))}

                  {personalColumns.map((col) => (
                    <div
                      key={col.id}
                      role="gridcell"
                      style={{ width: `${PERSONAL_COL_WIDTH}px` }}
                      className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0"
                    >
                      <PersonalColumnCell
                        column={col}
                        itemId={item.id}
                        value={personalValuesByItem[item.id]?.[col.id]}
                        editable={isOwn}
                      />
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </BoardRenderProvider>
      </section>

      {showAddColumn && (
        <AddPersonalColumnModal boardId={boardId} boardName={board.name} onClose={() => setShowAddColumn(false)} />
      )}
    </div>
  );
};

export default PersonalHubBoardGroup;
