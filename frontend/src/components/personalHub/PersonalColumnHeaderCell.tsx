import React, { useEffect, useRef, useState } from 'react';
import { FiEdit2, FiTrash2, FiMoreVertical } from 'react-icons/fi';
import { useUpdatePersonalColumn, useDeletePersonalColumn } from '../../hooks/queries/usePersonalHubQueries';
import { PERSONAL_COL_WIDTH } from './constants';
import type { PersonalColumn } from '../../types';

interface Props {
  column: PersonalColumn;
}

/**
 * Personal-column header cell with the same rename/delete context menu
 * pattern as a real board column's ColumnHeaderCell — scoped down since
 * personal columns don't support settings, type swaps, or drag reordering.
 */
const PersonalColumnHeaderCell: React.FC<Props> = ({ column }) => {
  const { mutateAsync: updateColumn, isPending: isUpdating } = useUpdatePersonalColumn();
  const { mutateAsync: deleteColumn, isPending: isDeleting } = useDeletePersonalColumn();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(column.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === column.name) {
      setIsRenaming(false);
      setNewName(column.name);
      return;
    }
    await updateColumn({ id: column.id, patch: { name: trimmed } });
    setIsRenaming(false);
    setMenuOpen(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleRename();
    if (e.key === 'Escape') { setIsRenaming(false); setNewName(column.name); }
  };

  const handleDelete = async () => {
    await deleteColumn(column.id);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div
      role="columnheader"
      style={{ width: `${PERSONAL_COL_WIDTH}px` }}
      className="relative flex flex-shrink-0 items-center px-2 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-indigo-600 bg-indigo-50/50 group"
      title={`${column.name} (your personal column)`}
    >
      <span className="flex-1 truncate text-center px-1">{column.name}</span>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 hover:text-indigo-700 rounded p-0.5 flex items-center justify-center"
          aria-label={`Options for ${column.name} column`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <FiMoreVertical size={12} aria-hidden="true" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
            aria-label="Personal column actions"
          >
            {isRenaming ? (
              <div className="px-3 py-2">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={() => void handleRename()}
                  onKeyDown={handleRenameKeyDown}
                  disabled={isUpdating}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Column name"
                />
              </div>
            ) : confirmDelete ? (
              <div className="px-3 py-2 space-y-1">
                <p className="text-xs text-red-600">Delete this column?</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={isDeleting}
                    className="flex-1 px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                    aria-label="Confirm delete"
                  >
                    {isDeleting ? '…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                    aria-label="Cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setIsRenaming(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Rename column"
                >
                  <FiEdit2 size={12} aria-hidden="true" />
                  Edit name
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Delete column"
                >
                  <FiTrash2 size={12} aria-hidden="true" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonalColumnHeaderCell;
