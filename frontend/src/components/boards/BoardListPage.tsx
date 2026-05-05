import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBoards, useArchiveBoard, useRestoreBoard, useDeleteBoard } from '../../hooks/queries/useBoardQueries';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import {
  FiLayout, FiPlus, FiArchive, FiArrowLeft, FiX,
  FiRotateCcw, FiLoader, FiInbox, FiTrash2, FiDownload,
} from 'react-icons/fi';
import ReactDOM from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import CreateBoardModal from './CreateBoardModal';
import { importBoardFromXlsx } from '../../utils/importBoardFromXlsx';

const BoardListPage: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showArchiveModal, setShowArchiveModal] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    setImportError(null);
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    e.target.value = '';

    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importBoardFromXlsx(file, workspaceId);
      await queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate(`/boards/${result.boardId}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed. Please check the file format.');
    } finally {
      setIsImporting(false);
    }
  };

  const { data: boards = [], isLoading, error } = useBoards(workspaceId, false, !!workspaceId);
  const { data: archivedBoards = [], isLoading: archivedLoading, refetch: refetchArchived } = useBoards(
    workspaceId,
    true,
    showArchiveModal && !!workspaceId,
  );

  const { mutateAsync: archiveBoard } = useArchiveBoard();
  const { mutateAsync: restoreBoard } = useRestoreBoard();
  const { mutateAsync: deleteBoard } = useDeleteBoard();

  const [actioningId, setActioningId] = React.useState<string | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const onlyArchived = React.useMemo(
    () => archivedBoards.filter((b) => b.isArchived),
    [archivedBoards],
  );

  const handleArchive = async (id: string) => {
    setActioningId(id);
    await archiveBoard(id).catch(() => {});
    setActioningId(null);
  };

  const handleDelete = async (id: string) => {
    setActioningId(id);
    setConfirmDeleteId(null);
    await deleteBoard(id).catch(() => {});
    setActioningId(null);
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    await restoreBoard(id).catch(() => {});
    setRestoringId(null);
    void refetchArchived();
  };

  const canManageBoards =
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
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
      <div className="mb-4">
        <button
          type="button"
          onClick={() => navigate('/WorkHubs')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={`Back to ${t('layout.workspaces').toLowerCase()}`}
        >
          <FiArrowLeft size={15} aria-hidden="true" />
          {t('layout.workspaces')}
        </button>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Boards</h1>
        <div className="flex items-center gap-3">
          {canManageBoards && (
            <button
              onClick={() => setShowArchiveModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label="View archived boards"
            >
              <FiArchive size={14} aria-hidden="true" />
              Archived
            </button>
          )}
          {canManageBoards && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                aria-hidden="true"
                onChange={(e) => { void handleImportFile(e); }}
              />
              <button
                type="button"
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                aria-label="Import board from Excel file"
              >
                {isImporting ? (
                  <FiLoader size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <FiDownload size={16} aria-hidden="true" />
                )}
                {isImporting ? 'Importing…' : 'Import'}
              </button>
            </>
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
      {importError && (
        <div
          className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
          role="alert"
        >
          {importError}
        </div>
      )}

      {boards.length === 0 ? (
        <p className="text-gray-500">No boards yet.</p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Boards"
        >
          {boards.map((board) => (
            <div
              key={board.id}
              role="listitem"
              className="group relative flex items-start gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
              onClick={() => navigate(`/boards/${board.id}`)}
              aria-label={`Open board ${board.name}`}
            >
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                <FiLayout className="text-indigo-500" size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 pr-14">
                <p className="font-semibold truncate text-gray-800">{board.name}</p>
                {board.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{board.description}</p>
                )}
              </div>

              {/* Action icons — visible on hover */}
              {canManageBoards && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actioningId === board.id ? (
                    <FiLoader className="animate-spin text-gray-400" size={16} aria-hidden="true" />
                  ) : confirmDeleteId === board.id ? (
                    <>
                      <span className="text-xs text-red-600 mr-1">Delete?</span>
                      <button
                        type="button"
                        onClick={() => void handleDelete(board.id)}
                        className="px-2 py-0.5 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors"
                        aria-label="Confirm delete board"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        aria-label="Cancel delete"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleArchive(board.id)}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        aria-label={`Archive board ${board.name}`}
                        title="Archive"
                      >
                        <FiArchive size={15} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(board.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label={`Delete board ${board.name}`}
                        title="Delete"
                      >
                        <FiTrash2 size={15} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateBoardModal
          workspaceId={workspaceId}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Archived boards modal */}
      {showArchiveModal && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Archived boards"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Archived Boards</h2>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close archived boards"
              >
                <FiX size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {archivedLoading ? (
                <div className="flex justify-center py-12" role="status" aria-label="Loading">
                  <FiLoader className="animate-spin text-indigo-500" size={24} aria-hidden="true" />
                </div>
              ) : onlyArchived.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                  <FiInbox size={32} aria-hidden="true" />
                  <p className="text-sm">No archived boards.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {onlyArchived.map((board) => (
                    <li
                      key={board.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <FiLayout className="text-gray-400" size={16} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{board.name}</p>
                          {board.description && (
                            <p className="text-xs text-gray-400 truncate">{board.description}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRestore(board.id)}
                        disabled={!!restoringId}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                        aria-label={`Restore board ${board.name}`}
                      >
                        {restoringId === board.id ? (
                          <FiLoader className="animate-spin" size={12} aria-hidden="true" />
                        ) : (
                          <FiRotateCcw size={12} aria-hidden="true" />
                        )}
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root')!,
      )}
    </div>
  );
};

export default BoardListPage;
