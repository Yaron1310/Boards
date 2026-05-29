import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useBoardTemplates, useDeleteBoard, useDuplicateBoard, useUpdateBoard } from '../../hooks/queries/useBoardQueries';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';
import { UserRole, Board } from '../../types';
import { FiBookmark, FiMoreVertical } from 'react-icons/fi';
import ReactDOM from 'react-dom';
import BoardContextMenu from './BoardContextMenu';
import EditBoardModal from './EditBoardModal';

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: templates = [], isLoading } = useBoardTemplates();
  const { data: allWorkspaces = [] } = useWorkspacesQuery();
  const { mutateAsync: deleteBoard } = useDeleteBoard();
  const { mutateAsync: duplicateBoard } = useDuplicateBoard();
  const { mutateAsync: updateBoard } = useUpdateBoard();

  const [menuBoardId, setMenuBoardId] = React.useState<string | null>(null);
  const [menuTriggerRect, setMenuTriggerRect] = React.useState<DOMRect | null>(null);
  const [editingBoard, setEditingBoard] = React.useState<Board | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const canManage =
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN;

  const menuBoard = menuBoardId ? templates.find((b) => b.id === menuBoardId) : null;

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    await deleteBoard(id).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading templates">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable board templates for your organization</p>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
          <FiBookmark size={40} aria-hidden="true" />
          <p className="text-base">No templates yet.</p>
          <p className="text-sm text-center max-w-sm">
            Save any board as a template using the 3-dot menu on a board card.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label="Board templates"
        >
          {templates.map((board) => (
            <div
              key={board.id}
              role="listitem"
              className="group relative flex items-start gap-4 p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer"
              onClick={() => navigate(`/boards/${board.id}`)}
              aria-label={`Open template ${board.name}`}
            >
              <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <FiBookmark className="text-amber-500" size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 pr-10">
                <p className="font-semibold truncate text-gray-800">{board.name}</p>
                {board.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{board.description}</p>
                )}
              </div>

              {canManage && (
                <div
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                      if (menuBoardId === board.id) {
                        setMenuBoardId(null);
                        setMenuTriggerRect(null);
                      } else {
                        setMenuBoardId(board.id);
                        setMenuTriggerRect(rect);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label={`More options for ${board.name}`}
                    aria-haspopup="true"
                    aria-expanded={menuBoardId === board.id}
                  >
                    <FiMoreVertical size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {menuBoard && menuTriggerRect && (
        <BoardContextMenu
          boardId={menuBoard.id}
          boardName={menuBoard.name}
          triggerRect={menuTriggerRect}
          workspaces={allWorkspaces.filter((w) => !w.isPersonal)}
          currentWorkspaceId={menuBoard.workspaceId}
          canManage={canManage}
          isTemplate={true}
          onClose={() => { setMenuBoardId(null); setMenuTriggerRect(null); }}
          onOpenNewTab={() => window.open(`/boards/${menuBoard.id}`, '_blank')}
          onRename={() => setEditingBoard(menuBoard)}
          onMove={(wsId) => void updateBoard({ id: menuBoard.id, patch: { workspaceId: wsId } })}
          onDuplicate={() => void duplicateBoard(menuBoard.id)}
          onSaveAsTemplate={() => {}}
          onArchive={() => {}}
          onDelete={() => setConfirmDeleteId(menuBoard.id)}
        />
      )}

      {editingBoard && (
        <EditBoardModal
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
        />
      )}

      {confirmDeleteId && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete template"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete template?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDeleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                aria-label="Confirm delete template"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root')!,
      )}
    </div>
  );
};

export default TemplatesPage;
