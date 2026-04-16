import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBoards } from '../../hooks/queries/useBoardQueries';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import { FiLayout, FiPlus, FiArchive } from 'react-icons/fi';
import CreateBoardModal from './CreateBoardModal';

const BoardListPage: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [showCreateModal, setShowCreateModal] = React.useState(false);

  const { data: boards = [], isLoading, error } = useBoards(workspaceId, includeArchived, !!workspaceId);

  const canManageBoards =
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.ACADEMY_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading boards">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load boards.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Boards</h1>
        <div className="flex items-center gap-3">
          {canManageBoards && (
            <button
              onClick={() => setIncludeArchived((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label={includeArchived ? 'Hide archived boards' : 'Show archived boards'}
              aria-pressed={includeArchived}
            >
              <FiArchive size={14} aria-hidden="true" />
              {includeArchived ? 'Hide archived' : 'Show archived'}
            </button>
          )}
          {canManageBoards && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              aria-label="Create new board"
            >
              <FiPlus size={16} aria-hidden="true" />
              New Board
            </button>
          )}
        </div>
      </div>

      {boards.length === 0 ? (
        <p className="text-gray-500">No boards yet{includeArchived ? '' : ' (active)'}.</p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Boards"
        >
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              role="listitem"
              aria-label={`Open board ${board.name}`}
              onClick={() => navigate(`/boards/${board.id}`)}
              className="flex items-start gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all text-left w-full"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <FiLayout className="text-indigo-500" size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold truncate ${board.isArchived ? 'text-gray-400' : 'text-gray-800'}`}>
                  {board.name}
                  {board.isArchived && <span className="ml-2 text-xs text-gray-400">(archived)</span>}
                </p>
                {board.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{board.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && workspaceId && (
        <CreateBoardModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

export default BoardListPage;
