import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiExternalLink, FiEdit2, FiMove, FiCopy, FiBookmark,
  FiArchive, FiTrash2, FiChevronRight,
} from 'react-icons/fi';
import type { WorkHub } from '../../types';

interface BoardContextMenuProps {
  boardId: string;
  boardName: string;
  triggerRect: DOMRect;
  workspaces: WorkHub[];
  currentWorkspaceId: string;
  canManage: boolean;
  isTemplate?: boolean;
  onClose: () => void;
  onOpenNewTab: () => void;
  onRename: () => void;
  onMove: (workspaceId: string) => void;
  onDuplicate: () => void;
  onSaveAsTemplate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const BoardContextMenu: React.FC<BoardContextMenuProps> = ({
  boardName,
  triggerRect,
  workspaces,
  currentWorkspaceId,
  canManage,
  isTemplate,
  onClose,
  onOpenNewTab,
  onRename,
  onMove,
  onDuplicate,
  onSaveAsTemplate,
  onArchive,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const moveTargets = workspaces.filter((w) => !w.isPersonal && w.id !== currentWorkspaceId);

  const top = Math.min(triggerRect.bottom + 4, window.innerHeight - 280);
  const left = Math.max(8, Math.min(triggerRect.right - 192, window.innerWidth - 200));

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const menuItem = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    danger = false,
  ) => (
    <button
      key={label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left rounded-md transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
      }`}
      aria-label={label}
    >
      <span className="flex-shrink-0 text-gray-400" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      className="w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5"
      role="menu"
      aria-label={`Actions for ${boardName}`}
    >
      {menuItem(<FiExternalLink size={14} />, 'Open in new tab', onOpenNewTab)}

      {canManage && (
        <>
          <div className="my-1 border-t border-gray-100" role="separator" />
          {menuItem(<FiEdit2 size={14} />, 'Rename', onRename)}

          {!isTemplate && moveTargets.length > 0 && (
            <div
              className="relative"
              onMouseEnter={() => setShowMoveSubmenu(true)}
              onMouseLeave={() => setShowMoveSubmenu(false)}
            >
              <button
                type="button"
                className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                aria-haspopup="true"
                aria-expanded={showMoveSubmenu}
                aria-label="Move to another WorkHub"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex-shrink-0 text-gray-400" aria-hidden="true"><FiMove size={14} /></span>
                  Move to
                </span>
                <FiChevronRight size={12} className="text-gray-400" aria-hidden="true" />
              </button>

              {showMoveSubmenu && (
                <div
                  className="absolute left-full top-0 ml-1 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5"
                  style={{ zIndex: 10000 }}
                  role="menu"
                  aria-label="Select destination WorkHub"
                >
                  {moveTargets.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onMove(ws.id); onClose(); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      aria-label={`Move to ${ws.name}`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ws.color ?? '#CBD5E1', border: '1px solid #b6b6b6' }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{ws.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {menuItem(<FiCopy size={14} />, 'Duplicate', onDuplicate)}
          {!isTemplate && menuItem(<FiBookmark size={14} />, 'Save as template', onSaveAsTemplate)}

          <div className="my-1 border-t border-gray-100" role="separator" />
          {!isTemplate && menuItem(<FiArchive size={14} />, 'Archive', onArchive)}
          {menuItem(<FiTrash2 size={14} />, 'Delete', onDelete, true)}
        </>
      )}
    </div>,
    modalRoot,
  );
};

export default BoardContextMenu;
