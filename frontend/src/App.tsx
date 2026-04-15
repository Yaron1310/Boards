
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
import PublicPlansPage from './components/public/PublicPlansPage';
import CheckoutPage from './components/public/CheckoutPage';
import CheckoutSuccessPage from './components/public/CheckoutSuccessPage';
import LegalPage from './components/legal/LegalPage';
import AccessibilityPage from './components/legal/AccessibilityPage';

// -- Lazy imports only for the authenticated area (code-split by user role) --
const MainLayout = React.lazy(() => import('./components/layout/MainLayout'));

// -- User chunk (chunk-user): all authenticated regular-user pages --
const ChatPage = React.lazy(() => import('./components/chat/ChatPage'));
const ChatInterfacePage = React.lazy(() => import('./components/chat/ChatInterfacePage'));
const ProfilePage = React.lazy(() => import('./components/profile/ProfilePage'));
const MySubscriptionPage = React.lazy(() => import('./components/profile/MySubscriptionPage'));
const DashboardPage = React.lazy(() => import('./components/profile/PersonalInsightsPage'));
const AcademyHubPage = React.lazy(() => import('./components/admin/AcademyHubPage'));
const QuestionnairePage = React.lazy(() => import('./components/questionnaire/user/QuestionnairePage'));
const CoursesListPage = React.lazy(() => import('./components/courses/CoursesListPage'));
const CourseDetailPage = React.lazy(() => import('./components/courses/CourseDetailPage'));
const LessonPage = React.lazy(() => import('./components/courses/LessonPage'));
const OrgBillingPage = React.lazy(() => import('./components/billing/OrgBillingPage'));

// -- Academy/org-admin chunk (chunk-academy-admin) --
const AdminDashboardPage = React.lazy(() => import('./components/admin/AdminDashboardPage'));
const AiMentorWizard = React.lazy(() => import('./components/admin/AiMentorWizard'));
const UserManagementPage = React.lazy(() => import('./components/admin/UserManagementPage'));
const OrganizationManagementPage = React.lazy(() => import('./components/admin/OrganizationManagementPage'));
const ChatSettingsPage = React.lazy(() => import('./components/admin/ChatSettingsPage'));
const ThemeSettingsPage = React.lazy(() => import('./components/admin/ThemeSettingsPage'));
const CourseManagementPage = React.lazy(() => import('./components/admin/CourseManagementPage'));
const BillingSettingsPage = React.lazy(() => import('./components/admin/BillingSettingsPage'));
const AcademyBillingPage = React.lazy(() => import('./components/admin/AcademyBillingPage'));
const QuestionnaireManagementPage = React.lazy(() => import('./components/admin/QuestionnaireManagementPage'));

// -- Marketing (academy-admin only) --
const MarketingPage = React.lazy(() => import('./components/admin/marketing/MarketingPage'));
const CampaignDetailPage = React.lazy(() => import('./components/admin/marketing/CampaignDetailPage'));

// -- System-admin chunk (chunk-system-admin) --
const AcademyManagementPage = React.lazy(() => import('./components/admin/AcademyManagementPage'));
const TokenLimitsPage = React.lazy(() => import('./components/admin/TokenLimitsPage'));
const TutorialSettingsPage = React.lazy(() => import('./components/admin/TutorialSettingsPage'));
const SystemPaymentsPage = React.lazy(() => import('./components/admin/SystemPaymentsPage'));
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

  // Preload only the chunk(s) this user's role will need, right after login.
  // Each import() targets one representative file from the matching manualChunks
  // group — the browser downloads the whole chunk in the background so pages
  // feel instant when the user navigates to them.
  useEffect(() => {
    if (!userRole) return;
    void import('./components/chat/ChatPage'); // chunk-user — all authenticated users
    if (
      userRole === UserRole.ORGANIZATION_ADMIN ||
      userRole === UserRole.ACADEMY_ADMIN      ||
      userRole === UserRole.SYSTEM_ADMIN
    ) {
      void import('./components/admin/AdminDashboardPage'); // chunk-org-admin
    }
    if (
      userRole === UserRole.ACADEMY_ADMIN ||
      userRole === UserRole.SYSTEM_ADMIN
    ) {
      void import('./components/admin/OrganizationManagementPage'); // chunk-academy-admin
    }
    if (userRole === UserRole.SYSTEM_ADMIN) {
      void import('./components/admin/AcademyManagementPage'); // chunk-system-admin
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

    // Move focus into modal on open; restore it on close
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

      // Escape: click the safe dismiss button in the topmost modal
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

      // Tab: trap focus inside the topmost modal
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

  // First-login language selection modal — shown over everything else once the
  // user is fully authenticated and has no preferred language set yet.
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

  // New logic to enforce academy setup wizard
  if (user && user.status === 'pending_setup') {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/setup-academy" element={<AcademySetupWizard />} />
          <Route path="*" element={<Navigate to="/setup-academy" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Redirect path after login
  const redirectPath = user?.role === UserRole.SYSTEM_ADMIN ? '/admin' : '/dashboard';

  return (
    <>
      {firstLoginModal}
    <BrowserRouter>
      <Routes>
        {/* Public routes — statically imported, render instantly with no loading spinner */}
        <Route path="/" element={<LandingPage />} />

        <Route path="/login" element={user ? <Navigate to={redirectPath} /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to={redirectPath} /> : <RegistrationPage />} />
        <Route path="/register-academy" element={user ? <Navigate to={redirectPath} /> : <AcademyRegistrationPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
        <Route path="/auth/academy/callback" element={<AcademyAuthCallbackPage />} />
        <Route path="/verify-account" element={<VerifyAccountPage />} />
        <Route path="/approve-user" element={<UserApprovalPage />} />

        <Route path="/legal" element={<LegalPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />
        <Route path="/public/:academyName" element={<PublicPlansPage />} />
        <Route path="/public/:academyName/plan/:planId" element={<PublicPlansPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

        {/* Authenticated routes — lazy loaded, Suspense only here */}
        <Route element={<Suspense fallback={<PageLoader />}><MainLayout /></Suspense>}>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat/conversation/:personaId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <ChatInterfacePage />
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
              path="/my-subscription"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <MySubscriptionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/questionnaires"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <QuestionnairePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/questionnaires/:questionnaireId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <QuestionnairePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <CoursesListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses/:courseId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <CourseDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courses/:courseId/lessons/:lessonId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <LessonPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/organization/billing"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ORGANIZATION_ADMIN]}>
                  <OrgBillingPage />
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
              path="/admin/ai-mentor-wizard"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]}>
                  <AiMentorWizard />
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
              path="/admin/organizations"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <OrganizationManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/courses"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <CourseManagementPage />
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
              path="/admin/billing-settings"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <BillingSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/academy-billing"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <AcademyBillingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chat-settings"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <ChatSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/questionnaire-settings"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <QuestionnaireManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/academies"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <AcademyManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/token-limits"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <TokenLimitsPage />
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
              path="/admin/payments"
              element={
                <ProtectedRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}>
                  <SystemPaymentsPage />
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
            <Route
              path="/admin/academy-hub"
              element={
                <ProtectedRoute allowedRoles={[UserRole.REGULAR_USER, UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN]}>
                  <AcademyHubPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/marketing"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <MarketingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/marketing/:campaignId"
              element={
                <ProtectedRoute allowedRoles={[UserRole.ACADEMY_ADMIN]}>
                  <CampaignDetailPage />
                </ProtectedRoute>
              }
            />
          </Route>

        {/* Catch-all: If user is logged in, dashboard. If not, Landing Page. */}
        <Route path="*" element={user ? <Navigate to={redirectPath} /> : <Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
    </>
  );
};

export default App;
