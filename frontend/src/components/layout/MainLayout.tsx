import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Outlet, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { UserRole, User } from '../../types';
import { FiMenu, FiX, FiUsers, FiBriefcase, FiEdit, FiGrid, FiShield, FiChevronsRight, FiLoader, FiVideo, FiPieChart, FiMail, FiLayout, FiPlus, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useBoards } from '../../hooks/queries/useBoardQueries';

import OrganizationHubIcon from '../common/AcademyHubIcon';
import LegalModal from '../legal/LegalModal';
import AccessibilityModal from '../legal/AccessibilityModal';
import CookieConsent from '../legal/CookieConsent';

// --- BOARDS NAV SECTION ---

interface BoardsNavSectionProps {
  workspaceId: string;
  sidebarLinkColor: string;
  onNavigate: () => void;
  canCreateBoard: boolean;
}

const BoardsNavSection: React.FC<BoardsNavSectionProps> = ({ workspaceId, sidebarLinkColor, onNavigate, canCreateBoard }) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(true);
  const { data: boards = [], isLoading } = useBoards(workspaceId, false, !!workspaceId);

  return (
    <div className="pt-4 mt-4 border-t" style={{ borderColor: `${sidebarLinkColor}33` }}>
      <div className="flex items-center justify-between px-4 mb-1">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-100"
          style={{ color: sidebarLinkColor, opacity: 0.7 }}
          aria-expanded={isExpanded}
          aria-controls="boards-nav-list"
          aria-label={isExpanded ? 'Collapse boards' : 'Expand boards'}
        >
          {isExpanded ? <FiChevronDown size={12} aria-hidden="true" /> : <FiChevronRight size={12} aria-hidden="true" />}
          Boards
        </button>
        {canCreateBoard && (
          <button
            type="button"
            onClick={() => { navigate(`/workspaces/${workspaceId}/boards`); onNavigate(); }}
            className="rounded p-0.5 transition-opacity hover:opacity-100"
            style={{ color: sidebarLinkColor, opacity: 0.7 }}
            aria-label="Go to boards list to create a new board"
          >
            <FiPlus size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {isExpanded && (
        <ul id="boards-nav-list" role="list" aria-label="Boards">
          {isLoading && (
            <li className="px-4 py-2">
              <FiLoader className="animate-spin" size={14} style={{ color: sidebarLinkColor, opacity: 0.5 }} aria-hidden="true" />
            </li>
          )}
          {!isLoading && boards.length === 0 && (
            <li className="px-4 py-1.5 text-xs" style={{ color: sidebarLinkColor, opacity: 0.5 }}>
              No boards yet
            </li>
          )}
          {boards.map((board) => (
            <li key={board.id} role="listitem">
              <NavLink
                to={`/boards/${board.id}`}
                onClick={onNavigate}
                style={() => ({ color: sidebarLinkColor })}
                className={({ isActive }) =>
                  `sidebar-nav-item flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors duration-150 ${
                    isActive ? 'active font-semibold' : 'hover:text-white'
                  }`
                }
                aria-label={`Open board ${board.name}`}
              >
                <FiLayout size={13} className="flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{board.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
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
  canCreateBoard: boolean;
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
      { name: t('layout.adminDashboard'), path: '/admin', icon: <FiPieChart className={iconClassName} /> },
      { name: t('layout.workspaces'), path: '/admin/workspaces', icon: <FiShield className={iconClassName} /> },
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
             <span className="font-semibold">Gymind</span>
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
    canCreateBoard,
    onOpenLegal,
    onOpenAccessibility
}) => {
    const { t, i18n } = useTranslation();
    const isHebrewLanguage = i18n.language.startsWith('he');
    const iconClassName = `mr-3 ${isHebrewLanguage ? 'mt-0.5' : ''}`;
    const sidebarNavigate = useNavigate();
    const isOrganizationAdmin = user?.role === UserRole.ORGANIZATION_ADMIN;
    // We use a semi-transparent white overlay (rgba 255,255,255, 0.15) instead of a solid color
    // to ensure the gradient behind the link shows through while being "brightened".
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
            background-color: rgba(255, 255, 255, 0.15);
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
                        guard.onAttempt('/admin/workspace-hub?openTheme=true');
                        return;
                    }
                    setIsSidebarOpen(false);
                    sidebarNavigate('/admin/workspace-hub?openTheme=true');
                  }}
                  aria-label={t('layout.clickToEdit')}
                >
                  <img
                    src={logoUrl}
                    alt={t('common.appLogoAlt')}
                    className="h-12 w-12 rounded-full object-cover shadow-sm transition-all"
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)}
                  />
                  <span className="absolute bottom-0 right-0 flex items-center justify-center w-5 h-5 rounded-full bg-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" aria-hidden="true">
                    <FiEdit size={11} color="white" />
                  </span>
                </div>
              ) : (
                <img src={logoUrl} alt={t('common.appLogoAlt')} className="h-12 w-auto rounded-full object-cover shadow-sm mr-4" onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => (e.currentTarget.src = `/default_user.webp`)} />
              )}
              {isOrganizationAdmin ? (
                <div
                  className="relative group cursor-pointer"
                  onClick={() => {
                    const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                    if (guard?.isDirty) {
                        guard.onAttempt('/admin/workspace-hub');
                        return;
                    }
                    setIsSidebarOpen(false);
                    sidebarNavigate('/admin/workspace-hub');
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
                  to='/admin/workspace-hub'
                  onClick={(e) => {
                      const guard = (window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null }).__navigationGuard;
                      if (guard?.isDirty) {
                          e.preventDefault();
                          guard.onAttempt('/admin/workspace-hub');
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
                  <OrganizationHubIcon className={iconClassName} /> {t('layout.organizationHub')}
                </NavLink>
              </div>

              {selectedWorkspaceId && (
                <BoardsNavSection
                  workspaceId={selectedWorkspaceId}
                  sidebarLinkColor={sidebarLinkColor}
                  onNavigate={() => setIsSidebarOpen(false)}
                  canCreateBoard={canCreateBoard}
                />
              )}

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
                <span className="font-semibold">Gymind</span>
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
  const { organizationSettings } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  // isThemeMissing (organizationSettings not yet loaded) is intentionally excluded here.
  // The layout renders fine with default theme fallbacks while organizationSettings loads
  // in the background — blocking the entire UI causes blank content after tab restore.
  if (authLoading || isThemeMismatched) {
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

  const appName = organizationSettings?.appName || 'Gymind';
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
  
  const navItems: NavItem[] = [
    { name: t('layout.dashboard'), path: '/dashboard', icon: <FiGrid className={iconClassName} />, roles: [UserRole.REGULAR_USER, UserRole.WORKSPACE_ADMIN, UserRole.ORGANIZATION_ADMIN], show: true },
  ];

  const adminNavItems: AdminNavItem[] = [
     { name: t('layout.adminDashboard'), path: '/admin', icon: <FiPieChart className={iconClassName} />, roles: [UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN] },
     { name: t('layout.userManagement'), path: '/admin/users', icon: <FiUsers className={iconClassName} />, roles: [UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN] },
     { name: t('layout.workspaces'), path: '/admin/workspaces', icon: <FiBriefcase className={iconClassName} />, roles: [UserRole.ORGANIZATION_ADMIN] },
  ];

  const availableNavItems = navItems.filter(item => item.roles.includes(user.role) && item.show);
  const availableAdminNavItems = adminNavItems.filter(item => item.roles.includes(user.role) && (item.show !== false));

  const selectedWorkspaceId = selectedWorkspace?.id ?? '';
  const canCreateBoard =
    user.role === UserRole.WORKSPACE_ADMIN ||
    user.role === UserRole.ORGANIZATION_ADMIN ||
    user.role === UserRole.SYSTEM_ADMIN;

  return (
    <div className="flex h-dynamic-screen bg-gray-100">
      <CookieConsent />
      <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} />
      <AccessibilityModal isOpen={showAccessibilityModal} onClose={() => setShowAccessibilityModal(false)} />
      <aside className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-[19rem] text-white shadow-lg">
          <SidebarContent
            sidebarColor={sidebarColor}
            enableSidebarGradient={enableSidebarGradient}
            sidebarHueRotation={sidebarHueRotation}
            sidebarGradientHeight={sidebarGradientHeight}
            sidebarGradientMaskOpacity={sidebarGradientMaskOpacity}
            logoUrl={logoUrl}
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
            canCreateBoard={canCreateBoard}
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
                canCreateBoard={canCreateBoard}
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