import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiX, FiLayout } from 'react-icons/fi';
import { useCreateBoard } from '../../hooks/queries/useBoardQueries';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const BOARD_EMOJIS = ['📋', '🎯', '🚀', '📊', '📈', '🎨', '💡', '🔧', '⚡', '🏆', '✅', '📝', '🎭', '🌟', '📱', '🔐', '🌐', '💼', '📦', '🎪', '🎬', '🎸', '🍕', '🌈'];

interface CreateBoardModalProps {
  workspaceId?: string;
  onClose: () => void;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ workspaceId, onClose }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { mutateAsync: createBoard, isPending } = useCreateBoard();
  const { data: allWorkspaces = [] } = useWorkspacesQuery();

  const workspaces = allWorkspaces.filter((w) => !w.isPersonal);

  useEffect(() => {
    if (workspaces.length === 0) return;
    const preferred = workspaces.find((w) => w.id === workspaceId);
    setSelectedWorkspaceId(preferred ? preferred.id : workspaces[0].id);
  }, [workspaces.length, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Board name is required.');
      return;
    }
    if (!selectedWorkspaceId) {
      setError('Please select a workspace.');
      return;
    }
    setError('');
    try {
      const finalName = selectedEmoji ? `${selectedEmoji} ${trimmed}` : trimmed;
      const board = await createBoard({
        name: finalName,
        description: description.trim() || undefined,
        workspaceId: selectedWorkspaceId,
      });
      onClose();
      navigate(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board.');
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FiLayout className="text-indigo-600" size={16} aria-hidden="true" />
            </div>
            <h2 id="create-board-title" className="text-lg font-semibold text-gray-800">
              New Board
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
            data-modal-escape
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="board-workspace" className="block text-sm font-medium text-gray-700 mb-1">
                WorkHub <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              {workspaces.length === 0 ? (
                <p className="text-sm text-amber-600">
                  No WorkHubs found. Create a WorkHub first before adding boards.
                </p>
              ) : (
                <select
                  id="board-workspace"
                  value={selectedWorkspaceId}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                  aria-required="true"
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
              </label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200">
                <button
                  key="none"
                  type="button"
                  onClick={() => setSelectedEmoji('')}
                  className={`px-2 py-1 rounded text-sm transition-all ${!selectedEmoji ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'}`}
                  aria-label="No emoji"
                >
                  None
                </button>
                {BOARD_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`text-lg px-2 py-1 rounded transition-all ${selectedEmoji === emoji ? 'bg-indigo-100 border-2 border-indigo-500' : 'hover:bg-gray-100 border border-gray-300'}`}
                    aria-label={`Select ${emoji} emoji`}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="board-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="board-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 Roadmap"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-required="true"
                aria-describedby={error ? 'board-error' : undefined}
              />
            </div>

            <div>
              <label htmlFor="board-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="board-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — describe the board's purpose"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p id="board-error" className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || workspaces.length === 0}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
              aria-label="Create board"
            >
              {isPending ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default CreateBoardModal;
