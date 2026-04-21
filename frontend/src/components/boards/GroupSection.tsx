import React, { useState, useRef, useEffect } from 'react';
import {
  FiChevronDown, FiChevronRight, FiMoreHorizontal, FiPlus,
  FiEdit2, FiTrash2, FiLoader, FiMenu,
} from 'react-icons/fi';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCreateItem } from '../../hooks/queries/useItemQueries';
import { useUpdateGroup, useDeleteGroup } from '../../hooks/queries/useGroupQueries';
import { useAuth } from '../../hooks/useAuth';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import type { Group, Item } from '../../types';
import ItemRow from './ItemRow';
import { COLUMN_TYPE_ICONS } from './ColumnHeader';
import { calculateColumnWidth, GROUP_SECTION_WIDTH, DRAG_HANDLE_WIDTH } from '../../utils/columnWidths';

interface GroupSectionProps {
  group: Group;
  boardId: string;
  workspaceId: string;
  canManage: boolean;
  items: Item[];
  onOpenDetail: (item: Item) => void;
}

const GroupSection: React.FC<GroupSectionProps> = ({
  group,
  boardId,
  workspaceId,
  canManage,
  items,
  onOpenDetail,
}) => {
  const { user } = useAuth();
  const { data: columns = [] } = useColumns(boardId);

  const isCollapsed = group.isCollapsed ?? false;

  const { mutateAsync: updateGroup, isPending: isUpdating } = useUpdateGroup();
  const { mutateAsync: deleteGroup, isPending: isDeleting } = useDeleteGroup();
  const { mutateAsync: createItem, isPending: isCreatingItem } = useCreateItem();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(group.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const addItemInputRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    attributes: groupDragAttributes,
    listeners: groupDragListeners,
    setNodeRef: setGroupRef,
    transform: groupTransform,
    transition: groupTransition,
    isDragging: isGroupDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group' as const, group },
  });

  const groupStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(groupTransform),
    transition: groupTransition,
    opacity: isGroupDragging ? 0.5 : 1,
  };

  useEffect(() => {
    setNameValue(group.name);
  }, [group.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    if (addingItem) addItemInputRef.current?.focus();
  }, [addingItem]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const toggleCollapse = async () => {
    await updateGroup({ boardId, groupId: group.id, patch: { isCollapsed: !isCollapsed } });
  };

  const commitNameEdit = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === group.name) {
      setNameValue(group.name);
      return;
    }
    await updateGroup({ boardId, groupId: group.id, patch: { name: trimmed } }).catch(() => {
      setNameValue(group.name);
    });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitNameEdit();
    if (e.key === 'Escape') {
      setEditingName(false);
      setNameValue(group.name);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setConfirmDelete(false);
    await deleteGroup({ boardId, groupId: group.id });
  };

  const handleAddItem = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !user) return;
    await createItem({
      name: trimmed,
      workspaceId,
      boardId,
      groupId: group.id,
    });
    setNewItemName('');
    setAddingItem(false);
  };

  const handleAddItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddItem();
    if (e.key === 'Escape') {
      setAddingItem(false);
      setNewItemName('');
    }
  };

  const groupColor = group.color ?? '#6366f1';
  const itemCount = items.length;
  const itemIds = items.map((i) => i.id);

  return (
    <section
      ref={setGroupRef}
      style={groupStyle}
      className="rounded-lg border border-gray-200 bg-white w-max"
      aria-label={`Group: ${group.name}`}
    >
      {/* Group header with columns */}
      <div
        className="flex flex-nowrap items-stretch border-b border-[#d2d2d4] bg-gray-50 w-max rounded-tl-xl"
        role="row"
        aria-label={`Group header: ${group.name}`}
      >
        {/* Left section — fixed width to match ItemRow alignment */}
        <div className={`flex flex-shrink-0 items-stretch ${GROUP_SECTION_WIDTH} border-r border-[#d2d2d4] sticky left-4 bg-gray-50 rounded-tl-md ${menuOpen ? 'z-[30]' : 'z-[1]'}`} style={{ borderLeft: `4px solid ${groupColor}` }}>
          {/* Group drag handle */}
          {canManage && (
            <div
              className={`flex items-center justify-center ${DRAG_HANDLE_WIDTH} text-gray-500 hover:text-gray-700 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none`}
              aria-label="Drag to reorder group"
              aria-grabbed={isGroupDragging}
              {...groupDragAttributes}
              {...groupDragListeners}
            >
              <FiMenu size={13} aria-hidden="true" />
            </div>
          )}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => void toggleCollapse()}
            disabled={isUpdating}
            className="flex items-center justify-center w-5 h-5 self-center text-gray-400 hover:text-gray-600 rounded transition-colors flex-shrink-0"
            aria-label={isCollapsed ? `Expand group ${group.name}` : `Collapse group ${group.name}`}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed
              ? <FiChevronRight size={14} aria-hidden="true" />
              : <FiChevronDown size={14} aria-hidden="true" />}
          </button>

          {/* Group name and info */}
          <div className="flex items-center gap-1 px-2 py-2 flex-1 min-w-0" role="rowheader">
            {editingName && canManage ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => void commitNameEdit()}
                onKeyDown={handleNameKeyDown}
                disabled={isUpdating}
                className="text-base font-semibold text-gray-800 bg-transparent border-b border-indigo-500 outline-none"
                aria-label="Edit group name"
              />
            ) : (
              <h2
                className={`text-base font-semibold text-gray-800 truncate flex-1 ${
                  canManage ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''
                }`}
                onClick={() => canManage && setEditingName(true)}
                title={canManage ? 'Click to rename' : undefined}
              >
                {group.name}
              </h2>
            )}

            {/* Item count */}
            <span className="text-xs text-gray-400 flex-shrink-0" aria-label={`${itemCount} items`}>
              {itemCount}
            </span>
          </div>

          {/* Kebab menu */}
          {canManage && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                aria-label={`Group options for ${group.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <FiMoreHorizontal size={14} aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-36 border border-gray-200 rounded-lg shadow-lg z-[50] py-1 select-text"
                  style={{ backgroundColor: 'white' }}
                  aria-label="Group actions"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditingName(true);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    aria-label="Rename group"
                  >
                    <FiEdit2 size={13} aria-hidden="true" />
                    Rename
                  </button>

                  {confirmDelete ? (
                    <div className="px-3 py-2 space-y-1">
                      <p className="text-xs text-red-600">Delete this group?</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDelete()}
                          disabled={isDeleting}
                          className="flex-1 px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                          aria-label="Confirm delete group"
                        >
                          {isDeleting ? '…' : 'Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                          aria-label="Cancel delete"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Delete group"
                    >
                      <FiTrash2 size={13} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Column headers — widths match the top header row */}
        {columns.map((col) => (
          <div
            key={col.id}
            role="columnheader"
            style={{ width: `${calculateColumnWidth(col.name, col.type)}px` }}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-gray-600"
            title={col.name}
          >
            <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
            <span className="truncate">{col.name}</span>
          </div>
        ))}
      </div>

      {/* Item rows */}
      {!isCollapsed && (
        <div role="rowgroup" aria-label={`Items in ${group.name}`} className="w-max">
          {items.length === 0 ? (
            <div className="px-4 py-4 text-xs text-gray-400 italic">
              No items yet.
            </div>
          ) : (
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onOpenDetail={onOpenDetail}
                  groupColor={groupColor}
                />
              ))}
            </SortableContext>
          )}

          {/* Add item row */}
          {canManage && (
            <div>
              <div className="sticky left-4 w-max bg-white z-[1] rounded-bl-xl">
                {addingItem ? (
                  <div className="flex items-center gap-2 px-4 py-2">
                    <input
                      ref={addItemInputRef}
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={handleAddItemKeyDown}
                      onBlur={() => {
                        if (!newItemName.trim()) {
                          setAddingItem(false);
                        }
                      }}
                      placeholder="Item name… (Enter to save, Esc to cancel)"
                      disabled={isCreatingItem}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      aria-label="New item name"
                      aria-required="true"
                    />
                    {isCreatingItem && (
                      <FiLoader className="animate-spin text-indigo-500 flex-shrink-0" size={14} aria-hidden="true" />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingItem(true)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/60 transition-colors"
                    aria-label={`Add item to ${group.name}`}
                  >
                    <FiPlus size={13} aria-hidden="true" />
                    Add Item
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed summary bar */}
      {isCollapsed && (
        <div
          className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-[#d2d2d4]"
          aria-label={`${group.name} collapsed — ${itemCount} items`}
        >
          {itemCount} item{itemCount !== 1 ? 's' : ''} hidden
        </div>
      )}
    </section>
  );
};

export default GroupSection;
