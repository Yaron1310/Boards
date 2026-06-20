import React, { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import { Outlet, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { UserRole, User, WorkHub, Board } from '../../types';
import { FiMenu, FiX, FiUsers, FiBriefcase, FiEdit, FiGrid, FiShield, FiChevronsRight, FiLoader, FiVideo, FiMail, FiLayout, FiChevronDown, FiChevronRight, FiChevronLeft, FiTrello, FiPlus, FiMoreHorizontal, FiBookmark } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useBoards, useDuplicateBoard, useSaveAsBoardTemplate, useUpdateBoard, useArchiveBoard, useDeleteBoard } from '../../hooks/queries/useBoardQueries';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';
import BoardContextMenu from '../boards/BoardContextMenu';
import EditBoardModal from '../boards/EditBoardModal';
import DuplicateOptionsModal from '../boards/DuplicateOptionsModal';
import type { DuplicateMode } from '../../services/workManagementService';
import ReactDOM from 'react-dom';

import LegalModal from '../legal/LegalModal';
import AccessibilityModal from '../legal/AccessibilityModal';
import CookieConsent from '../legal/CookieConsent';

const WORKSPACE_COLORS = [
  { name: 'Pink', value: '#FFB3C1' },
  { name: 'Blue', value: '#ADD8E6' },
  { name: 'Green', value: '#90EE90' },
  { name: 'Yellow', value: '#FFFF99' },
  { name: 'Purple', value: '#D8BFD8' },
  { name: 'Orange', value: '#FFCC99' },
  { name: 'Cyan', value: '#AFEEEE' },
  { name: 'Rose', value: '#FFB6C1' },
];

// --- WORKSPACES + BOARDS NAV SECTION ---

interface WorkspaceBoardsGroupProps {
  workspace: { id: string; name: string };
  sidebarLinkColor: string;
  onNavigate: () => void;
  allWorkspaces: WorkHub[];
  canManage: boolean;
}

const WorkspaceBoardsGroup: React.FC<WorkspaceBoardsGroupProps> = ({ workspace, sidebarLinkColor, onNavigate, allWorkspaces, canManage }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);
  const [menuTriggerRect, setMenuTriggerRect] = useState<DOMRect | null>(null);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (renamingBoardId !== null) {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [renamingBoardId]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [duplicateTargetId, setDuplicateTargetId] = useState<string | null>(null);
  const [templateTargetId, setTemplateTargetId] = useState<string | null>(null);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const { data: boards = [] } = useBoards(workspace.id, false, true);
  const navigate = useNavigate();
  const { mutateAsync: duplicateBoard } = useDuplicateBoard();
  const { mutateAsync: saveAsTemplate } = useSaveAsBoardTemplate();
  const { mutateAsync: updateBoard } = useUpdateBoard();
  const { mutateAsync: archiveBoard } = useArchiveBoard();
  const { mutateAsync: deleteBoard } = useDeleteBoard();

  const menuBoard = menuBoardId ? boards.find((b) => b.id === menuBoardId) : null;

  const handleRenameStart = (board: { id: string; name: string }) => {
    setMenuBoardId(null);
    setMenuTriggerRect(null);
    setRenamingBoardId(board.id);
    setRenameValue(board.name);
  };

  const handleRenameSubmit = async (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingBoardId(null);
    if (trimmed && trimmed !== boards.find((b) => b.id === id)?.name) {
      await updateBoard({ id, patch: { name: trimmed } }).catch(() => {});
    }
  };

  const handleDuplicate = async (mode: DuplicateMode) => {
    if (!duplicateTargetId) return;
    const id = duplicateTargetId;
    setDuplicateTargetId(null);
    await duplicateBoard({ id, mode }).catch(() => {});
  };

  const handleSaveAsTemplate = async (mode: DuplicateMode) => {
    if (!templateTargetId) return;
    const id = templateTargetId;
    setTemplateTargetId(null);
    await saveAsTemplate({ id, mode }).catch(() => {});
    navigate('/admin/templates');
  };

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-1 px-4 mb-0.5 text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-100 w-full text-left"
        style={{ color: sidebarLinkColor, opacity: 0.7 }}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse boards' : 'Expand boards'}
      >
        {isExpanded ? <FiChevronDown size={12} aria-hidden="true" /> : <FiChevronRight size={12} aria-hidden="true" />}
        <span>Boards</span>
      </button>
      {isExpanded && (
        <ul role="list" aria-label={`${workspace.name} boards`}>
          {boards.length === 0 && (
            <li className="px-8 py-1 text-xs" style={{ color: sidebarLinkColor, opacity: 0.45 }}>
              No boards yet
            </li>
          )}
          {boards.map((board) => (
            <li key={board.id} role="listitem" className="group/board flex items-center pr-2">
              {renamingBoardId === board.id ? (
                <div className="flex-1 min-w-0 flex items-center gap-2 pl-8 py-1" style={{ color: sidebarLinkColor }}>
                  <FiLayout size={13} className="flex-shrink-0" aria-hidden="true" />
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => { void handleRenameSubmit(board.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { void handleRenameSubmit(board.id); }
                      if (e.key === 'Escape') { setRenamingBoardId(null); }
                    }}
                    className="flex-1 min-w-0 text-sm rounded px-1.5 py-0.5 focus:outline-none focus:ring-1"
                    style={{ color: sidebarLinkColor, backgroundColor: 'rgba(128,128,128,0.15)', border: `1px solid ${sidebarLinkColor}55`, outline: 'none' }}
                    aria-label={`Rename board ${board.name}`}
                  />
                </div>
              ) : (
                <NavLink
                  to={`/boards/${board.id}`}
                  onClick={onNavigate}
                  style={() => ({ color: sidebarLinkColor })}
                  className={({ isActive }) =>
                    `sidebar-nav-item flex-1 min-w-0 flex items-center gap-2 pl-8 py-1.5 rounded-lg text-sm transition-colors duration-150 ${
                      isActive ? 'active font-semibold' : 'hover:text-white'
                    }`
                  }
                  aria-label={`Open board ${board.name}`}
                >
                  <FiLayout size={13} className="flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{board.name}</span>
                </NavLink>
              )}
              {canManage && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
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
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(128,128,128,0.2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = ''; }}
                  className="flex-shrink-0 opacity-0 group-hover/board:opacity-100 p-1 rounded-md transition z-10 relative"
                  style={{ color: sidebarLinkColor }}
                  aria-label={`More options for ${board.name}`}
                  aria-haspopup="true"
                  aria-expanded={menuBoardId === board.id}
                >
                  <FiMoreHorizontal size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
          <li role="listitem">
            <button
              type="button"
              onClick={() => { navigate(`/WorkHubs/${workspace.id}/boards?newBoard=true`); onNavigate(); }}
              className="flex items-center gap-2 px-8 py-1.5 rounded-lg text-sm transition-colors duration-150 w-full text-left hover:opacity-100"
              style={{ color: sidebarLinkColor, opacity: 0.6 }}
              aria-label="Create new board"
            >
              <FiPlus size={13} className="flex-shrink-0" aria-hidden="true" />
              <span>New Board</span>
            </button>
          </li>
        </ul>
      )}
      {menuBoard && menuTriggerRect && (
        <BoardContextMenu
          boardId={menuBoard.id}
          boardName={menuBoard.name}
          triggerRect={menuTriggerRect}
          workspaces={allWorkspaces.filter((w) => !w.isPersonal && !w.isTemplates)}
          currentWorkspaceId={workspace.id}
          canManage={canManage}
          onClose={() => { setMenuBoardId(null); setMenuTriggerRect(null); }}
          onOpenNewTab={() => window.open(`/boards/${menuBoard.id}`, '_blank')}
          onEdit={() => { setMenuBoardId(null); setMenuTriggerRect(null); setEditingBoard(menuBoard); }}
          onRename={() => handleRenameStart(menuBoard)}
          onMove={(wsId) => void updateBoard({ id: menuBoard.id, patch: { workspaceId: wsId } })}
          onDuplicate={() => { setMenuBoardId(null); setMenuTriggerRect(null); setDuplicateTargetId(menuBoard.id); }}
          onSaveAsTemplate={() => { setMenuBoardId(null); setMenuTriggerRect(null); setTemplateTargetId(menuBoard.id); }}
          onArchive={() => void archiveBoard(menuBoard.id)}
          onDelete={() => { setMenuBoardId(null); setMenuTriggerRect(null); setConfirmDeleteId(menuBoard.id); }}
        />
      )}

      {editingBoard && (
        <EditBoardModal board={editingBoard} onClose={() => setEditingBoard(null)} />
      )}

      {confirmDeleteId && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete board"
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete board?</h3>
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
                onClick={() => { const id = confirmDeleteId; setConfirmDeleteId(null); void deleteBoard(id); }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                aria-label="Confirm delete board"
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('modal-root')!,
      )}

      {duplicateTargetId && (
        <DuplicateOptionsModal
          title="Duplicate board"
          confirmLabel="Duplicate"
          onConfirm={(mode) => { void handleDuplicate(mode); }}
          onClose={() => setDuplicateTargetId(null)}
        />
      )}

      {templateTargetId && (
        <DuplicateOptionsModal
          title="Save as template"
          confirmLabel="Save"
          onConfirm={(mode) => { void handleSaveAsTemplate(mode); }}
          onClose={() => setTemplateTargetId(null)}
        />
      )}
    </div>
  );
};

interface WorkspacesNavSectionProps {
  sidebarLinkColor: string;
  onNavigate: () => void;
  canManage: boolean;
}

const WORKHUB_STORAGE_KEY = 'logyx_selected_workhub_id';

const WorkspacesNavSection: React.FC<WorkspacesNavSectionProps> = ({ sidebarLinkColor, onNavigate, canManage }) => {
  const { data: allWorkspaces = [] } = useWorkspacesQuery();
  const workspaces = allWorkspaces.filter((w) => !w.isPersonal && !w.isTemplates);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(WORKHUB_STORAGE_KEY) ?? '');

  useEffect(() => {
    if (workspaces.length === 0) return;
    const savedId = localStorage.getItem(WORKHUB_STORAGE_KEY);
    const isValidSavedId = savedId && workspaces.some((w) => w.id === savedId);
    if (!selectedId || !workspaces.some((w) => w.id === selectedId)) {
      const next = isValidSavedId ? savedId! : workspaces[0].id;
      setSelectedId(next);
      localStorage.setItem(WORKHUB_STORAGE_KEY, next);
    }
  }, [workspaces, selectedId]);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isDropdownOpen]);

  if (workspaces.length === 0) return null;

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId) ?? null;
  const selectedName = selectedWorkspace?.name ?? 'Select WorkHub…';
  const selectedColor = selectedWorkspace?.color ?? '#FFB3C1';

  return (
    <div className="pt-4 mt-4 border-t" style={{ borderColor: `${sidebarLinkColor}33` }}>
      {/* WorkHub dropdown */}
      <div className="px-4 mb-2 relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsDropdownOpen((v) => !v)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm"
          style={{ color: sidebarLinkColor, backgroundColor: 'rgba(255,255,255,0.12)', border: `2px solid ${sidebarLinkColor}` }}
          aria-haspopup="listbox"
          aria-expanded={isDropdownOpen}
          aria-label="Select WorkHub"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: selectedColor, border: '1px solid #b6b6b6' }} aria-hidden="true" />
            <span className="truncate">{selectedName}</span>
          </div>
          <FiChevronDown size={14} aria-hidden="true" className="ml-2 flex-shrink-0" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {isDropdownOpen && (
          <ul
            role="listbox"
            aria-label="WorkHubs"
            className="absolute left-4 right-4 z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden max-h-52 overflow-y-auto"
          >
            {workspaces.map((ws) => {
              const wsColor = ws.color ?? '#FFB3C1';
              return (
                <li
                  key={ws.id}
                  role="option"
                  aria-selected={ws.id === selectedId}
                  onClick={() => { setSelectedId(ws.id); localStorage.setItem(WORKHUB_STORAGE_KEY, ws.id); setIsDropdownOpen(false); }}
                  className={`px-3 py-2 text-sm cursor-pointer text-gray-800 hover:bg-indigo-50 flex items-center gap-2 ${ws.id === selectedId ? 'bg-indigo-50 font-semibold' : ''}`}
                >
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: wsColor, border: '1px solid #b6b6b6' }} aria-hidden="true" />
                  {ws.name}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Boards for selected workspace */}
      {selectedWorkspace && (
        <WorkspaceBoardsGroup
          workspace={selectedWorkspace}
          sidebarLinkColor={sidebarLinkColor}
          onNavigate={onNavigate}
          allWorkspaces={workspaces}
          canManage={canManage}
        />
      )}
    </div>
  );
};

// --- TYPE DEFINITIONS for Sidebar Components ---

interface NavItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    roles: UserRole[];
    show?: boolean;
}

interface AdminNavItem {
    name: string;
    path: string;
    icon: React.ReactNode;
    roles: UserRole[];
    show?: boolean;
}

interface SystemAdminSidebarContentProps {
  setIsSidebarOpen: (isOpen: boolean) => void;
  userImageSidebar: string;
  user: User | null;
  onOpenLegal: () => void;
  onOpenAccessibility: () => void;
}

interface SidebarContentProps {
  sidebarColor: string;
  enableSidebarGradient?: boolean;
  sidebarHueRotation?: number;
  sidebarGradientHeight?: number;
  sidebarGradientMaskOpacity?: number;
  logoUrl: string;
  logoCircle?: boolean;
  appName: string;
  displayNameColor: string;
  sidebarLinkColor: string;
  availableNavItems: NavItem[];
  availableAdminNavItems: AdminNavItem[];
  setIsSidebarOpen: (isOpen: boolean) => void;
  userImageSidebar: string;
  user: User | null;
  selectedWorkspaceIsPersonal: boolean;
  selectedWorkspaceId: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenLegal: () => void;
  onOpenAccessibility: () => void;
}


// --- REFACTORED SIDEBAR COMPONENTS ---

const SystemAdminSidebarContent: React.FC<SystemAdminSidebarContentProps> = ({ setIsSidebarOpen, userImageSidebar, user, onOpenLegal, onOpenAccessibility }) => {
    const { t, i18n } = useTranslation();
    const isHebrewLanguage = i18n.language.startsWith('he');
    // isHebrewLanguage is used for icon alignment and RTL close-button positioning
    const iconClassName = `mr-3 ${isHebrewLanguage ? 'mt-0.5' : ''}`;
    const systemAdminNavItems = [
      { name: t('layout.organizations'), path: '/admin/organizations', icon: <FiShield className={iconClassName} /> },
      { name: t('layout.tutorialsSettings'), path: '/admin/tutorials', icon: <FiVideo className={iconClassName} /> },
      { name: t('layout.emailTemplates'), path: '/admin/email-templates', icon: <FiMail className={iconClassName} /> },
    ];

    return (
      <div className="flex flex-col h-full bg-gray-800 text-gray-200">
        <div className="relative p-6 pb-4">
          <button
            onClick={() => setIsSidebarOpen(false)}
            className={`absolute top-4 text-gray-200 hover:text-white md:hidden ${isHebrewLanguage ? 'left-4' : 'right-4'}`}
            aria-label={t('layout.closeMenu')}
          >
            <FiX size={24} />
          </button>
          <div className="flex items-center mb-4">
            <img src="/logo_gym.webp" alt={t('common.appLogoAlt')} className="h-10 w-10 mr-3 rounded-full" />
            <h1 className="text-2xl font-bold text-white">{t('layout.systemAdmin')}</h1>
          </div>
        </div>
        <div className="flex-1 px-6 overflow-y-auto custom-scrollbar">
          <nav className="space-y-3">
            {systemAdminNavItems.map(item => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                    `flex items-center px-4 py-3 rounded-lg text-base transition-colors duration-150 ${
                    isActive
                        ? 'bg-white/10 text-white'
                        : 'text-gray-200 hover:text-white hover:bg-white/10'
                    }`
                }
                end={item.path === '/admin'}
              >
                {item.icon} {item.name}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="px-6 py-3 space-y-2 border-t border-gray-700">
          <NavLink to="/profile" onClick={() => setIsSidebarOpen(false)} className={({ isActive }) => `flex items-center p-3 rounded-lg transition-colors ${isActive ? 'bg-white/20' : 'bg-[#00000036]'}`} title="View Profile">
            <img src={userImageSidebar} alt="User" className="h-10 w-10 rounded-full mr-3 border-2 border-white/30 object-cover flex-shrink-0" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} />
            <div className="flex-grow min-w-0">
              <p className="font-semibold text-white text-sm truncate">{user?.name}</p>
              <p className="text-xs text-white/60 truncate">{user?.email}</p>
            </div>
            <FiChevronsRight className="ml-2 text-white/60 rtl-flip" />
          </NavLink>
          <div className="flex items-center justify-center text-gray-400 text-xs gap-x-1.5">
             <span className="font-semibold">Logyx</span>
             <span>© {new Date().getFullYear()}</span>
             <span>|</span>
             <button
                onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenLegal();
                }}
                className="text-gray-400 hover:text-gray-200 bg-transparent border-none p-0 cursor-pointer hover:underline"
             >
                {t('layout.termsPrivacy')}
             </button>
             <span>|</span>
             <button
                onClick={() => {
                    setIsSidebarOpen(false);
                    onOpenAccessibility();
                }}
                className="text-gray-400 hover:text-gray-200 bg-transparent border-none p-0 cursor-pointer"
                aria-label={t('common.accessibilityStatement')}
             >
                <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                   <path d="M423.5-743.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5ZM360-80v-520q-60-5-122-15t-118-25l20-80q78 21 166 30.5t174 9.5q86 0 174-9.5T820-720l20 80q-56 15-118 25t-122 15v520h-80v-240h-80v240h-80Z"/>
                </svg>
             </button>
          </div>
        </div>
      </div>
    );
};


const SidebarContent: React.FC<SidebarContentProps> = ({
    sidebarColor,
    enableSidebarGradient,
    sidebarHueRotation,
    sidebarGradientHeight,
    sidebarGradientMaskOpacity,
    logoUrl,
    logoCircle = true,
    appName,
    displayNameColor,
    sidebarLinkColor,
    availableNavItems,
    availableAdminNavItems,
    setIsSidebarOpen,
    userImageSidebar,
    user,
    selectedWorkspaceIsPersonal,
    selectedWorkspaceId,
    isCollapsed,
    onToggleCollapsed,
    onOpenLegal,
    onOpenAccessibility
}) => {
    const { t, i18n } = useTranslation();
    const isHebrewLanguage = i18n.language.startsWith('he');
    const iconClassName = `mr-3 ${isHebrewLanguage ? 'mt-0.5' : ''}`;
    const sidebarNavigate = useNavigate();
    const isOrganizationAdmin = user?.role === UserRole.ORGANIZATION_ADMIN;

    // Calculate sidebar perceived luminance (0=black, 1=white) to pick a contrasting hover overlay.
    const sidebarBrightness = (() => {
        const hex = sidebarColor.replace('#', '');
        if (hex.length < 6) return 0;
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    })();
    // Stepped overlay: dark overlay for bright sidebars, light overlay for dark sidebars.
    const hoverBg =
        sidebarBrightness >= 0.85 ? 'rgba(0, 0, 0, 0.07)'        // near white
      : sidebarBrightness >= 0.70 ? 'rgba(0, 0, 0, 0.09)'        // very light
      : sidebarBrightness >= 0.60 ? 'rgba(0, 0, 0, 0.12)'        // light
      : sidebarBrightness >= 0.45 ? 'rgba(255, 255, 255, 0.35)'  // medium-light
      : sidebarBrightness >= 0.30 ? 'rgba(255, 255, 255, 0.28)'  // medium
      : sidebarBrightness >= 0.20 ? 'rgba(255, 255, 255, 0.23)'  // medium-dark  (e.g. purple ~0.223)
      : sidebarBrightness >= 0.10 ? 'rgba(255, 255, 255, 0.20)'  // dark
      : sidebarBrightness >= 0.03 ? 'rgba(255, 255, 255, 0.18)'  // very dark
      :                              'rgba(255, 255, 255, 0.22)'; // near black

    const hoverEffectStyle = `
        .sidebar-nav-item {
            position: relative;
            z-index: 10;
            overflow: hidden; /* To contain the pseudo-element */
        }
        .sidebar-nav-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: ${hoverBg};
            opacity: 0;
            transition: opacity 0.2s ease-in-out;
            z-index: -1;
        }
        .sidebar-nav-item:hover::before, .sidebar-nav-item.active::before {
            opacity: 1;
        }
    `;

    const hueRotation = sidebarHueRotation ?? 270; 
    const heightPercent = sidebarGradientHeight ?? 85; 
    const maskOpacity = sidebarGradientMaskOpacity ?? 40; 
    const maskAlpha = maskOpacity / 100;

    return (
        <div
            className="flex flex-col h-full relative overflow-hidden"
            style={{ backgroundColor: sidebarColor }}
        >
          <style>{hoverEffectStyle}</style>

          {/* Collapsed icon-only view */}
          {isCollapsed && (
            <div className="flex flex-col items-center py-6 gap-1 flex-1 overflow-y-auto custom-scrollbar relative z-10">
              {availableNavItems.map(item => (
                <NavLink
                  key={(item as NavItem).name}
                  to={(item as NavItem).path}
                  onClick={(e) => {
                    const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                    if (guard?.isDirty) { e.preventDefault(); guard.onAttempt((item as NavItem).path); return; }
                    setIsSidebarOpen(false);
                  }}
                  title={(item as NavItem).name}
                  className={({ isActive }) =>
                    `sidebar-nav-item flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150 overflow-hidden ${isActive ? 'active' : ''}`
                  }
                  style={{ color: sidebarLinkColor }}
                >
                  <span className="[&>svg]:mr-0">{(item as NavItem).icon}</span>
                </NavLink>
              ))}

              {/* Organization Hub with separators */}
              <div className="w-8 my-1" style={{ borderTop: `1px solid ${sidebarLinkColor}33` }} />
              <NavLink
                to="/admin/organization-hub"
                onClick={(e) => {
                  const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                  if (guard?.isDirty) { e.preventDefault(); guard.onAttempt('/admin/organization-hub'); return; }
                  setIsSidebarOpen(false);
                }}
                title={t('layout.organizationHub')}
                className={({ isActive }) =>
                  `sidebar-nav-item flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150 overflow-hidden ${isActive ? 'active' : ''}`
                }
                style={{ color: sidebarLinkColor }}
              >
                <FiBriefcase size={18} />
              </NavLink>
              <div className="w-8 my-1" style={{ borderTop: `1px solid ${sidebarLinkColor}33` }} />

              {availableAdminNavItems.map(item => (
                <NavLink
                  key={(item as AdminNavItem).name}
                  to={(item as AdminNavItem).path}
                  onClick={(e) => {
                    const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                    if (guard?.isDirty) { e.preventDefault(); guard.onAttempt((item as AdminNavItem).path); return; }
                    setIsSidebarOpen(false);
                  }}
                  title={(item as AdminNavItem).name}
                  className={({ isActive }) =>
                    `sidebar-nav-item flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150 overflow-hidden ${isActive ? 'active' : ''}`
                  }
                  style={{ color: sidebarLinkColor }}
                >
                  <span className="[&>svg]:mr-0">{(item as AdminNavItem).icon}</span>
                </NavLink>
              ))}
              <NavLink
                to="/profile"
                onClick={() => setIsSidebarOpen(false)}
                title="Profile"
                className={({ isActive }) =>
                  `sidebar-nav-item flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150 mt-auto ${isActive ? 'active' : ''}`
                }
                style={{ color: sidebarLinkColor }}
              >
                <img src={userImageSidebar} alt="User" className="h-7 w-7 rounded-full object-cover border border-white/30" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = '/default_user.webp')} />
              </NavLink>
            </div>
          )}

          {/* Full sidebar — hidden when collapsed */}
          {!isCollapsed && <>

          {/* Gradient Overlay for Stronger Hue Change */}
          {enableSidebarGradient && (
            <div 
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${heightPercent}%`,
                    background: sidebarColor,
                    filter: `hue-rotate(${hueRotation}deg) brightness(1.4) saturate(1.4)`,
                    maskImage: `linear-gradient(to top, rgba(0,0,0,${maskAlpha}) 0%, transparent 100%)`,
                    WebkitMaskImage: `linear-gradient(to top, rgba(0,0,0,${maskAlpha}) 0%, transparent 100%)`,
                    zIndex: 0,
                    pointerEvents: 'none'
                }}
            />
          )}

          <div className="relative z-10 p-6 pb-1 text-center">
            <button
                onClick={() => setIsSidebarOpen(false)}
                className={`absolute top-4 md:hidden ${isHebrewLanguage ? 'left-4' : 'right-4'}`}
                style={{ color: sidebarLinkColor }}
                aria-label={t('layout.closeMenu')}
            >
                <FiX size={24} />
            </button>
            <div className="flex flex-row items-center justify-center mb-6">
              {isOrganizationAdmin ? (
                <div
                  className="relative mr-4 group cursor-pointer"
                  onClick={() => {
                    const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                    if (guard?.isDirty) {
                        guard.onAttempt('/admin/organization-hub?openTheme=true');
                        return;
                    }
                    setIsSidebarOpen(false);
                    sidebarNavigate('/admin/organization-hub?openTheme=true');
                  }}
                  aria-label={t('layout.clickToEdit')}
                >
                  <img
                    src={logoUrl}
                    alt={t('common.appLogoAlt')}
                    className={`h-12 object-cover transition-all ${logoCircle ? 'w-12 rounded-full' : 'w-auto rounded'}`}
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)}
                  />
                  <span className="absolute bottom-0 right-0 flex items-center justify-center w-5 h-5 rounded-full bg-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" aria-hidden="true">
                    <FiEdit size={11} color="white" />
                  </span>
                </div>
              ) : (
                <img src={logoUrl} alt={t('common.appLogoAlt')} className={`h-12 object-cover mr-4 ${logoCircle ? 'w-12 rounded-full' : 'w-auto rounded'}`} onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} />
              )}
              {isOrganizationAdmin ? (
                <div
                  className="relative group cursor-pointer"
                  onClick={() => {
                    const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                    if (guard?.isDirty) {
                        guard.onAttempt('/admin/organization-hub');
                        return;
                    }
                    setIsSidebarOpen(false);
                    sidebarNavigate('/admin/organization-hub');
                  }}
                  aria-label={t('layout.clickToEdit')}
                >
                  <h1
                    className="font-bold leading-tight break-words"
                    style={{ color: displayNameColor, fontSize: '1.8rem' }}
                  >
                    {appName}
                  </h1>
                  <span className="absolute bottom-0 right-0 flex items-center justify-center w-5 h-5 rounded-full bg-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" aria-hidden="true">
                    <FiEdit size={11} color="white" />
                  </span>
                </div>
              ) : (
                <h1 className="font-bold leading-tight break-words" style={{ color: displayNameColor, fontSize: '1.8rem' }}>
                  {appName}
                </h1>
              )}
            </div>
          </div>
    
          <div className="flex-1 px-6 overflow-y-auto custom-scrollbar relative z-10 flex flex-col">
            <nav className="space-y-3 flex-grow">
              {availableNavItems.map(item => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={(e) => {
                      const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                      if (guard?.isDirty) {
                          e.preventDefault();
                          guard.onAttempt(item.path);
                          return;
                      }
                      setIsSidebarOpen(false);
                  }}
                  style={() => ({ color: sidebarLinkColor })}
                  className={({ isActive }) =>
                      `sidebar-nav-item flex items-center px-4 py-3 rounded-lg text-base transition-colors duration-150 ${
                      isActive
                          ? 'active font-semibold'
                          : 'hover:text-white'
                      }`
                  }
                >
                  {item.icon} {item.name}
                </NavLink>
              ))}
              <div className="pt-4 mt-4 border-t" style={{ borderColor: `${sidebarLinkColor}33` }}>
                <NavLink
                  to='/admin/organization-hub'
                  onClick={(e) => {
                      const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                      if (guard?.isDirty) {
                          e.preventDefault();
                          guard.onAttempt('/admin/organization-hub');
                          return;
                      }
                      setIsSidebarOpen(false);
                  }}
                  style={({ isActive }) => ({
                      color: sidebarLinkColor,
                  })}
                  className={({ isActive }) =>
                      `sidebar-nav-item flex items-center px-4 py-3 rounded-lg text-base transition-colors duration-150 ${isActive ? 'active font-semibold' : 'hover:text-white'}`
                  }
                >
                  <FiBriefcase className={iconClassName} /> {t('layout.organizationHub')}
                </NavLink>
              </div>

              <WorkspacesNavSection
                sidebarLinkColor={sidebarLinkColor}
                onNavigate={() => setIsSidebarOpen(false)}
                canManage={user?.role === UserRole.WORKSPACE_ADMIN || user?.role === UserRole.ORGANIZATION_ADMIN || user?.role === UserRole.SYSTEM_ADMIN}
              />

              {availableAdminNavItems.length > 0 && (
                  <div className="pt-4 mt-4 border-t" style={{ borderColor: `${sidebarLinkColor}33` }}>
                       <h2 className="px-4 text-xs font-semibold uppercase tracking-wider" style={{ color: sidebarLinkColor, opacity: 0.7 }}>{t('layout.management')}</h2>
                       {availableAdminNavItems.map(item => (
                          <NavLink
                            key={item.name}
                            to={item.path}
                            onClick={(e) => {
                                const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                                if (guard?.isDirty) {
                                    e.preventDefault();
                                    guard.onAttempt(item.path);
                                    return;
                                }
                                setIsSidebarOpen(false);
                            }}
                            style={({ isActive }) => ({
                                color: sidebarLinkColor,
                            })}
                            className={({ isActive }) =>
                                `sidebar-nav-item flex items-center mt-2 px-4 py-3 rounded-lg text-base transition-colors duration-150 ${
                                isActive
                                    ? 'active font-semibold'
                                    : 'hover:text-white'
                                }`
                            }
                            end={item.path === '/admin'}
                          >
                            {item.icon} {item.name}
                          </NavLink>
                      ))}
                  </div>
              )}
            </nav>
          </div>
    
          <div className="px-6 py-3 space-y-2 relative z-10" style={{ borderTop: `1px solid ${sidebarLinkColor}33` }}>
            <NavLink to="/profile" onClick={(e) => {
                const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                if (guard?.isDirty) {
                    e.preventDefault();
                    guard.onAttempt('/profile');
                    return;
                }
                setIsSidebarOpen(false);
            }} className={({ isActive }) => `flex items-center p-3 rounded-lg transition-colors ${isActive ? 'bg-white/20' : 'bg-[#00000036]'}`} title="View Profile">
                <img src={userImageSidebar} alt="User" className="h-10 w-10 rounded-full mr-3 border-2 border-white/30 object-cover flex-shrink-0" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} />
                <div className="flex-grow min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: sidebarLinkColor, filter: 'brightness(0.9)' }}>{user?.name}</p>
                    <p className="text-xs truncate" style={{ color: sidebarLinkColor, filter: 'brightness(0.9)' }}>{user?.email}</p>
                </div>
                 <FiChevronsRight className="ml-2 rtl-flip" style={{ color: sidebarLinkColor, filter: 'brightness(0.9)' }} />
            </NavLink>
            <div className="flex items-center justify-center opacity-80 text-xs gap-x-1.5" style={{ color: sidebarLinkColor }}>
                <span className="font-semibold">Logyx</span>
                <span>© {new Date().getFullYear()}</span>
                <span>|</span>
                <button
                    onClick={() => {
                        setIsSidebarOpen(false);
                        onOpenLegal();
                    }}
                    style={{ color: sidebarLinkColor }}
                    className="hover:opacity-100 bg-transparent border-none p-0 cursor-pointer hover:underline"
                >
                    {t('layout.termsPrivacy')}
                </button>
                <span>|</span>
                <button
                    onClick={() => {
                        setIsSidebarOpen(false);
                        onOpenAccessibility();
                    }}
                    style={{ color: sidebarLinkColor }}
                    className="hover:opacity-100 bg-transparent border-none p-0 cursor-pointer"
                    aria-label={t('common.accessibilityStatement')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor">
                        <path d="M423.5-743.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5ZM360-80v-520q-60-5-122-15t-118-25l20-80q78 21 166 30.5t174 9.5q86 0 174-9.5T820-720l20 80q-56 15-118 25t-122 15v520h-80v-240h-80v240h-80Z"/>
                    </svg>
                </button>
            </div>
          </div>
          </>}
        </div>
    );
};


// Shown inside the content area while a lazy chunk is downloading.
// Keeps the sidebar visible — only the content area suspends.
const ContentLoader: React.FC = () => (
  <div className="flex justify-center items-center h-full" role="status" aria-label="Loading page">
    <FiLoader className="animate-spin h-8 w-8 text-blue-500" />
  </div>
);

// --- MAIN LAYOUT COMPONENT ---

const MainLayout: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout, selectedWorkspace, loading: authLoading } = useAuth();
  const { organizationSettings, isLoading: dataLoading } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  const previousPathnameRef = useRef<string | null>(null);
  const [isDarkContrast, setIsDarkContrast] = useState<boolean>(
    () => document.documentElement.classList.contains('dark-contrast')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkContrast(document.documentElement.classList.contains('dark-contrast'));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
        if (!(window as any).isLoggingOut) {
            (window as any).isLoggingOut = true;
            logout();
            navigate('/login?session_expired=true', { replace: true });
        }
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
        window.removeEventListener('session-expired', handleSessionExpired);
        (window as any).isLoggingOut = false;
    };
  }, [logout, navigate]);
  
  useEffect(() => {
    const handleResize = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current !== location.pathname) {
      setIsSidebarOpen(false);
    }
    previousPathnameRef.current = location.pathname;
  }, [location.pathname]);
  
  const isThemeMissing = user && user.role !== UserRole.SYSTEM_ADMIN && !organizationSettings;
  const isThemeMismatched = user && user.role !== UserRole.SYSTEM_ADMIN && selectedWorkspace && organizationSettings && organizationSettings.id !== selectedWorkspace.orgId;

  if (authLoading || isThemeMismatched || (isThemeMissing && dataLoading)) {
    return (
      <div className="flex justify-center items-center h-screen w-screen bg-gray-100">
        <FiLoader className="animate-spin h-12 w-12 text-blue-500" />
      </div>
    );
  }

  if (!user || !selectedWorkspace) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  const userImageSidebar = user?.profileImageUrl || `/default_user.webp`;
  const userImageHeader = user?.profileImageUrl || `/default_user.webp`;

  const isHebrewLanguage = i18n.language.startsWith('he');
  const isRTL = isHebrewLanguage;
  const iconClassName = `mr-3 ${isHebrewLanguage ? 'mt-0.5' : ''}`;

  // --- SYSTEM ADMIN LAYOUT ---
  if (user.role === UserRole.SYSTEM_ADMIN) {
    return (
      <div className="flex h-dynamic-screen bg-gray-100">
        <CookieConsent />
        <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} />
        <AccessibilityModal isOpen={showAccessibilityModal} onClose={() => setShowAccessibilityModal(false)} />
        <aside className="hidden md:flex md:flex-shrink-0">
          <div className="flex flex-col w-72 text-white shadow-lg">
            <SystemAdminSidebarContent
                setIsSidebarOpen={setIsSidebarOpen}
                userImageSidebar={userImageSidebar}
                user={user}
                onOpenLegal={() => setShowLegalModal(true)}
                onOpenAccessibility={() => setShowAccessibilityModal(true)}
            />
          </div>
        </aside>
        <div className={`fixed inset-0 z-50 flex transition-transform duration-300 ease-in-out md:hidden ${isSidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'}`}>
          <div className="w-72 text-white shadow-lg">
             <SystemAdminSidebarContent
                setIsSidebarOpen={setIsSidebarOpen}
                userImageSidebar={userImageSidebar}
                user={user}
                onOpenLegal={() => setShowLegalModal(true)}
                onOpenAccessibility={() => setShowAccessibilityModal(true)}
            />
          </div>
          <button type="button" className="flex-1 bg-black opacity-50" onClick={() => setIsSidebarOpen(false)} aria-label={t('layout.closeMenu')}></button>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <header className="md:hidden bg-white shadow-md p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-40 h-14">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-700" aria-label={isSidebarOpen ? t('layout.closeMenu') : t('layout.openMenu')}>
              {isSidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
            </button>
            <div className="text-xl font-semibold text-gray-800">{t('layout.systemAdmin')}</div>
            <Link to="/profile"><img src={userImageHeader} alt="User" className="h-8 w-8 rounded-full object-cover" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} /></Link>
          </header>
          <main className="flex-1 overflow-auto mt-14 md:mt-0"><Suspense fallback={<ContentLoader />}><Outlet /></Suspense></main>
        </div>
      </div>
    );
  }

  // --- REGULAR, ORG_ADMIN, ORGANIZATION_ADMIN LAYOUT ---

  const appName = organizationSettings?.appName || 'Boards';
  // Use /default_user.webp as fallback if logoUrl is missing or is the old hardcoded default
  const logoUrl = (!organizationSettings?.logoUrl || organizationSettings.logoUrl === '/logo_gym.webp') ? '/default_user.webp' : organizationSettings.logoUrl;
  // dark-contrast applies CSS invert(1) hue-rotate(180deg) to the whole page.
  // To get a dark sidebar with bright text after inversion, we must set the opposite: light bg, dark text.
  const sidebarColor = isDarkContrast ? '#f5f5f5' : (organizationSettings?.sidebarColor || '#004e89');
  const enableSidebarGradient = isDarkContrast ? false : (organizationSettings?.enableSidebarGradient ?? true);
  const sidebarHueRotation = organizationSettings?.sidebarHueRotation ?? 270;
  const sidebarGradientHeight = organizationSettings?.sidebarGradientHeight ?? 85;
  const sidebarGradientMaskOpacity = organizationSettings?.sidebarGradientMaskOpacity ?? 40;
  const displayNameColor = isDarkContrast ? '#000000' : (organizationSettings?.displayNameColor || '#ffffff');
  const sidebarLinkColor = isDarkContrast ? '#111111' : (organizationSettings?.sidebarLinkColor || '#e5e7eb');
  const logoCircle = organizationSettings?.logoCircle ?? true;

  const navItems: NavItem[] = [
    { name: t('layout.dashboard'), path: '/dashboard', icon: <FiTrello className={iconClassName} style={{ transform: 'rotate(180deg)' }} />, roles: [UserRole.REGULAR_USER, UserRole.ORG_EDITOR, UserRole.WORKSPACE_ADMIN, UserRole.ORGANIZATION_ADMIN], show: true },
    { name: t('layout.workspaces'), path: '/WorkHubs', icon: <FiGrid className={iconClassName} />, roles: [UserRole.REGULAR_USER, UserRole.ORG_EDITOR, UserRole.WORKSPACE_ADMIN, UserRole.ORGANIZATION_ADMIN], show: true },
  ];

  const adminNavItems: AdminNavItem[] = [
     { name: t('layout.userManagement'), path: '/admin/users', icon: <FiUsers className={iconClassName} />, roles: [UserRole.ORGANIZATION_ADMIN] },
     { name: 'Templates', path: '/admin/templates', icon: <FiBookmark className={iconClassName} />, roles: [UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN] },
  ];

  const availableNavItems = navItems.filter(item => item.roles.includes(user.role) && item.show);
  const availableAdminNavItems = adminNavItems.filter(item => item.roles.includes(user.role) && (item.show !== false));

  const selectedWorkspaceId = selectedWorkspace?.id ?? '';

  return (
    <div className="flex h-dynamic-screen bg-gray-100">
      <CookieConsent />
      <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} />
      <AccessibilityModal isOpen={showAccessibilityModal} onClose={() => setShowAccessibilityModal(false)} />
      <aside className="hidden md:flex md:flex-shrink-0 relative">
        {/* Collapse toggle button — positioned on the right edge of aside, always visible */}
        <button
          onClick={() => setIsSidebarCollapsed(v => !v)}
          className="absolute right-0 top-4 translate-x-1/2 z-50 w-6 h-6 rounded-full flex items-center justify-center shadow-md border"
          style={{ backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' }}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <FiChevronRight size={12} /> : <FiChevronLeft size={12} />}
        </button>
        <div className={`flex flex-col text-white shadow-lg transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-[19rem]'}`}>
          <SidebarContent
            sidebarColor={sidebarColor}
            enableSidebarGradient={enableSidebarGradient}
            sidebarHueRotation={sidebarHueRotation}
            sidebarGradientHeight={sidebarGradientHeight}
            sidebarGradientMaskOpacity={sidebarGradientMaskOpacity}
            logoUrl={logoUrl}
            logoCircle={logoCircle}
            appName={appName}
            displayNameColor={displayNameColor}
            sidebarLinkColor={sidebarLinkColor}
            availableNavItems={availableNavItems}
            availableAdminNavItems={availableAdminNavItems}
            setIsSidebarOpen={setIsSidebarOpen}
            userImageSidebar={userImageSidebar}
            user={user}
            selectedWorkspaceIsPersonal={selectedWorkspace.isPersonal || false}
            selectedWorkspaceId={selectedWorkspaceId}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapsed={() => setIsSidebarCollapsed(v => !v)}
            onOpenLegal={() => setShowLegalModal(true)}
            onOpenAccessibility={() => setShowAccessibilityModal(true)}
          />
        </div>
      </aside>

      <div className={`fixed inset-0 z-50 flex transition-transform duration-300 ease-in-out md:hidden ${isSidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'}`}>
        <div className="w-72 text-white shadow-lg">
            <SidebarContent
                sidebarColor={sidebarColor}
                enableSidebarGradient={enableSidebarGradient}
                sidebarHueRotation={sidebarHueRotation}
                sidebarGradientHeight={sidebarGradientHeight}
                sidebarGradientMaskOpacity={sidebarGradientMaskOpacity}
                logoUrl={logoUrl}
                logoCircle={logoCircle}
                appName={appName}
                displayNameColor={displayNameColor}
                sidebarLinkColor={sidebarLinkColor}
                availableNavItems={availableNavItems}
                availableAdminNavItems={availableAdminNavItems}
                setIsSidebarOpen={setIsSidebarOpen}
                userImageSidebar={userImageSidebar}
                user={user}
                selectedWorkspaceIsPersonal={selectedWorkspace.isPersonal || false}
                selectedWorkspaceId={selectedWorkspaceId}
                isCollapsed={false}
                onToggleCollapsed={() => {}}
                onOpenLegal={() => setShowLegalModal(true)}
                onOpenAccessibility={() => setShowAccessibilityModal(true)}
            />
        </div>
        <div className="flex-1 bg-black opacity-50" onClick={() => setIsSidebarOpen(false)}></div>
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden bg-white shadow-md p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-40 h-14">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-700" aria-label={isSidebarOpen ? t('layout.closeMenu') : t('layout.openMenu')}>
            {isSidebarOpen ? <FiX size={24} /> : <FiMenu size={24} />}
          </button>
          
          <div className="flex items-center justify-center flex-1 mx-2 overflow-hidden">
              <span className="text-xl font-bold text-gray-800 truncate">{appName}</span>
          </div>

          <Link to="/profile"><img src={userImageHeader} alt="User" className="h-8 w-8 rounded-full object-cover flex-shrink-0" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} /></Link>
        </header>
        <main className="flex-1 overflow-auto mt-14 md:mt-0"><Suspense fallback={<ContentLoader />}><Outlet /></Suspense></main>
      </div>
    </div>
  );
};

export default MainLayout;
