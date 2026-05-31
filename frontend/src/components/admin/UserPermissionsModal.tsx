import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiLoader, FiCheckCircle, FiAlertCircle, FiChevronDown, FiChevronRight, FiShield } from 'react-icons/fi';
import { useUserBoardPermissions, useUpdateUserBoardPermissions } from '../../hooks/queries/useBoardMemberQueries';
import { BoardRole } from '../../types';
import type { BoardPermissionsWorkspace } from '../../types';

interface Props {
  userId: string;
  userName: string;
  isOrgAdmin?: boolean;
  onClose: () => void;
}

const UserPermissionsModal: React.FC<Props> = ({ userId, userName, isOrgAdmin, onClose }) => {
  const { data, isLoading, isError } = useUserBoardPermissions(userId);
  const { mutateAsync: savePermissions, isPending: isSaving } = useUpdateUserBoardPermissions(userId);

  // checkedBoards: set of boardIds the user should have access to
  const [checkedBoards, setCheckedBoards] = useState<Set<string>>(new Set());
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      const initial = new Set<string>();
      const expanded = new Set<string>();
      for (const ws of data.workspaces) {
        expanded.add(ws.id);
        for (const board of ws.boards) {
          if (board.isMember) initial.add(board.id);
        }
      }
      setCheckedBoards(initial);
      setExpandedWorkspaces(expanded);
      setInitialized(true);
    }
  }, [data, initialized]);

  const toggleWorkspace = (ws: BoardPermissionsWorkspace) => {
    const allBoardIds = ws.boards.map((b) => b.id);
    const allChecked = allBoardIds.every((id) => checkedBoards.has(id));
    setCheckedBoards((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        allBoardIds.forEach((id) => next.delete(id));
      } else {
        allBoardIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleBoard = (boardId: string) => {
    setCheckedBoards((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) next.delete(boardId);
      else next.add(boardId);
      return next;
    });
  };

  const toggleExpanded = (wsId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  };

  const getWorkspaceState = (ws: BoardPermissionsWorkspace): 'all' | 'none' | 'partial' => {
    const ids = ws.boards.map((b) => b.id);
    if (ids.length === 0) return 'none';
    const checkedCount = ids.filter((id) => checkedBoards.has(id)).length;
    if (checkedCount === ids.length) return 'all';
    if (checkedCount === 0) return 'none';
    return 'partial';
  };

  const handleSave = async () => {
    setFeedback(null);
    try {
      const boards = [...checkedBoards].map((boardId) => ({ boardId, role: BoardRole.EDITOR }));
      await savePermissions(boards);
      setFeedback({ type: 'success', text: 'Permissions saved successfully.' });
      setTimeout(() => onClose(), 1200);
    } catch {
      setFeedback({ type: 'error', text: 'Failed to save permissions. Please try again.' });
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Board Permissions</h2>
            <p className="text-xs text-gray-500 mt-0.5">{userName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isOrgAdmin && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="p-3 bg-indigo-50 rounded-full">
                <FiShield size={28} className="text-indigo-500" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-gray-700">Org Admin — Full Permissions</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Organization admins have unrestricted access to all boards and workspaces in this organization.
              </p>
            </div>
          )}

          {!isOrgAdmin && feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`mb-4 p-3 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}
            >
              {feedback.type === 'success'
                ? <FiCheckCircle className="mr-2 shrink-0" size={14} aria-hidden="true" />
                : <FiAlertCircle className="mr-2 shrink-0" size={14} aria-hidden="true" />}
              {feedback.text}
            </div>
          )}

          {!isOrgAdmin && isLoading && (
            <div className="flex items-center justify-center py-12" role="status">
              <FiLoader className="animate-spin text-indigo-400" size={24} aria-hidden="true" />
            </div>
          )}

          {!isOrgAdmin && isError && (
            <div className="text-center py-8 text-red-500 text-sm" role="alert">
              Failed to load board permissions.
            </div>
          )}

          {!isOrgAdmin && data && data.workspaces.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No workhubs or boards found.</p>
          )}

          {!isOrgAdmin && data && data.workspaces.map((ws) => {
            const state = getWorkspaceState(ws);
            const isExpanded = expandedWorkspaces.has(ws.id);

            return (
              <div key={ws.id} className="mb-3">
                {/* Workhub row */}
                <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(ws.id)}
                    className="p-0.5 text-gray-400 hover:text-gray-600"
                    aria-label={isExpanded ? `Collapse ${ws.name}` : `Expand ${ws.name}`}
                  >
                    {isExpanded
                      ? <FiChevronDown size={14} aria-hidden="true" />
                      : <FiChevronRight size={14} aria-hidden="true" />}
                  </button>
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state === 'all'}
                      ref={(el) => {
                        if (el) el.indeterminate = state === 'partial';
                      }}
                      onChange={() => toggleWorkspace(ws)}
                      className="accent-indigo-600 w-3.5 h-3.5"
                      aria-label={`Select all boards in ${ws.name}`}
                    />
                    <span className="text-sm font-semibold text-gray-700">{ws.name}</span>
                    <span className="text-xs text-gray-400">({ws.boards.length} boards)</span>
                  </label>
                </div>

                {/* Board rows */}
                {isExpanded && (
                  <div className="ml-8 space-y-0.5">
                    {ws.boards.map((board) => (
                      <label
                        key={board.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checkedBoards.has(board.id)}
                          onChange={() => toggleBoard(board.id)}
                          className="accent-indigo-600 w-3.5 h-3.5"
                          aria-label={`Grant access to board ${board.name}`}
                        />
                        <span className="text-sm text-gray-600">{board.name}</span>
                      </label>
                    ))}
                    {ws.boards.length === 0 && (
                      <p className="px-2 py-1 text-xs text-gray-400">No boards in this workhub.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
          {!isOrgAdmin && (
            <p className="text-xs text-gray-400">
              {checkedBoards.size} board{checkedBoards.size !== 1 ? 's' : ''} selected
            </p>
          )}
          <div className={`flex gap-2 ${isOrgAdmin ? 'ml-auto' : ''}`}>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSaving}
            >
              Close
            </button>
            {!isOrgAdmin && (
              <button
                onClick={() => void handleSave()}
                disabled={isSaving || isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                aria-label="Save board permissions"
              >
                {isSaving && <FiLoader size={13} className="animate-spin" aria-hidden="true" />}
                Save permissions
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    modalRoot
  );
};

export default UserPermissionsModal;
