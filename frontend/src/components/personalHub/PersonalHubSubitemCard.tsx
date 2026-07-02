import React, { useEffect, useRef, useState } from 'react';
import { FiTrash2, FiMessageSquare, FiCornerDownRight } from 'react-icons/fi';
import { useSubitemColumns } from '../../hooks/queries/useColumnQueries';
import { useItem, useArchiveItem, useUpdateItem } from '../../hooks/queries/useItemQueries';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useBoardRender } from '../../contexts/BoardRenderContext';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { calculateColumnWidth } from '../../utils/columnWidths';
import { ColumnCell } from '../boards/cells';
import { getUnreadCount } from '../boards/ItemChatModal';
import PersonalColumnCell from './PersonalColumnCell';
import PersonalColumnHeaderCell from './PersonalColumnHeaderCell';
import { PERSONAL_COL_WIDTH } from './constants';
import type { Group, Item, PersonalColumn } from '../../types';

interface Props {
  item: Item;
  boardId: string;
  group: Group;
  crossGroupColumns: PersonalColumn[];
  boardOnlyColumns: PersonalColumn[];
  personalValuesByItem: Record<string, Record<string, unknown>>;
  isOwn: boolean;
}

const NAME_COL_WIDTH = 220;

/**
 * Renders one assigned subitem exactly as it appears on the source board's
 * SubitemGroup panel: its own header row using the subitem group's own
 * columns (not the parent board's top-level columns), labeled with the
 * hosting (parent) item's name. Personal columns are woven in the same
 * order as the main board rows: cross-group columns first, then the real
 * subitem columns, then board-only personal columns.
 */
const PersonalHubSubitemCard: React.FC<Props> = ({ item, boardId, group, crossGroupColumns, boardOnlyColumns, personalValuesByItem, isOwn }) => {
  const { user } = useAuthSession();
  const { openChat } = useBoardRender();
  const { data: columns = [] } = useSubitemColumns(boardId, group.id, true);
  const { data: parentItem } = useItem(group.parentItemId ?? '', !!group.parentItemId);
  const { mutateAsync: archiveItem } = useArchiveItem();
  const { mutateAsync: updateItem } = useUpdateItem();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameValue(item.name); }, [item.name]);
  useEffect(() => { if (editingName) inputRef.current?.select(); }, [editingName]);

  const commitName = async () => {
    const trimmed = nameValue.trim();
    setEditingName(false);
    if (!trimmed || trimmed === item.name) { setNameValue(item.name); return; }
    await updateItem({ id: item.id, patch: { name: trimmed } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void commitName(); }
    if (e.key === 'Escape') { setNameValue(item.name); setEditingName(false); }
  };

  const unreadCount = user ? getUnreadCount(user.id, item) : 0;

  return (
    <div
      className="ml-8 my-2 border border-[#e5e7eb] rounded-lg overflow-hidden shadow-sm w-max"
      aria-label={`Subitem of ${parentItem?.name ?? 'parent item'}`}
    >
      <div className="px-3 py-1 bg-indigo-50/60 border-b border-[#e5e7eb] flex items-center gap-1.5 text-[11px] text-indigo-600">
        <FiCornerDownRight size={11} aria-hidden="true" />
        <span>Subitem of <span className="font-semibold">{parentItem?.name ?? '…'}</span></span>
      </div>

      <div className="flex flex-nowrap items-stretch bg-gray-50 border-b border-[#e5e7eb]" role="row">
        <div
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-gray-500 border-r border-[#e5e7eb]"
          style={{ width: `${NAME_COL_WIDTH}px`, minWidth: `${NAME_COL_WIDTH}px` }}
          role="columnheader"
        >
          Subitem
        </div>
        {crossGroupColumns.map((col) =>
          isOwn ? (
            <PersonalColumnHeaderCell key={col.id} column={col} />
          ) : (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${PERSONAL_COL_WIDTH}px`, minWidth: `${PERSONAL_COL_WIDTH}px` }}
              className="flex flex-shrink-0 items-center justify-center px-2 py-1.5 border-r border-[#e5e7eb] text-xs font-semibold text-indigo-600 bg-indigo-50/50"
              title={`${col.name} (personal column)`}
            >
              <span className="truncate">{col.name}</span>
            </div>
          ),
        )}
        {columns.map((col) => {
          const colWidth = col.width ?? calculateColumnWidth(col.name, col.type);
          return (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
              className="flex flex-shrink-0 items-center justify-center gap-1 px-2 py-1.5 border-r border-[#e5e7eb] text-xs font-semibold text-gray-500"
              title={col.name}
            >
              <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
              <span className="truncate">{col.name}</span>
            </div>
          );
        })}
        {boardOnlyColumns.map((col) =>
          isOwn ? (
            <PersonalColumnHeaderCell key={col.id} column={col} />
          ) : (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${PERSONAL_COL_WIDTH}px`, minWidth: `${PERSONAL_COL_WIDTH}px` }}
              className="flex flex-shrink-0 items-center justify-center px-2 py-1.5 border-r border-[#e5e7eb] text-xs font-semibold text-indigo-600 bg-indigo-50/50"
              title={`${col.name} (personal column)`}
            >
              <span className="truncate">{col.name}</span>
            </div>
          ),
        )}
      </div>

      <div role="row" className="flex flex-nowrap items-stretch bg-white hover:bg-indigo-50/30 transition-colors group">
        <div
          className="flex items-center px-3 py-1.5 min-w-0 flex-shrink-0 gap-1 border-r border-[#e5e7eb]"
          style={{ width: `${NAME_COL_WIDTH}px`, minWidth: `${NAME_COL_WIDTH}px` }}
          role="gridcell"
        >
          {editingName ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={handleKeyDown}
              className="flex-1 text-xs text-gray-700 bg-white border border-indigo-400 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Edit subitem name"
            />
          ) : (
            <span className="text-xs text-gray-700 truncate cursor-text flex-1" onClick={() => setEditingName(true)}>
              {item.name}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openChat(item); }}
            className="relative flex items-center justify-center w-5 h-5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
            aria-label={`Open chat for ${item.name}`}
          >
            <FiMessageSquare size={12} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[10px] h-[10px] px-0.5 bg-red-500 text-white text-[7px] font-bold rounded-full leading-none"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void archiveItem(item.id)}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
            aria-label={`Delete subitem ${item.name}`}
          >
            <FiTrash2 size={11} aria-hidden="true" />
          </button>
        </div>

        {crossGroupColumns.map((col) => (
          <div
            key={col.id}
            role="gridcell"
            style={{ width: `${PERSONAL_COL_WIDTH}px` }}
            className="flex flex-shrink-0 items-center justify-center border-r border-[#e5e7eb] last:border-r-0"
          >
            <PersonalColumnCell column={col} itemId={item.id} value={personalValuesByItem[item.id]?.[col.id]} editable={isOwn} />
          </div>
        ))}

        {columns.map((col) => (
          <ColumnCell key={col.id} item={item} column={col} />
        ))}

        {boardOnlyColumns.map((col) => (
          <div
            key={col.id}
            role="gridcell"
            style={{ width: `${PERSONAL_COL_WIDTH}px` }}
            className="flex flex-shrink-0 items-center justify-center border-r border-[#e5e7eb] last:border-r-0"
          >
            <PersonalColumnCell column={col} itemId={item.id} value={personalValuesByItem[item.id]?.[col.id]} editable={isOwn} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PersonalHubSubitemCard;
