import React, { useState } from 'react';
import { FiX, FiType, FiHash, FiCalendar, FiCheckSquare } from 'react-icons/fi';
import { useCreatePersonalColumn } from '../../hooks/queries/usePersonalHubQueries';
import { ColumnType } from '../../types';
import type { PersonalColumnScope } from '../../types';

interface Props {
  boardId: string;
  boardName: string;
  onClose: () => void;
}

const CREATABLE_TYPES: { type: ColumnType; label: string; icon: React.ReactNode }[] = [
  { type: ColumnType.TEXT, label: 'Text', icon: <FiType size={14} aria-hidden="true" /> },
  { type: ColumnType.NUMBER, label: 'Number', icon: <FiHash size={14} aria-hidden="true" /> },
  { type: ColumnType.DATE, label: 'Date', icon: <FiCalendar size={14} aria-hidden="true" /> },
  { type: ColumnType.CHECKBOX, label: 'Checkbox', icon: <FiCheckSquare size={14} aria-hidden="true" /> },
];

const AddPersonalColumnModal: React.FC<Props> = ({ boardId, boardName, onClose }) => {
  const { mutateAsync: createColumn, isPending } = useCreatePersonalColumn();
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>(ColumnType.TEXT);
  const [scope, setScope] = useState<PersonalColumnScope | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Column name is required.');
      return;
    }
    if (!scope) {
      setError('Choose where this column should appear.');
      return;
    }
    try {
      await createColumn({
        name: trimmed,
        type,
        scope,
        ...(scope === 'board' ? { boardId } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create column.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10300] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-personal-column-title"
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 id="add-personal-column-title" className="text-base font-semibold text-gray-900">
            Add personal column
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <FiX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="personal-column-name" className="block text-xs font-medium text-gray-500 mb-1">
              Column name
            </label>
            <input
              id="personal-column-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. My notes"
              autoFocus
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">Column type</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Column type">
              {CREATABLE_TYPES.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  role="radio"
                  aria-checked={type === opt.type}
                  onClick={() => setType(opt.type)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    type === opt.type ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">Where should it appear?</span>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setScope('board')}
                className={`text-left px-3 py-2 text-sm rounded-lg border transition-colors ${
                  scope === 'board' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Add column only to current group
                <span className="block text-xs text-gray-400 mt-0.5">Only on “{boardName}” items in your Personal Hub</span>
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`text-left px-3 py-2 text-sm rounded-lg border transition-colors ${
                  scope === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Add column to all groups
                <span className="block text-xs text-gray-400 mt-0.5">On every board section in your Personal Hub</span>
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
            >
              {isPending ? 'Adding…' : 'Add column'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddPersonalColumnModal;
