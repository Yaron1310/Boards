import React, { useState, useRef, useEffect } from 'react';
import { useColumns, useUpdateColumn, useDeleteColumn } from '../../hooks/queries/useColumnQueries';
import { FiLoader, FiColumns, FiEdit2, FiTrash2, FiCheck, FiX } from 'react-icons/fi';
import type { Column } from '../../types';
import AddColumnModal from './AddColumnModal';

const ColumnManagementPage: React.FC = () => {
  const { data: columns = [], isLoading, error } = useColumns();
  const { mutateAsync: updateColumn } = useUpdateColumn();
  const { mutateAsync: deleteColumn } = useDeleteColumn();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.select();
  }, [editingId]);

  const startEdit = (col: Column) => {
    setConfirmDeleteId(null);
    setActionError('');
    setEditingId(col.id);
    setEditingName(col.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const commitEdit = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    await updateColumn({ id, patch: { name: trimmed } }).catch((err: Error) => {
      setActionError(err.message || 'Failed to update column.');
    });
    cancelEdit();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') void commitEdit(id);
    if (e.key === 'Escape') cancelEdit();
  };

  const startDelete = (id: string) => {
    setEditingId(null);
    setActionError('');
    setConfirmDeleteId(id);
  };

  const cancelDelete = () => setConfirmDeleteId(null);

  const confirmDelete = async (id: string) => {
    setActionError('');
    await deleteColumn(id).catch((err: Error) => {
      setActionError(err.message || 'Failed to delete column.');
    });
    setConfirmDeleteId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading columns">
        <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load columns.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Column Management</h1>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          aria-label="Add new column"
          onClick={() => setShowAddModal(true)}
        >
          <FiColumns size={16} aria-hidden="true" />
          Add Column
        </button>
      </div>

      {actionError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-lg" role="alert">
          {actionError}
        </p>
      )}

      {columns.length === 0 ? (
        <p className="text-gray-500">No columns defined yet.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="grid" aria-label="Column definitions">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200" role="row">
                <th className="px-4 py-3 text-left font-semibold text-gray-700" scope="col">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700" scope="col">
                  Type
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr
                  key={col.id}
                  role="row"
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  {/* Name cell — inline edit or read */}
                  <td className="px-4 py-3 text-gray-800 font-medium" role="gridcell">
                    {editingId === col.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => handleEditKeyDown(e, col.id)}
                          onBlur={() => void commitEdit(col.id)}
                          className="flex-1 px-2 py-1 border border-indigo-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          aria-label={`Rename column ${col.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => void commitEdit(col.id)}
                          className="text-green-600 hover:text-green-700 p-1"
                          aria-label="Confirm rename"
                        >
                          <FiCheck size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-gray-400 hover:text-gray-600 p-1"
                          aria-label="Cancel rename"
                        >
                          <FiX size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      col.name
                    )}
                  </td>

                  {/* Type cell */}
                  <td className="px-4 py-3 text-gray-500 capitalize" role="gridcell">
                    {col.type.replace('_', ' ')}
                  </td>

                  {/* Actions cell */}
                  <td className="px-4 py-3 text-right" role="gridcell">
                    {confirmDeleteId === col.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">Delete?</span>
                        <button
                          type="button"
                          onClick={() => void confirmDelete(col.id)}
                          className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                          aria-label={`Confirm delete column ${col.name}`}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={cancelDelete}
                          className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                          aria-label="Cancel delete"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(col)}
                          disabled={editingId === col.id}
                          className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40"
                          aria-label={`Rename column ${col.name}`}
                        >
                          <FiEdit2 size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startDelete(col.id)}
                          className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          aria-label={`Delete column ${col.name}`}
                        >
                          <FiTrash2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && <AddColumnModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

export default ColumnManagementPage;
