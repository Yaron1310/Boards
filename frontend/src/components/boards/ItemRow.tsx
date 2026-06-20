import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiMenu, FiArchive, FiRotateCcw, FiTrash2, FiMessageSquare, FiEdit2 } from 'react-icons/fi';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useArchiveItem, useRestoreItem, useUpdateItem } from '../../hooks/queries/useItemQueries';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useUndo } from '../../contexts/UndoContext';
import { useBoardMembers } from '../../hooks/queries/useBoardMemberQueries';
import { UserRole, BoardRole } from '../../types';
import { formatItemName } from '../../utils/formatItemName';
import type { Item } from '../../types';
import { ColumnCell } from './cells';
import { DRAG_HANDLE_WIDTH } from '../../utils/columnWidths';
import { ITEM_COL_ID } from './ColumnHeader';
import { useBoardRender } from '../../contexts/BoardRenderContext';
import { getUnreadCount } from './ItemChatModal';

interface ItemRowProps {
  item: Item;
  onOpenDetail: (item: Item) => void;
  groupColor?: string;
}

const ItemRowInner: React.FC<ItemRowProps> = ({ item, onOpenDetail, groupColor }) => {
  const { user } = useAuthSession();
  const { data: columns = [] } = useColumns(item.boardId);
  const { boardView, columnWidths, openChat } = useBoardRender();
  const itemSectionWidth = (columnWidths[ITEM_COL_ID] ?? 298) - 16;

  const { mutateAsync: archiveItem, isPending: isArchiving } = useArchiveItem();
  const { mutateAsync: restoreItem, isPending: isRestoring } = useRestoreItem();
  const { push: pushUndo } = useUndo();
  const { data: boardMembers = [] } = useBoardMembers(item.boardId);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: updateItem } = useUpdateItem();

  useEffect(() => { setNameValue(item.name); }, [item.name]);

  useEffect(() => {
    if (editingName) inputRef.current?.select();
  }, [editingName]);

  const commitName = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === item.name) {
      setNameValue(item.name);
      setEditingName(false);
      return;
    }
    setEditingName(false);
    await updateItem({ id: item.id, patch: { name: trimmed } });
  }, [nameValue, item.name, item.id, updateItem]);

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitName(); }
    if (e.key === 'Escape') { setNameValue(item.name); setEditingName(false); }
  };

  const unreadCount = user ? getUnreadCount(user.id, item) : 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'item' as const, item },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const myBoardRole = boardMembers.find((m) => m.userId === user?.id)?.role;
  const isBoardEditor = myBoardRole === BoardRole.EDITOR || myBoardRole === BoardRole.ADMIN;

  const canManage =
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORG_EDITOR ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN ||
    isBoardEditor ||
    item.createdBy === user?.id ||
    (item.assignees ?? []).includes(user?.id ?? '');

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await archiveItem(item.id);
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await restoreItem(item.id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const itemId = item.id;
    const itemName = item.name;
    await archiveItem(itemId);
    pushUndo({
      label: `Deleted item "${itemName}"`,
      undo: () => { void restoreItem(itemId); },
    });
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <div
      ref={setNodeRef}
      role="row"
      style={style}
      className={`flex flex-nowrap items-stretch group border-b border-[#d2d2d4] last:border-b-0 hover:bg-indigo-50/40 transition-colors w-max ${
        item.isArchived ? 'opacity-60' : ''
      } bg-white ${isDragging ? 'shadow-md opacity-50 z-10' : ''}`}
    >
      {/* Left section — drag handle, item name, and row actions */}
      <div
        className={`flex flex-shrink-0 items-stretch ${boardView !== 'rows' ? 'border-r border-[#d2d2d4]' : ''} sticky left-4 z-[1] bg-white group-hover:bg-indigo-50`}
        style={{ width: `${itemSectionWidth}px`, ...(groupColor ? { borderLeft: `4px solid ${groupColor}` } : {}) }}
      >
        {/* Drag handle */}
        <div
          className={`flex items-center justify-center ${DRAG_HANDLE_WIDTH} opacity-0 group-hover:opacity-40 cursor-grab active:cursor-grabbing text-gray-400 flex-shrink-0 touch-none`}
          aria-label="Drag to reorder item"
          aria-grabbed={isDragging}
          {...attributes}
          {...listeners}
        >
          <FiMenu size={13} aria-hidden="true" />
        </div>

        {/* Item name */}
        <div
          role="gridcell"
          className="flex items-center flex-1 min-w-0 pl-3 py-2 group-hover:pr-3"
        >
          {editingName && canManage ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitName}
              onKeyDown={handleNameKeyDown}
              onClick={e => e.stopPropagation()}
              className="w-full text-sm font-medium text-gray-800 bg-white border border-indigo-400 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Edit item name"
            />
          ) : (
            <div
              className="flex items-center gap-1 flex-1 min-w-0 cursor-text group/name"
              onClick={() => canManage ? setEditingName(true) : onOpenDetail(item)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') canManage ? setEditingName(true) : onOpenDetail(item); }}
              aria-label={canManage ? `Edit name of ${item.name}` : `Open details for ${item.name}`}
            >
              <span className="text-sm font-medium text-gray-800 truncate">{formatItemName(item.name)}</span>
              {item.isArchived && (
                <span className="ml-2 text-xs text-gray-400 flex-shrink-0">(archived)</span>
              )}
              {canManage && (
                <FiEdit2
                  size={10}
                  aria-hidden="true"
                  className="flex-shrink-0 text-gray-400 w-0 overflow-hidden group-hover:w-auto ml-0 group-hover:ml-1 transition-all"
                />
              )}
            </div>
          )}
        </div>

        {/* Row actions — hidden until hover */}
        <div
          className="flex items-center gap-2 flex-shrink-0 w-0 overflow-hidden group-hover:w-auto group-hover:overflow-visible transition-all duration-150"
          role="gridcell"
          aria-label="Row actions"
        >
          {canManage && (
            <>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={isArchiving}
                    className="px-1.5 py-0.5 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                    aria-label="Confirm delete"
                  >
                    {isArchiving ? '…' : 'Del'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCancel}
                    className="px-1.5 py-0.5 text-xs text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-0.5">
                  {item.isArchived ? (
                    <button
                      type="button"
                      onClick={handleRestore}
                      disabled={isRestoring}
                      className="flex items-center justify-center w-6 h-6 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-60"
                      aria-label={`Restore item ${item.name}`}
                    >
                      <FiRotateCcw size={13} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={isArchiving}
                      className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-60"
                      aria-label={`Archive item ${item.name}`}
                    >
                      <FiArchive size={13} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    aria-label={`Delete item ${item.name}`}
                  >
                    <FiTrash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat bubble — always visible */}
        <div className="flex items-center pr-1.5 flex-shrink-0" role="gridcell">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openChat(item); }}
            className="relative flex items-center justify-center w-6 h-6 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
            aria-label={`Open chat for ${item.name}`}
          >
            <FiMessageSquare size={16} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-[14px] px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full leading-none"
                aria-label={`${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Dynamic column cells */}
      {columns.map((col) => (
        <ColumnCell key={col.id} item={item} column={col} groupColor={groupColor} />
      ))}

    </div>
  );
};

const ItemRow = React.memo(ItemRowInner);
export default ItemRow;
