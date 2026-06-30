import React, { useState, useRef, useEffect } from 'react';
import { FiPlus, FiLoader, FiTrash2, FiMessageSquare, FiMoreVertical, FiEdit2 } from 'react-icons/fi';
import AddColumnModal from './AddColumnModal';
import { useQueryClient } from '@tanstack/react-query';
import { useSubitemColumns, useDeleteColumn, useUpdateColumn } from '../../hooks/queries/useColumnQueries';
import { useSubitemGroup } from '../../hooks/queries/useGroupQueries';
import { useGroupItems, useCreateItem, useArchiveItem, useUpdateItem } from '../../hooks/queries/useItemQueries';
import { useCreateColumn } from '../../hooks/queries/useColumnQueries';
import { useCreateGroup } from '../../hooks/queries/useGroupQueries';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useBoardRender } from '../../contexts/BoardRenderContext';
import { ColumnType } from '../../types';
import type { Column, Item } from '../../types';
import { COLUMN_TYPE_ICONS } from './ColumnHeader';
import { ColumnCell } from './cells';
import { getUnreadCount } from './ItemChatModal';
import { calculateColumnWidth } from '../../utils/columnWidths';

const DEFAULT_STATUS_OPTIONS = [
  { id: 'todo', label: 'To Do', color: '#94a3b8' },
  { id: 'inprogress', label: 'In Progress', color: '#6366f1' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];

interface SubitemGroupProps {
  boardId: string;
  workspaceId: string;
  parentItemId: string;
}

const SubitemColumnHeader: React.FC<{ col: Column; boardId: string; subitemGroupId: string; colWidth: number }> = ({ col, boardId, subitemGroupId, colWidth }) => {
  const qc = useQueryClient();
  const { mutateAsync: deleteColumn, isPending: isDeleting } = useDeleteColumn(boardId);
  const { mutateAsync: updateColumn, isPending: isUpdating } = useUpdateColumn(boardId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(col.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNewName(col.name); }, [col.name]);
  useEffect(() => { if (isRenaming) renameInputRef.current?.select(); }, [isRenaming]);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === col.name) { setIsRenaming(false); setNewName(col.name); return; }
    await updateColumn({ id: col.id, patch: { name: trimmed } });
    await qc.invalidateQueries({ queryKey: queryKeys.columns.subitem(boardId, subitemGroupId) });
    setIsRenaming(false);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    await deleteColumn(col.id);
    await qc.invalidateQueries({ queryKey: queryKeys.columns.subitem(boardId, subitemGroupId) });
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div
      role="columnheader"
      style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
      className="relative flex flex-shrink-0 items-center justify-center gap-1 px-2 py-1.5 border-r border-[#e5e7eb] text-xs font-semibold text-gray-500 group/hdr"
    >
      <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
      <span className="truncate">{col.name}</span>

      <div className="relative ml-auto flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="opacity-0 group-hover/hdr:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 rounded p-0.5 flex items-center justify-center"
          aria-label={`Options for ${col.name} column`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <FiMoreVertical size={11} aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-[9995] py-1"
            aria-label="Column actions"
          >
            {isRenaming ? (
              <div className="px-3 py-2">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => void handleRename()}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleRename(); if (e.key === 'Escape') { setIsRenaming(false); setNewName(col.name); } }}
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Column name"
                />
              </div>
            ) : confirmDelete ? (
              <div className="px-3 py-2 space-y-1">
                <p className="text-xs text-red-600">Delete this column?</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => void handleDelete()} disabled={isDeleting}
                    className="flex-1 px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 disabled:opacity-60" aria-label="Confirm delete">
                    {isDeleting ? '…' : 'Delete'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200" aria-label="Cancel">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => setIsRenaming(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors" aria-label="Rename column">
                  <FiEdit2 size={11} aria-hidden="true" /> Edit name
                </button>
                <button type="button" role="menuitem" onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors" aria-label="Delete column">
                  <FiTrash2 size={11} aria-hidden="true" /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const SubitemRow: React.FC<{ item: Item; columns: Column[] }> = ({ item, columns }) => {
  const { user } = useAuthSession();
  const { openChat } = useBoardRender();
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
      role="row"
      className="flex flex-nowrap items-stretch border-b border-[#e5e7eb] hover:bg-indigo-50/30 transition-colors group bg-white"
    >
      {/* Name cell — fixed 220px to match header */}
      <div
        className="flex items-center px-3 py-1.5 min-w-0 flex-shrink-0 gap-1 border-r border-[#e5e7eb]"
        style={{ width: '220px', minWidth: '220px' }}
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
          <span
            className="text-xs text-gray-700 truncate cursor-text flex-1"
            onClick={() => setEditingName(true)}
          >
            {item.name}
          </span>
        )}

        {/* Chat button */}
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

        {/* Delete button */}
        <button
          type="button"
          onClick={() => void archiveItem(item.id)}
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
          aria-label={`Delete subitem ${item.name}`}
        >
          <FiTrash2 size={11} aria-hidden="true" />
        </button>
      </div>

      {/* Dynamic column cells — width is controlled by ColumnCell internally */}
      {columns.map((col) => (
        <ColumnCell key={col.id} item={item} column={col} />
      ))}
      {/* Sentinel: prevents CSS last:border-r-0 from hiding the last cell's right border */}
      <div className="w-0 flex-shrink-0" aria-hidden="true" />
    </div>
  );
};

const SubitemGroup: React.FC<SubitemGroupProps> = ({ boardId, workspaceId, parentItemId }) => {
  const { user } = useAuthSession();
  const { columnWidths } = useBoardRender();
  const qc = useQueryClient();
  const [isInitializing, setIsInitializing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  // Deferred auto-focus: set during initialize(), consumed once isLoading turns false
  const [pendingAutoFocus, setPendingAutoFocus] = useState(false);
  const addItemInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusOnMount = useRef(false);
  const [showAddColModal, setShowAddColModal] = useState(false);

  const { mutateAsync: createGroup } = useCreateGroup();
  const { mutateAsync: createColumn } = useCreateColumn(boardId);
  const { mutateAsync: createItem, isPending: isCreatingItem } = useCreateItem();

  const { data: subitemGroup, isLoading: groupLoading } = useSubitemGroup(boardId, parentItemId);

  const { data: columns = [], isLoading: columnsLoading } = useSubitemColumns(
    boardId,
    subitemGroup?.id ?? '',
    !!subitemGroup,
  );

  const { data: itemsPage, isFetching: itemsFetching } = useGroupItems(
    subitemGroup?.id ?? '',
    undefined,
    200,
    !!subitemGroup,
  );

  const items = itemsPage?.data ?? [];

  const isLoading = groupLoading || isInitializing || (!!subitemGroup && columnsLoading);

  // Open and focus the add-item input once loading settles (after first-time initialization)
  useEffect(() => {
    if (!isLoading && pendingAutoFocus) {
      setPendingAutoFocus(false);
      setAddingItem(true);
    }
  }, [isLoading, pendingAutoFocus]);

  // No explicit focus effect needed — the input uses autoFocus and a ref callback

  const initialize = async () => {
    if (!user || isInitializing || subitemGroup !== null) return;
    setIsInitializing(true);
    try {
      const group = await createGroup({
        boardId,
        data: { name: 'Subitems', color: '#94a3b8', parentItemId },
      });

      await createColumn({ name: 'Person', type: ColumnType.PERSON, settings: { multiple: true }, parentGroupId: group.id });
      await createColumn({ name: 'Status', type: ColumnType.STATUS, settings: { options: DEFAULT_STATUS_OPTIONS }, parentGroupId: group.id });
      await createColumn({ name: 'Date', type: ColumnType.DATE, settings: {}, parentGroupId: group.id });

      await qc.invalidateQueries({ queryKey: queryKeys.groups.subitem(boardId, parentItemId) });

      // Signal that we want auto-focus after the loading state clears
      shouldFocusOnMount.current = true;
      setPendingAutoFocus(true);
    } finally {
      setIsInitializing(false);
    }
  };

  // Auto-initialize on first render if no subitem group exists yet
  useEffect(() => {
    if (!groupLoading && subitemGroup === null && !isInitializing) {
      void initialize();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupLoading, subitemGroup]);

  const handleAddItem = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !user || !subitemGroup) return;
    await createItem({ name: trimmed, workspaceId, boardId, groupId: subitemGroup.id });
    setNewItemName('');
    setAddingItem(false);
  };

  const handleAddItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddItem();
    if (e.key === 'Escape') { setAddingItem(false); setNewItemName(''); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 pl-10 py-2 text-xs text-gray-400">
        <FiLoader size={11} className="animate-spin" aria-hidden="true" />
        Setting up subitems…
      </div>
    );
  }

  const NAME_COL_WIDTH = 220;

  return (
    // No overflow-hidden — lets cell menus (person picker, status, etc.) escape the container.
    // position:relative + z-index ensures this panel stacks above the board rows below it.
    <div
      className="relative z-[50] ml-8 mt-2 mb-1 border border-[#e5e7eb] rounded-lg bg-white shadow-sm"
      role="region"
      aria-label="Subitems"
    >
      {/* Column header row */}
      <div
        className="flex flex-nowrap items-stretch border-b border-[#e5e7eb] bg-gray-50 rounded-t-lg"
        role="row"
      >
        <div
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold text-gray-500 border-r border-[#e5e7eb]"
          style={{ width: `${NAME_COL_WIDTH}px`, minWidth: `${NAME_COL_WIDTH}px` }}
          role="columnheader"
        >
          Subitem
        </div>
        {columns.map((col) => {
          const colWidth = columnWidths[col.id] ?? col.width ?? calculateColumnWidth(col.name, col.type);
          return (
            <SubitemColumnHeader
              key={col.id}
              col={col}
              boardId={boardId}
              subitemGroupId={subitemGroup!.id}
              colWidth={colWidth}
            />
          );
        })}

        {/* Add column button */}
        <button
          type="button"
          onClick={() => setShowAddColModal(true)}
          className="flex items-center justify-center w-8 flex-shrink-0 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
          aria-label="Add subitem column"
        >
          <FiPlus size={13} aria-hidden="true" />
        </button>
      </div>

      {showAddColModal && subitemGroup && (
        <AddColumnModal
          boardId={boardId}
          parentGroupId={subitemGroup.id}
          onClose={() => setShowAddColModal(false)}
        />
      )}

      {/* Item rows */}
      <div role="rowgroup">
        {itemsFetching && items.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1">
            <FiLoader size={10} className="animate-spin" aria-hidden="true" /> Loading…
          </div>
        ) : (
          items.map((item) => (
            <SubitemRow key={item.id} item={item} columns={columns} />
          ))
        )}
      </div>

      {/* Add subitem row */}
      <div className="px-3 py-1.5 rounded-b-lg">
        {addingItem ? (
          <div className="flex items-center gap-2">
            <input
              ref={(el) => {
                addItemInputRef.current = el;
                if (el && shouldFocusOnMount.current) {
                  shouldFocusOnMount.current = false;
                  el.focus();
                }
              }}
              autoFocus
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={handleAddItemKeyDown}
              onBlur={() => { if (!newItemName.trim()) setAddingItem(false); }}
              placeholder="Subitem name… (Enter to save)"
              disabled={isCreatingItem}
              className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="New subitem name"
            />
            {isCreatingItem && <FiLoader size={11} className="animate-spin text-indigo-500" aria-hidden="true" />}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            aria-label="Add subitem"
          >
            <FiPlus size={12} aria-hidden="true" />
            Add subitem
          </button>
        )}
      </div>
    </div>
  );
};

export default SubitemGroup;
