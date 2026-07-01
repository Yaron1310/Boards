import React, { useState, useRef, useEffect } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import { useCreateGroup } from '../../hooks/queries/useGroupQueries';

const GROUP_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#64748b', // slate
  '#a16207', // amber-dark
];

interface AddGroupFormProps {
  boardId: string;
  onClose: () => void;
  /** When set, the new group is inserted before the group with this order
   * (used for the "add group to top" button) instead of appended at the end. */
  insertBeforeOrder?: number;
}

const AddGroupForm: React.FC<AddGroupFormProps> = ({ boardId, onClose, insertBeforeOrder }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createGroup, isPending } = useCreateGroup();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Group name is required.');
      return;
    }
    setError('');
    try {
      await createGroup({
        boardId,
        data: {
          name: trimmed,
          color,
          ...(insertBeforeOrder !== undefined ? { order: insertBeforeOrder - 1 } : {}),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-indigo-200 rounded-lg shadow-sm"
      role="form"
      aria-label="Add new group"
    >
      {/* Color picker */}
      <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label="Group color">
        {GROUP_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className="w-4 h-4 rounded-full flex-shrink-0 ring-offset-1 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{
              backgroundColor: c,
              boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined,
            }}
            aria-label={`Select color ${c}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      {/* Name input */}
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Group name…"
          disabled={isPending}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          aria-label="Group name"
          aria-required="true"
          aria-describedby={error ? 'group-name-error' : undefined}
        />
        {error && (
          <p id="group-name-error" className="mt-0.5 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center w-7 h-7 text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors disabled:opacity-60"
          aria-label="Save group"
        >
          <FiCheck size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="flex items-center justify-center w-7 h-7 text-gray-400 hover:text-gray-600 rounded transition-colors"
          aria-label="Cancel"
        >
          <FiX size={14} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
};

export default AddGroupForm;
