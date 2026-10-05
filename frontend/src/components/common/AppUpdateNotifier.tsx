import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import { useAppUpdateCheck } from '../../hooks/useAppUpdateCheck';

/**
 * Brings long-open tabs onto the latest deploy. Once a newer build is detected it shows a
 * small "new version" banner with a Refresh button, and also reloads on its own the next
 * time the user moves to another page — a moment when nothing is being typed, so no
 * half-finished input is lost. Must render inside the router.
 */
const AppUpdateNotifier: React.FC = () => {
  const { t } = useTranslation();
  const updateAvailable = useAppUpdateCheck();
  const { pathname } = useLocation();
  const pathAtDetection = useRef<string | null>(null);

  useEffect(() => {
    if (!updateAvailable) return;
    if (pathAtDetection.current === null) {
      pathAtDetection.current = pathname;
      return;
    }
    // Navigated since the update was found: load the new build for the page they're going to.
    if (pathname !== pathAtDetection.current) window.location.reload();
  }, [updateAvailable, pathname]);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg"
    >
      <span>{t('common.newVersionAvailable')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1 font-medium bg-indigo-500 hover:bg-indigo-400 rounded-md transition-colors"
        aria-label={t('common.refreshToUpdate')}
      >
        <FiRefreshCw size={13} aria-hidden="true" />
        {t('common.refresh')}
      </button>
    </div>
  );
};

export default AppUpdateNotifier;
