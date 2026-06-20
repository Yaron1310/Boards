import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiX, FiLayout, FiCopy, FiMove, FiLoader, FiSave } from 'react-icons/fi';
import { useUpdateBoard, useCreateBoard } from '../../hooks/queries/useBoardQueries';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import EmojiPicker from './EmojiPicker';
import type { Board } from '../../types';

interface EditBoardModalProps {
  board: Board;
  onClose: () => void;
}

function extractEmoji(name: string): { emoji: string; rest: string } {
  // Matches a leading emoji (one or two code-points wide) followed by a space
  const m = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s(.+)$/u);
  if (m) return { emoji: m[1], rest: m[2] };
  return { emoji: '', rest: name };
}

const EditBoardModal: React.FC<EditBoardModalProps> = ({ board, onClose }) => {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { emoji: initEmoji, rest: initName } = extractEmoji(board.name);
  const [selectedEmoji, setSelectedEmoji] = useState(initEmoji);
  const [name, setName] = useState(initName);
  const [description, setDescription] = useState(board.description ?? '');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(board.workspaceId);
  const [error, setError] = useState('');

  const { mutateAsync: updateBoard, isPending: isSaving } = useUpdateBoard();
  const { mutateAsync: createBoard, isPending: isDuplicating } = useCreateBoard();
  const { data: allWorkspaces = [] } = useWorkspacesQuery();
  const workspaces = allWorkspaces.filter((w) => !w.isPersonal);

  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.find((w) => w.id === targetWorkspaceId)) {
      setTargetWorkspaceId(workspaces[0].id);
    }
  }, [workspaces.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildName = () => {
    const trimmed = name.trim();
    return selectedEmoji ? `${selectedEmoji} ${trimmed}` : trimmed;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Board name is required.'); return; }
    setError('');
    try {
      const patch: { name: string; description?: string; workspaceId?: string } = {
        name: buildName(),
        description: description.trim() || undefined,
      };
      if (targetWorkspaceId !== board.workspaceId) {
        patch.workspaceId = targetWorkspaceId;
      }
      await updateBoard({ id: board.id, patch });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save board.');
    }
  };

  const handleDuplicate = async () => {
    setError('');
    try {
      const newBoard = await createBoard({
        name: `Copy of ${board.name}`,
        description: board.description ?? undefined,
        workspaceId: board.workspaceId,
      });
      onClose();
      navigate(`/boards/${newBoard.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate board.');
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-board-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FiLayout className="text-indigo-600" size={16} aria-hidden="true" />
            </div>
            <h2 id="edit-board-title" className="text-lg font-semibold text-gray-800">Edit Board</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Name */}
            <div>
              <label htmlFor="edit-board-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="edit-board-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-required="true"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
                {selectedEmoji && <span className="ml-2 text-lg">{selectedEmoji}</span>}
              </label>
              <EmojiPicker selected={selectedEmoji} onChange={setSelectedEmoji} />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="edit-board-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="edit-board-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — describe the board's purpose"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Move to WorkHub */}
            <div>
              <label htmlFor="edit-board-workspace" className="block text-sm font-medium text-gray-700 mb-1">
                <FiMove size={14} className="inline mr-1" aria-hidden="true" />
                Move to WorkHub
              </label>
              <select
                id="edit-board-workspace"
                value={targetWorkspaceId}
                onChange={(e) => setTargetWorkspaceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id === board.workspaceId ? `${w.name} (current)` : w.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs text-red-600" role="alert">{error}</p>
            )}

            {/* Duplicate */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Other actions</p>
              <button
                type="button"
                onClick={() => void handleDuplicate()}
                disabled={isDuplicating}
                className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                aria-label="Duplicate this board"
              >
                {isDuplicating ? (
                  <FiLoader size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <FiCopy size={14} aria-hidden="true" />
                )}
                {isDuplicating ? 'Duplicating…' : 'Duplicate Board'}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
              aria-label="Save board changes"
            >
              {isSaving ? (
                <FiLoader size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <FiSave size={14} aria-hidden="true" />
              )}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default EditBoardModal;
