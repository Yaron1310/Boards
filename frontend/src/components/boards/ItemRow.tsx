import React, { useState } from 'react';
import { FiMenu, FiArchive, FiRotateCcw, FiTrash2 } from 'react-icons/fi';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useArchiveItem, useRestoreItem, useDeleteItem } from '../../hooks/queries/useItemQueries';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import type { Item } from '../../types';
import { ColumnCell } from './cells';
import { ITEM_SECTION_WIDTH, DRAG_HANDLE_WIDTH } from '../../utils/columnWidths';

interface ItemRowProps {
  item: Item;
  onOpenDetail: (item: Item) => void;
  groupColor?: string;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, onOpenDetail, groupColor }) => {
  const { user } = useAuth();
  const { data: columns = [] } = useColumns(item.boardId);

  const { mutateAsync: archiveItem, isPending: isArchiving } = useArchiveItem();
  const { mutateAsync: restoreItem, isPending: isRestoring } = useRestoreItem();
  const { mutateAsync: deleteItem, isPending: isDeleting } = useDeleteItem();

  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const canManage =
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN ||
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
    await deleteItem(item.id);
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
      {/* Left section — drag handle and item name */}
      <div
        className={`flex flex-shrink-0 items-stretch ${ITEM_SECTION_WIDTH} border-r border-[#d2d2d4] sticky left-4 z-[1] bg-white group-hover:bg-indigo-50/40`}
        style={groupColor ? { borderLeft: `4px solid ${groupColor}` } : undefined}
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
          className="flex items-center flex-1 px-3 py-2 cursor-pointer"
          onClick={() => onOpenDetail(item)}
          aria-label={`Open details for ${item.name}`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenDetail(item); }}
        >
          <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
          {item.isArchived && (
            <span className="ml-2 text-xs text-gray-400 flex-shrink-0">(archived)</span>
          )}
        </div>
      </div>

      {/* Dynamic column cells */}
      {columns.map((col) => (
        <ColumnCell key={col.id} item={item} column={col} />
      ))}

      {/* Row actions — visible on hover */}
      {canManage && (
        <div
          className="flex items-center gap-1 px-2 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          role="gridcell"
          aria-label="Row actions"
        >
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                aria-label="Confirm delete"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ItemRow;
