import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FiEdit2, FiTrash2, FiMoreVertical, FiSettings, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { useUpdatePersonalColumn, useDeletePersonalColumn } from '../../hooks/queries/usePersonalHubQueries';
import { ColumnType } from '../../types';
import type { PersonalColumn } from '../../types';
import { PERSONAL_COL_WIDTH } from './constants';
import AddColumnModal from '../boards/AddColumnModal';
import EditColumnConfigModal from '../boards/EditColumnConfigModal';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';

interface Props {
  column: PersonalColumn;
}

const CONFIGURABLE_TYPES = [ColumnType.TEXT, ColumnType.NUMBER, ColumnType.STATUS, ColumnType.DROPDOWN, ColumnType.SIMPLE_FORMULA];

/**
 * Cross-group personal column header — same menu affordances as a real
 * board column's ColumnHeaderCell (rename, settings, add left/right, change
 * type, delete), just pointed at the personal-hub column endpoints.
 */
const PersonalColumnHeaderCell: React.FC<Props> = ({ column }) => {
  const qc = useQueryClient();
  const { mutateAsync: updateColumn, isPending: isUpdating } = useUpdatePersonalColumn();
  const { mutateAsync: deleteColumn, isPending: isDeleting } = useDeletePersonalColumn();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(column.name);
  const [showEditConfigModal, setShowEditConfigModal] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [insertPosition, setInsertPosition] = useState<'left' | 'right' | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [showSwapWarning, setShowSwapWarning] = useState(false);

  const isConfigurable = CONFIGURABLE_TYPES.includes(column.type);
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

  const handleAddColumn = (position: 'left' | 'right') => {
    setInsertPosition(position);
    setSwapMode(false);
    setShowAddColumnModal(true);
    setMenuOpen(false);
  };

  const columnHasData = (): boolean => {
    const cached = qc.getQueriesData<Record<string, Record<string, unknown>>>({ queryKey: ['personalHub', 'itemValues'] });
    for (const [, data] of cached) {
      if (!data) continue;
      for (const values of Object.values(data)) {
        const val = values?.[column.id];
        if (val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
          return true;
        }
      }
    }
    return false;
  };

  const proceedWithSwap = () => {
    setShowSwapWarning(false);
    setInsertPosition('left');
    setSwapMode(true);
    setShowAddColumnModal(true);
  };

  const handleSwapType = () => {
    setMenuOpen(false);
    if (columnHasData()) {
      setShowSwapWarning(true);
    } else {
      proceedWithSwap();
    }
  };

  return (
    <div
      role="columnheader"
      style={{ width: `${PERSONAL_COL_WIDTH}px` }}
      className="relative flex flex-shrink-0 items-center px-2 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-indigo-600 bg-indigo-50/50 group"
      title={`${column.name} (your personal column)`}
    >
      <span className="flex flex-1 items-center justify-center gap-1.5 min-w-0 truncate px-1">
        <span className="text-indigo-400 flex-shrink-0" title={column.type}>
          {COLUMN_TYPE_ICONS[column.type]}
        </span>
        <span className="truncate">{column.name}</span>
      </span>

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
                {isConfigurable && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setShowEditConfigModal(true); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    aria-label="Edit column configuration"
                  >
                    <FiSettings size={12} aria-hidden="true" />
                    Settings
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleAddColumn('left')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Add column to the left"
                >
                  <FiPlus size={12} aria-hidden="true" />
                  Add left
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleAddColumn('right')}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Add column to the right"
                >
                  <FiPlus size={12} aria-hidden="true" />
                  Add right
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSwapType}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Change column type"
                >
                  <FiRefreshCw size={12} aria-hidden="true" />
                  Change type
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

      {showAddColumnModal && (
        <AddColumnModal
          mode="personal"
          personalScope="all"
          onClose={() => { setShowAddColumnModal(false); setInsertPosition(null); setSwapMode(false); }}
          insertAfterColumnId={!swapMode && insertPosition === 'right' ? column.id : undefined}
          insertBeforeColumnId={!swapMode && insertPosition === 'left' ? column.id : undefined}
          replaceColumnId={swapMode ? column.id : undefined}
        />
      )}

      {showEditConfigModal && (
        <EditColumnConfigModal
          mode="personal"
          column={column}
          onClose={() => setShowEditConfigModal(false)}
        />
      )}

      {showSwapWarning && (
        <div
          className="fixed inset-0 z-[10300] flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="personal-swap-type-warning-title"
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 id="personal-swap-type-warning-title" className="text-sm font-semibold text-gray-900 mb-2">
              Change column type?
            </h2>
            <p className="text-sm text-gray-600 mb-5">
              This column contains data that will be <strong>permanently deleted</strong> when you change its type. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSwapWarning(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedWithSwap}
                className="px-3 py-1.5 text-xs text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                aria-label="Continue changing column type"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalColumnHeaderCell;
