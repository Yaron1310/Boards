import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserRole } from '../../types';
import AcademyBillingPage from './AcademyBillingPage';
import ThemeSettingsPage from './ThemeSettingsPage';
import AcademyProfileEditModal from './AcademyProfileEditModal';
import AcademyAdminsModal from './AcademyAdminsModal';
import { FiCreditCard, FiTrello, FiShield, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import AcademyHubIcon from '../common/AcademyHubIcon';

const AcademyHubPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { academySettings: settings, setAcademySettingsLocal, loading, error } = useData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const themeSectionRef = useRef<HTMLDivElement>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [showAcademyAdminsModal, setShowAcademyAdminsModal] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isThemeDirty, setIsThemeDirty] = useState(false);
  const [showCollapseWarning, setShowCollapseWarning] = useState(false);
  const [showNavWarning, setShowNavWarning] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);

  const isAcademyAdmin = user?.role === UserRole.ACADEMY_ADMIN;

  const handleThemeDirtyChange = useCallback((dirty: boolean) => {
    setIsThemeDirty(dirty);
  }, []);

  // Register a navigation guard on window for sidebar links to check
  useEffect(() => {
    const win = window as Window & { __navigationGuard?: { isDirty: boolean; onAttempt: (path: string) => void } | null };
    if (isThemeDirty && isThemeOpen) {
      win.__navigationGuard = {
        isDirty: true,
        onAttempt: (targetPath: string) => {
          setPendingNavPath(targetPath);
          setShowNavWarning(true);
        }
      };
    } else {
      win.__navigationGuard = null;
    }
    return () => { win.__navigationGuard = null; };
  }, [isThemeDirty, isThemeOpen]);

  // Auto-open theme settings when navigated with ?openTheme=true
  useEffect(() => {
    if (searchParams.get('openTheme') === 'true') {
      setIsThemeOpen(true);
      // Clean up the param so it doesn't re-trigger
      searchParams.delete('openTheme');
      setSearchParams(searchParams, { replace: true });
      // Scroll to theme section after it expands and renders
      setTimeout(() => {
        themeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [searchParams, setSearchParams]);

  const handleThemeToggle = () => {
    if (isThemeOpen && isThemeDirty) {
      setShowCollapseWarning(true);
      return;
    }
    setIsThemeOpen(!isThemeOpen);
  };

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (feedback) {
        const timer = setTimeout(() => {
            setFeedback(null);
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [feedback]);

  if (loading) return <div>{t('common.loading')}</div>;
  if (error) return <div>{t('admin.academyHub.errorLoading')}</div>;

  const academyInfo = settings;

    return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Collapse Warning Dialog */}
      {showCollapseWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t('admin.academyHub.unsavedChangesWarning')}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <FiAlertCircle className="text-orange-500 mr-3 flex-shrink-0" size={24} />
              <h3 className="text-lg font-semibold text-gray-800">{t('admin.academyHub.unsavedChanges')}</h3>
            </div>
            <p className="text-gray-600 mb-6">{t('admin.academyHub.unsavedChangesCloseMsg')}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCollapseWarning(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                aria-label={t('admin.academyHub.keepEditing')}
              >
                {t('admin.academyHub.keepEditing')}
              </button>
              <button
                onClick={() => {
                  setShowCollapseWarning(false);
                  setIsThemeOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                aria-label={t('admin.academyHub.discardAndClose')}
              >
                {t('admin.academyHub.discardAndClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Warning Dialog */}
      {showNavWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t('admin.academyHub.unsavedChangesWarning')}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <FiAlertCircle className="text-orange-500 mr-3 flex-shrink-0" size={24} />
              <h3 className="text-lg font-semibold text-gray-800">{t('admin.academyHub.unsavedChanges')}</h3>
            </div>
            <p className="text-gray-600 mb-6">{t('admin.academyHub.unsavedChangesLeaveMsg')}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNavWarning(false);
                  setPendingNavPath(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                aria-label={t('admin.academyHub.stayOnPage')}
              >
                {t('admin.academyHub.stayOnPage')}
              </button>
              <button
                onClick={() => {
                  if (settings) {
                    setAcademySettingsLocal(settings);
                  }
                  setShowNavWarning(false);
                  setIsThemeOpen(false);
                  if (pendingNavPath) {
                    navigate(pendingNavPath);
                  }
                  setPendingNavPath(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                aria-label={t('admin.academyHub.leaveAndDiscard')}
              >
                {t('admin.academyHub.leaveAndDiscard')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
            <h1 className="text-3xl font-bold text-gray-800 flex items-center mb-2 sm:mb-0">
              <AcademyHubIcon className="mr-3 text-blue-500"/>{t('admin.academyHub.title')}
            </h1>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              {isAcademyAdmin && (
                <button
                  onClick={() => setShowAcademyAdminsModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto text-sm"
                  title={t('admin.academyHub.manageAdminsTitle')}
                >
                  <FiShield className="mr-2" /> {t('admin.academyHub.manageAcademyAdmins')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Scrolling Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-4xl mx-auto">
          {feedback && (
            <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
              {feedback.text}
              <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label={t('admin.academyHub.dismiss')}>&times;</button>
            </div>
          )}

      {/* General Information Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-700">{t('admin.academyHub.generalInformation')}</h2>
          {isAcademyAdmin && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
          {isAcademyAdmin && (
            <p className="text-sm text-gray-500 mb-6">{t('admin.academyHub.visibleToAllUsers')}</p>
          )}

        <div className="space-y-4">
          {academyInfo?.appName && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.academyHub.academyName')}</h3>
              <p className="text-gray-500 font-light">{academyInfo.appName}</p>
            </div>
          )}
          {academyInfo?.description && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.academyHub.description')}</h3>
              <p className="text-gray-500 whitespace-pre-wrap font-light">{academyInfo.description}</p>
            </div>
          )}
          {(academyInfo?.contactEmail || academyInfo?.contactPhone) && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.academyHub.contactInformation')}</h3>
              {academyInfo.contactEmail && <p className="text-gray-500 font-light">{t('admin.academyHub.emailLabel')}: {academyInfo.contactEmail}</p>}
              {academyInfo.contactPhone && <p className="text-gray-500 font-light">{t('admin.academyHub.phoneLabel')}: {academyInfo.contactPhone}</p>}
            </div>
          )}
          {(academyInfo?.website || (academyInfo?.socialMedia && Object.values(academyInfo.socialMedia).some(v => v))) && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.academyHub.websiteAndSocial')}</h3>
              {academyInfo.website && <a href={academyInfo.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{academyInfo.website}</a>}
              <div className="flex space-x-4 mt-2">
                {academyInfo.socialMedia?.twitter && <a href={academyInfo.socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Twitter</a>}
                {academyInfo.socialMedia?.linkedin && <a href={academyInfo.socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>}
                {academyInfo.socialMedia?.facebook && <a href={academyInfo.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Facebook</a>}
                {academyInfo.socialMedia?.instagram && <a href={academyInfo.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Instagram</a>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin-Only Section */}
      {isAcademyAdmin && (
        <div className="space-y-8">
          {/* Academy Billing Section */}
          <div className="bg-white rounded-lg shadow-md">
            <button
              onClick={() => setIsBillingOpen(!isBillingOpen)}
              className="w-full flex justify-between items-center p-6 text-left focus:outline-none"
            >
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center"><FiCreditCard className="mr-3 text-purple-600" /> {t('admin.academyHub.academyBilling')}</h2>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-6 w-6 transform transition-transform duration-200 ${isBillingOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isBillingOpen && (
              <div className="p-6 pt-0">
                <AcademyBillingPage />
              </div>
            )}
          </div>

          {/* Theme Settings Section */}
          <div ref={themeSectionRef} className={`bg-white rounded-lg shadow-md ${isThemeDirty && isThemeOpen ? 'ring-2 ring-orange-400' : ''}`}>
            <button
              onClick={handleThemeToggle}
              className="w-full flex justify-between items-center p-6 text-left focus:outline-none"
            >
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center"><FiTrello className="mr-3 text-indigo-500"/> {t('admin.academyHub.themeSettings')}</h2>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-6 w-6 transform transition-transform duration-200 ${isThemeOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isThemeOpen && (
              <div className="p-6 pt-0">
                <ThemeSettingsPage onDirtyChange={handleThemeDirtyChange} />
              </div>
            )}
          </div>
        </div>
      )}

      {isAcademyAdmin && (
        <AcademyProfileEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          settings={settings}

        />
      )}

      {showAcademyAdminsModal && (
        <AcademyAdminsModal
            isOpen={showAcademyAdminsModal}
            onClose={() => setShowAcademyAdminsModal(false)}
            onActionSuccess={() => {}}
        />
      )}
        </div>
      </div>
    </div>
  );
};

export default AcademyHubPage;
