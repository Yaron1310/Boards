
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { UserRole } from './types';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { debugLog } from './config';

// -- Static imports: public/auth pages render immediately with no loading spinner --
import LanguageSelectionModal from './components/common/LanguageSelectionModal';
import SelectContextPage from './components/auth/SelectContextPage';
import AcademySetupWizard from './components/auth/AcademySetupWizard';
import LoginPage from './components/auth/LoginPage';
import RegistrationPage from './components/auth/RegistrationPage';
import AcademyRegistrationPage from './components/auth/AcademyRegistrationPage';
import ResetPasswordPage from './components/auth/ResetPasswordPage';
import GoogleAuthCallbackPage from './components/auth/GoogleAuthCallbackPage';
import AcademyAuthCallbackPage from './components/auth/AcademyAuthCallbackPage';
import VerifyAccountPage from './components/auth/VerifyAccountPage';
import UserApprovalPage from './components/auth/UserApprovalPage';
import LandingPage from './components/public/LandingPage';
import LegalPage from './components/legal/LegalPage';
import AccessibilityPage from './components/legal/AccessibilityPage';

// -- Lazy imports only for the authenticated area (code-split by user role) --
const MainLayout = React.lazy(() => import('./components/layout/MainLayout'));

// -- User chunk --
const ProfilePage = React.lazy(() => import('./components/profile/ProfilePage'));

// -- Workspace/org-admin chunk --
const AdminDashboardPage = React.lazy(() => import('./components/admin/AdminDashboardPage'));
const UserManagementPage = React.lazy(() => import('./components/admin/UserManagementPage'));
const OrganizationManagementPage = React.lazy(() => import('./components/admin/OrganizationManagementPage'));
const ThemeSettingsPage = React.lazy(() => import('./components/admin/ThemeSettingsPage'));

// -- Work management chunk --
const WorkspaceHomePage = React.lazy(() => import('./components/boards/WorkspaceHomePage'));
const BoardListPage = React.lazy(() => import('./components/boards/BoardListPage'));
const BoardViewPage = React.lazy(() => import('./components/boards/BoardViewPage'));
const ColumnManagementPage = React.lazy(() => import('./components/boards/ColumnManagementPage'));

// -- System-admin chunk --
const AcademyManagementPage = React.lazy(() => import('./components/admin/AcademyManagementPage'));
const TutorialSettingsPage = React.lazy(() => import('./components/admin/TutorialSettingsPage'));
const EmailTemplatesPage = React.lazy(() => import('./components/admin/EmailTemplatesPage'));

const PageLoader: React.FC = () => (
  <div
    className="flex items-center justify-center min-h-screen bg-gray-50"
    role="status"
    aria-label="Loading page"
  >
    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  const { user, contextSelectionMode, showLanguageModal, dismissLanguageModal } = useAuth();
  const userRole = user?.role ?? null;

  useEffect(() => {
    if (!userRole) return;
    if (
      userRole === UserRole.ORGANIZATION_ADMIN ||
      userRole === UserRole.ACADEMY_ADMIN      ||
      userRole === UserRole.SYSTEM_ADMIN
    ) {
      void import('./components/admin/AdminDashboardPage');
    }
    if (
      userRole === UserRole.ACADEMY_ADMIN ||
      userRole === UserRole.SYSTEM_ADMIN
    ) {
      void import('./components/admin/OrganizationManagementPage');
    }
    if (userRole === UserRole.SYSTEM_ADMIN) {
      void import('./components/admin/AcademyManagementPage');
    }
  }, [userRole]);

  // Global modal accessibility: Escape to close, focus-on-open, return-focus-on-close, focus trap
  useEffect(() => {
    const FOCUSABLE =
      'a[href],area[href],button:not([disabled]),input:not([disabled]),' +
      'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const CLOSE_TEXTS = new Set([
      // English
      'Close', 'Cancel', 'Go Back', 'Back', 'Skip',
      // Hebrew
      'סגור', 'ביטול', 'חזור', 'דלג',
    ]);

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    const focusStack: Array<HTMLElement | null> = [];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          focusStack.push(
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          );
          requestAnimationFrame(() => {
            const first = node.querySelector<HTMLElement>(FOCUSABLE);
            first?.focus();
          });
        }
        for (const node of Array.from(mutation.removedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const prev = focusStack.pop() ?? null;
          if (prev && document.contains(prev)) {
            requestAnimationFrame(() => prev.focus());
          }
        }
      }
    });

    observer.observe(modalRoot, { childList: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalRoot.lastElementChild) return;
      const topModal = modalRoot.lastElementChild;

      if (e.key === 'Escape') {
        const candidates = Array.from(
          topModal.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        ).filter(
          btn =>
            btn.hasAttribute('data-modal-escape') ||
            CLOSE_TEXTS.has(btn.textContent?.trim() ?? '')
        );
        if (candidates.length === 0) return;
        e.preventDefault();
        candidates[candidates.length - 1].click();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(topModal.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  debugLog('[App.tsx] Rendering with user:', 'color: #FFA500;', user);

  const firstLoginModal = showLanguageModal && user && !contextSelectionMode ? (
    <LanguageSelectionModal onClose={dismissLanguageModal} />
  ) : null;

  if (contextSelectionMode) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<SelectContextPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (user && user.status === 'pending_setup') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/setup-workspace" element={<AcademySetupWizard />} />
          <Route path="*" element={<Navigate to="/setup-workspace" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const redirectPath = user?.role === UserRole.SYSTEM_ADMIN ? '/admin' : '/workspaces';

  return (
    <>
      {firstLoginModal}
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={user ? <Navigate to={redirectPath} /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to={redirectPath} /> : <RegistrationPage />} />
        <Route path="/register-workspace" element={user ? <Navigate to={redirectPath} /> : <AcademyRegistrationPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
        <Route path="/auth/workspace/callback" element={<AcademyAuthCallbackPage />} />
        <Route path="/verify-account" element={<VerifyAccountPage />} />
        <Route path="/approve-user" element={<UserApprovalPage />} />
        <Route path="/legal" element={<LegalPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />

        {/* Authenticated routes */}
        <Route element={<Suspense fallback={<PageLoader />}><MainLayout /></Suspense>}>
            <Route
              path="/dashboard"
              element={<Navigate to="/workspaces" replace />}
            />

            <Route
              path="/workspaces"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <WorkspaceHomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workspaces/:workspaceId/boards"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <BoardListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/boards/:boardId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <BoardViewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/columns"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <ColumnManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN]}>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users/:userId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN]}>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/workspaces"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <OrganizationManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/theme-settings"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <ThemeSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/workspaces"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <AcademyManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/tutorials"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <TutorialSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/email-templates"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <EmailTemplatesPage />
                </ProtectedRoute>
              }
            />
          </Route>

        {/* Catch-all */}
        <Route path="*" element={user ? <Navigate to={redirectPath} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
    </>
  );
};

export default App;
