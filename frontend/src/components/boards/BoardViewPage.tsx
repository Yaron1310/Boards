import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBoard, useUpdateBoard, useArchiveBoard, useRestoreBoard } from '../../hooks/queries/useBoardQueries';
import { useGroups } from '../../hooks/queries/useGroupQueries';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import type { Item } from '../../types';
import { FiLoader, FiArchive, FiRotateCcw, FiChevronLeft, FiPlus } from 'react-icons/fi';
import ColumnHeader from './ColumnHeader';
import GroupSection from './GroupSection';
import AddGroupForm from './AddGroupForm';

const BoardViewPage: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: board, isLoading, error } = useBoard(boardId ?? '', !!boardId);
  const { data: groups = [], isLoading: groupsLoading } = useGroups(boardId ?? '', !!boardId);
  const { mutateAsync: updateBoard, isPending: isSaving } = useUpdateBoard();
  const { mutateAsync: archiveBoard, isPending: isArchiving } = useArchiveBoard();
  const { mutateAsync: restoreBoard, isPending: isRestoring } = useRestoreBoard();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [showAddGroup, setShowAddGroup] = useState(false);

  // Placeholder state for item detail panel — wired in Phase 7E
  const [_detailItem, setDetailItem] = useState<Item | null>(null);

  const canManage =
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.ACADEMY_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN;

  useEffect(() => {
    if (board) setNameValue(board.name);
  }, [board]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const commitNameEdit = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || !boardId || trimmed === board?.name) return;
    await updateBoard({ id: boardId, patch: { name: trimmed } }).catch(() => {
      if (board) setNameValue(board.name);
    });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitNameEdit();
    if (e.key === 'Escape') {
      setEditingName(false);
      if (board) setNameValue(board.name);
    }
  };

  const handleArchive = async () => {
    if (!boardId) return;
    await archiveBoard(boardId);
  };

  const handleRestore = async () => {
    if (!boardId) return;
    await restoreBoard(boardId);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading board">
        <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load board.</p>
      </div>
    );
  }

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Board top bar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-gray-600 transition-colors rounded p-1"
          aria-label="Go back"
        >
          <FiChevronLeft size={18} aria-hidden="true" />
        </button>

        <div className="flex-1 min-w-0">
          {editingName && canManage ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => void commitNameEdit()}
              onKeyDown={handleNameKeyDown}
              disabled={isSaving}
              className="text-xl font-bold text-gray-800 bg-transparent border-b-2 border-indigo-500 outline-none w-full max-w-md"
              aria-label="Edit board name"
            />
          ) : (
            <h1
              className={`text-xl font-bold text-gray-800 truncate ${canManage ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''}`}
              onClick={() => canManage && setEditingName(true)}
              aria-label={`Board: ${board.name}${canManage ? '. Click to rename.' : ''}`}
              title={canManage ? 'Click to rename' : undefined}
            >
              {board.name}
              {board.isArchived && (
                <span className="ml-2 text-sm font-normal text-gray-400">(archived)</span>
              )}
            </h1>
          )}
          {board.description && !editingName && (
            <p className="text-sm text-gray-500 truncate mt-0.5">{board.description}</p>
          )}
        </div>

        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {board.isArchived ? (
              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={isRestoring}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60"
                aria-label="Restore board"
              >
                <FiRotateCcw size={13} aria-hidden="true" />
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={isArchiving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
                aria-label="Archive board"
              >
                <FiArchive size={13} aria-hidden="true" />
                Archive
              </button>
            )}
          </div>
        )}
      </div>

      {/* Board content area */}
      <div className="flex-1 overflow-auto" role="grid" aria-label={`Board: ${board.name}`}>
        {/* Column header row */}
        <ColumnHeader canManage={canManage} />

        {/* Groups area */}
        <div className="p-4 space-y-4" role="region" aria-label="Board groups">
          {groupsLoading ? (
            <div className="flex justify-center items-center py-16" role="status" aria-label="Loading groups">
              <FiLoader className="animate-spin h-6 w-6 text-indigo-400" aria-hidden="true" />
            </div>
          ) : sortedGroups.length === 0 && !showAddGroup ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              <p>No groups yet. Add a group to start organising items.</p>
            </div>
          ) : (
            sortedGroups.map((group) => (
              <GroupSection
                key={group.id}
                group={group}
                boardId={board.id}
                workspaceId={board.workspaceId}
                canManage={canManage && !board.isArchived}
                onOpenDetail={setDetailItem}
              />
            ))
          )}

          {/* Add Group inline form */}
          {canManage && !board.isArchived && showAddGroup && boardId && (
            <AddGroupForm
              boardId={boardId}
              onClose={() => setShowAddGroup(false)}
            />
          )}
        </div>

        {/* Add Group button */}
        {canManage && !board.isArchived && !showAddGroup && (
          <div className="px-4 pb-6">
            <button
              type="button"
              onClick={() => setShowAddGroup(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-colors"
              aria-label="Add new group"
            >
              <FiPlus size={15} aria-hidden="true" />
              Add Group
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardViewPage;
