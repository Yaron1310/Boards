import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { FiGlobe, FiCheckCircle } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import i18n, { SUPPORTED_LANGUAGES } from '../../i18n';
import { useAuthSession } from '../../hooks/useAuthSession';

interface LanguageSelectionModalProps {
  onClose: () => void;
}

const LanguageSelectionModal: React.FC<LanguageSelectionModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const { updateUserDetails } = useAuthSession();
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'en');
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = (langCode: string) => {
    setSelectedLanguage(langCode);
  };

  const handleConfirm = async () => {
    setIsSaving(true);
    i18n.changeLanguage(selectedLanguage);
    await updateUserDetails({ preferredLanguage: selectedLanguage });
    setIsSaving(false);
    onClose();
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-modal-title"
    >
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md animate-fade-in-up">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mb-4" aria-hidden="true">
            <FiGlobe className="text-teal-600" size={28} />
          </div>
          <h3 id="language-modal-title" className="text-xl font-semibold text-gray-800">
            {t('languageModal.title')}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{t('languageModal.subtitle')}</p>
        </div>

        <div className="space-y-2 mb-6">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang.code)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                selectedLanguage === lang.code
                  ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
              aria-pressed={selectedLanguage === lang.code}
            >
              <span style={{ direction: lang.dir as 'ltr' | 'rtl' }}>{lang.name}</span>
              {selectedLanguage === lang.code && (
                <FiCheckCircle className="text-teal-500 flex-shrink-0" size={18} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            aria-label={t('languageModal.skip')}
            data-modal-escape
          >
            {t('languageModal.skip')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="px-5 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 font-medium transition-colors disabled:opacity-60"
          >
            {isSaving ? t('common.saving') : t('languageModal.confirm')}
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
};

export default LanguageSelectionModal;
