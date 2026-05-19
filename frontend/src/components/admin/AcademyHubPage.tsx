import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useData } from '../../hooks/useData';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserRole } from '../../types';
import ThemeSettingsPage from './ThemeSettingsPage';
import OrganizationProfileEditModal from './AcademyProfileEditModal';
import OrganizationAdminsModal from './AcademyAdminsModal';
import { FiBriefcase, FiShield, FiCheckCircle, FiAlertCircle, FiSliders } from 'react-icons/fi';

const OrganizationHubPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const { organizationSettings: settings, setOrganizationSettingsLocal, loading, error } = useData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const themeSectionRef = useRef<HTMLDivElement>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [showOrganizationAdminsModal, setShowOrganizationAdminsModal] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isThemeDirty, setIsThemeDirty] = useState(false);
  const [showCollapseWarning, setShowCollapseWarning] = useState(false);
  const [showNavWarning, setShowNavWarning] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);

  const isOrganizationAdmin = user?.role === UserRole.ORGANIZATION_ADMIN;

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
  if (error) return <div>{t('admin.organizationHub.errorLoading')}</div>;

  const organizationInfo = settings;

    return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Collapse Warning Dialog */}
      {showCollapseWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t('admin.organizationHub.unsavedChangesWarning')}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <FiAlertCircle className="text-orange-500 mr-3 flex-shrink-0" size={24} />
              <h3 className="text-lg font-semibold text-gray-800">{t('admin.organizationHub.unsavedChanges')}</h3>
            </div>
            <p className="text-gray-600 mb-6">{t('admin.organizationHub.unsavedChangesCloseMsg')}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCollapseWarning(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                aria-label={t('admin.organizationHub.keepEditing')}
              >
                {t('admin.organizationHub.keepEditing')}
              </button>
              <button
                onClick={() => {
                  setShowCollapseWarning(false);
                  setIsThemeOpen(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                aria-label={t('admin.organizationHub.discardAndClose')}
              >
                {t('admin.organizationHub.discardAndClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Warning Dialog */}
      {showNavWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t('admin.organizationHub.unsavedChangesWarning')}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center mb-4">
              <FiAlertCircle className="text-orange-500 mr-3 flex-shrink-0" size={24} />
              <h3 className="text-lg font-semibold text-gray-800">{t('admin.organizationHub.unsavedChanges')}</h3>
            </div>
            <p className="text-gray-600 mb-6">{t('admin.organizationHub.unsavedChangesLeaveMsg')}</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNavWarning(false);
                  setPendingNavPath(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                aria-label={t('admin.organizationHub.stayOnPage')}
              >
                {t('admin.organizationHub.stayOnPage')}
              </button>
              <button
                onClick={() => {
                  if (settings) {
                    setOrganizationSettingsLocal(settings);
                  }
                  setShowNavWarning(false);
                  setIsThemeOpen(false);
                  if (pendingNavPath) {
                    navigate(pendingNavPath);
                  }
                  setPendingNavPath(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                aria-label={t('admin.organizationHub.leaveAndDiscard')}
              >
                {t('admin.organizationHub.leaveAndDiscard')}
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
              <FiBriefcase className="mr-3 text-blue-500" aria-hidden="true" />{t('admin.organizationHub.title')}
            </h1>
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              {isOrganizationAdmin && (
                <button
                  onClick={() => setShowOrganizationAdminsModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto text-sm"
                  title={t('admin.organizationHub.manageAdminsTitle')}
                >
                  <FiShield className="mr-2" /> {t('admin.organizationHub.manageOrganizationAdmins')}
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
              <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label={t('admin.organizationHub.dismiss')}>&times;</button>
            </div>
          )}

      {/* General Information Section */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-700">{t('admin.organizationHub.generalInformation')}</h2>
          {isOrganizationAdmin && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
          {isOrganizationAdmin && (
            <p className="text-sm text-gray-500 mb-6">{t('admin.organizationHub.visibleToAllUsers')}</p>
          )}

        <div className="space-y-4">
          {organizationInfo?.appName && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.organizationHub.organizationName')}</h3>
              <p className="text-gray-500 font-light">{organizationInfo.appName}</p>
            </div>
          )}
          {organizationInfo?.description && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.organizationHub.description')}</h3>
              <p className="text-gray-500 whitespace-pre-wrap font-light">{organizationInfo.description}</p>
            </div>
          )}
          {(organizationInfo?.contactEmail || organizationInfo?.contactPhone) && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.organizationHub.contactInformation')}</h3>
              {organizationInfo.contactEmail && <p className="text-gray-500 font-light">{t('admin.organizationHub.emailLabel')}: {organizationInfo.contactEmail}</p>}
              {organizationInfo.contactPhone && <p className="text-gray-500 font-light">{t('admin.organizationHub.phoneLabel')}: {organizationInfo.contactPhone}</p>}
            </div>
          )}
          {(organizationInfo?.website || (organizationInfo?.socialMedia && Object.values(organizationInfo.socialMedia).some(v => v))) && (
            <div>
              <h3 className="font-semibold text-gray-600">{t('admin.organizationHub.websiteAndSocial')}</h3>
              {organizationInfo.website && <a href={organizationInfo.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{organizationInfo.website}</a>}
              <div className="flex space-x-4 mt-2">
                {organizationInfo.socialMedia?.twitter && <a href={organizationInfo.socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Twitter</a>}
                {organizationInfo.socialMedia?.linkedin && <a href={organizationInfo.socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>}
                {organizationInfo.socialMedia?.facebook && <a href={organizationInfo.socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Facebook</a>}
                {organizationInfo.socialMedia?.instagram && <a href={organizationInfo.socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Instagram</a>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin-Only Section */}
      {isOrganizationAdmin && (
        <div className="space-y-8">
          {/* Theme Settings Section */}
          <div ref={themeSectionRef} className={`bg-white rounded-lg shadow-md ${isThemeDirty && isThemeOpen ? 'ring-2 ring-orange-400' : ''}`}>
            <button
              onClick={handleThemeToggle}
              className="w-full flex justify-between items-center p-6 text-left focus:outline-none"
            >
              <h2 className="text-2xl font-semibold text-gray-700 flex items-center"><FiSliders className="mr-3 text-indigo-500" aria-hidden="true" /> {t('admin.organizationHub.themeSettings')}</h2>
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

      {isOrganizationAdmin && (
        <OrganizationProfileEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          settings={settings}

        />
      )}

      {showOrganizationAdminsModal && (
        <OrganizationAdminsModal
            isOpen={showOrganizationAdminsModal}
            onClose={() => setShowOrganizationAdminsModal(false)}
            onActionSuccess={() => {}}
        />
      )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationHubPage;
