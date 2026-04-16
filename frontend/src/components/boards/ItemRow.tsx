import React, { useState } from 'react';
import { FiMenu, FiArchive, FiRotateCcw, FiTrash2 } from 'react-icons/fi';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useArchiveItem, useRestoreItem, useDeleteItem } from '../../hooks/queries/useItemQueries';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import type { Item, Column } from '../../types';

interface ItemRowProps {
  item: Item;
  isSelected: boolean;
  onSelectToggle: (id: string) => void;
  onOpenDetail: (item: Item) => void;
}

// Placeholder renderer for column cells — Phase 7D will replace this with typed cell components.
const ColumnCell: React.FC<{ column: Column; value: unknown }> = ({ column, value }) => {
  const display = value == null || value === '' ? '' : String(value);
  return (
    <div
      role="gridcell"
      className="flex items-center min-w-[120px] px-3 py-2 border-r border-gray-100 last:border-r-0 text-sm text-gray-700 truncate"
      aria-label={`${column.name}: ${display || 'empty'}`}
      title={display}
    >
      {display}
    </div>
  );
};

const ItemRow: React.FC<ItemRowProps> = ({ item, isSelected, onSelectToggle, onOpenDetail }) => {
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();

  const { mutateAsync: archiveItem, isPending: isArchiving } = useArchiveItem();
  const { mutateAsync: restoreItem, isPending: isRestoring } = useRestoreItem();
  const { mutateAsync: deleteItem, isPending: isDeleting } = useDeleteItem();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const canManage =
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.ACADEMY_ADMIN ||
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
      role="row"
      className={`flex items-stretch group border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/40 transition-colors ${
        item.isArchived ? 'opacity-60' : ''
      } ${isSelected ? 'bg-indigo-50' : 'bg-white'}`}
      aria-selected={isSelected}
    >
      {/* Drag handle — visual only; wired in Phase 7F */}
      <div
        className="flex items-center px-1 opacity-0 group-hover:opacity-40 cursor-grab text-gray-400 flex-shrink-0"
        aria-hidden="true"
      >
        <FiMenu size={13} />
      </div>

      {/* Checkbox */}
      <div role="gridcell" className="flex items-center px-2 flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectToggle(item.id)}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
          aria-label={`Select item ${item.name}`}
        />
      </div>

      {/* Item name — fixed column */}
      <div
        role="gridcell"
        className="flex items-center min-w-[240px] px-3 py-2 border-r border-gray-100 cursor-pointer"
        onClick={() => onOpenDetail(item)}
        aria-label={`Open details for ${item.name}`}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenDetail(item); }}
      >
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{item.name}</span>
        {item.isArchived && (
          <span className="ml-2 text-xs text-gray-400 flex-shrink-0">(archived)</span>
        )}
      </div>

      {/* Dynamic column cells */}
      {columns.map((col) => (
        <ColumnCell key={col.id} column={col} value={item.values[col.id]} />
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
