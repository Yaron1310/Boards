import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { FiXCircle } from 'react-icons/fi';
import AccessibilityContent from './AccessibilityContent';
import { useAuthSession } from '../../hooks/useAuthSession';
import * as apiService from '../../services/geminiService';

interface AccessibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccessibilityModal: React.FC<AccessibilityModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [isDarkContrast, setIsDarkContrast] = useState<boolean>(
    () => user?.preferences?.darkContrast ?? false,
  );

  // Sync DOM class and persist to backend on change
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkContrast) {
      html.classList.add('dark-contrast');
    } else {
      html.classList.remove('dark-contrast');
    }
  }, [isDarkContrast]);

  // Re-initialise when user data arrives (e.g. after login)
  useEffect(() => {
    if (user?.preferences?.darkContrast !== undefined) {
      setIsDarkContrast(user.preferences.darkContrast);
    }
  }, [user?.preferences?.darkContrast]);

  const handleToggle = useCallback(() => {
    setIsDarkContrast((prev) => {
      const next = !prev;
      // Fire-and-forget: persist preference to backend
      void apiService.updateMyUserDetails({ preferences: { darkContrast: next } });
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[9999]">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
          {/* SVG + Title */}
          <div className="flex items-center space-x-2">
            <div className="text-gray-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="22px"
                viewBox="0 -960 960 960"
                width="22px"
                fill="currentColor"
              >
                <path d="M423.5-743.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5ZM360-80v-520q-60-5-122-15t-118-25l20-80q78 21 166 30.5t174 9.5q86 0 174-9.5T820-720l20 80q-56 15-118 25t-122 15v520h-80v-240h-80v240h-80Z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800">{t('common.accessibilityStatement')}</h2>
          </div>

          {/* Header action buttons */}
          <div className="flex items-center gap-1">
            {/* Dark contrast toggle button */}
            <button
              onClick={handleToggle}
              className={`p-2 rounded-full transition-colors ${isDarkContrast ? 'bg-gray-800 text-white hover:bg-gray-700' : 'hover:bg-gray-200 text-gray-600'}`}
              aria-label={t('legal.toggleDarkContrast')}
              aria-pressed={isDarkContrast}
              title={t('legal.toggleDarkContrast')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="22px"
                viewBox="0 -960 960 960"
                width="22px"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80v-640q-132 0-226 94T160-480q0 132 94 226t226 94Z" />
              </svg>
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
              aria-label={t('common.close')}
            >
              <FiXCircle size={24} />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar flex-grow">
          <AccessibilityContent />
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};

export default AccessibilityModal;
