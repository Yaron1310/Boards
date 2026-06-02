
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
  canAssignAdmin?: boolean;
  onClose: () => void;
}

const WS_PERM_OPTIONS_BASE: Array<{ value: 'edit' | 'read_only' | 'admin'; label: string }> = [
  { value: 'edit', label: 'Edit' },
  { value: 'read_only', label: 'Read only' },
];

const WS_PERM_OPTIONS_WITH_ADMIN: Array<{ value: 'edit' | 'read_only' | 'admin'; label: string }> = [
  { value: 'edit', label: 'Edit' },
  { value: 'read_only', label: 'Read only' },
  { value: 'admin', label: 'Admin' },
];

const BOARD_ROLE_OPTIONS: Array<{ value: BoardRole; label: string }> = [
  { value: BoardRole.VIEWER, label: 'View' },
  { value: BoardRole.EDITOR, label: 'Edit' },
];

const UserPermissionsModal: React.FC<Props> = ({ userId, userName, isOrgAdmin, canAssignAdmin, onClose }) => {
  const { data, isLoading, isError } = useUserBoardPermissions(userId);
  const { mutateAsync: savePermissions, isPending: isSaving } = useUpdateUserBoardPermissions(userId);

  const [checkedBoards, setCheckedBoards] = useState<Set<string>>(new Set());
  const [checkedWorkspaces, setCheckedWorkspaces] = useState<Set<string>>(new Set());
  const [boardRoles, setBoardRoles] = useState<Map<string, BoardRole>>(new Map());
  const [wsPermissions, setWsPermissions] = useState<Map<string, 'edit' | 'read_only' | 'admin'>>(new Map());
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      const initialBoards = new Set<string>();
      const initialWorkspaces = new Set<string>();
      const initialRoles = new Map<string, BoardRole>();
      const initialWsPerms = new Map<string, 'edit' | 'read_only' | 'admin'>();
      const expanded = new Set<string>();
      for (const ws of data.workspaces) {
        expanded.add(ws.id);
        initialWsPerms.set(ws.id, ws.permissions ?? 'edit');
        if (ws.isMember) initialWorkspaces.add(ws.id);
        for (const board of ws.boards) {
          if (board.isMember) {
            initialBoards.add(board.id);
            initialRoles.set(board.id, board.role ?? BoardRole.EDITOR);
          }
        }
      }
      setCheckedBoards(initialBoards);
      setCheckedWorkspaces(initialWorkspaces);
      setBoardRoles(initialRoles);
      setWsPermissions(initialWsPerms);
      setExpandedWorkspaces(expanded);
      setInitialized(true);
    }
  }, [data, initialized]);

  const toggleWorkspace = (ws: BoardPermissionsWorkspace) => {
    const isWsChecked = checkedWorkspaces.has(ws.id);
    const allBoardIds = ws.boards.map((b) => b.id);
    if (isWsChecked) {
      // Uncheck workspace and all its boards
      setCheckedWorkspaces(prev => { const n = new Set(prev); n.delete(ws.id); return n; });
      setCheckedBoards(prev => { const n = new Set(prev); allBoardIds.forEach(id => n.delete(id)); return n; });
    } else {
      // Check workspace (boards stay as-is — user can select boards separately)
      setCheckedWorkspaces(prev => new Set(prev).add(ws.id));
      allBoardIds.forEach(id => {
        if (!boardRoles.has(id)) setBoardRoles(r => new Map(r).set(id, BoardRole.EDITOR));
      });
    }
  };

  const toggleBoard = (boardId: string) => {
    setCheckedBoards((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
        setBoardRoles(r => r.has(boardId) ? r : new Map(r).set(boardId, BoardRole.EDITOR));
      }
      return next;
    });
  };

  const setBoardRole = (boardId: string, role: BoardRole) => {
    setBoardRoles(prev => new Map(prev).set(boardId, role));
  };

  const setWsPerm = (wsId: string, perm: 'edit' | 'read_only' | 'admin') => {
    setWsPermissions(prev => new Map(prev).set(wsId, perm));
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
      const boards = [...checkedBoards].map((boardId) => ({
        boardId,
        role: boardRoles.get(boardId) ?? BoardRole.EDITOR,
      }));
      const workspaceIds = [...new Set([
        ...checkedWorkspaces,
        ...(data?.workspaces ?? [])
          .filter(ws => ws.boards.some(b => checkedBoards.has(b.id)))
          .map(ws => ws.id),
      ])];
      const workspacePermissions = Object.fromEntries(wsPermissions);
      await savePermissions({ boards, workspaceIds, workspacePermissions });
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
            const wsPerm = wsPermissions.get(ws.id) ?? 'edit';
            const wsPermOptions = canAssignAdmin ? WS_PERM_OPTIONS_WITH_ADMIN : WS_PERM_OPTIONS_BASE;

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
                  <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={checkedWorkspaces.has(ws.id)}
                      ref={(el) => { if (el) el.indeterminate = !checkedWorkspaces.has(ws.id) && state !== 'none'; }}
                      onChange={() => toggleWorkspace(ws)}
                      className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                      aria-label={`Grant access to workhub ${ws.name}`}
                    />
                    <span className="text-sm font-semibold text-gray-700 truncate">{ws.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">({ws.boards.length} boards)</span>
                  </label>
                  {/* Workspace-level permission toggle */}
                  <div className="flex items-center rounded-md border border-gray-200 overflow-hidden flex-shrink-0" role="group" aria-label={`Permission level for ${ws.name}`}>
                    {wsPermOptions.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setWsPerm(ws.id, opt.value)}
                        className={`px-2 py-0.5 text-xs transition-colors ${wsPerm === opt.value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        aria-pressed={wsPerm === opt.value}
                        aria-label={`Set ${ws.name} to ${opt.label}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Board rows */}
                {isExpanded && (
                  <div className="ml-8 space-y-0.5">
                    {ws.boards.map((board) => {
                      const isChecked = checkedBoards.has(board.id);
                      const role = boardRoles.get(board.id) ?? BoardRole.EDITOR;
                      return (
                        <div key={board.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBoard(board.id)}
                              className="accent-indigo-600 w-3.5 h-3.5 flex-shrink-0"
                              aria-label={`Grant access to board ${board.name}`}
                            />
                            <span className="text-sm text-gray-600 truncate">{board.name}</span>
                          </label>
                          {/* Board role selector — visible only when board is checked */}
                          {isChecked && (
                            <div className="flex items-center rounded-md border border-gray-200 overflow-hidden flex-shrink-0" role="group" aria-label={`Role for board ${board.name}`}>
                              {BOARD_ROLE_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setBoardRole(board.id, opt.value)}
                                  className={`px-2 py-0.5 text-xs transition-colors ${role === opt.value ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                                  aria-pressed={role === opt.value}
                                  aria-label={`Set role to ${opt.label} for ${board.name}`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
              {checkedWorkspaces.size} workhub{checkedWorkspaces.size !== 1 ? 's' : ''}, {checkedBoards.size} board{checkedBoards.size !== 1 ? 's' : ''} selected
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
