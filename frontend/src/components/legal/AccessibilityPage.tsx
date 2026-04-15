import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import AccessibilityContent from './AccessibilityContent';

const AccessibilityPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="h-screen w-full overflow-y-auto custom-scrollbar bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
        <div className="p-6 sm:p-10">
          <Link to="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 transition-colors">
            <FiArrowLeft className="mr-2 rtl-flip" /> {t('common.back')}
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('common.accessibilityStatement')}</h1>

          <AccessibilityContent />
        </div>
      </div>
    </div>
  );
};

export default AccessibilityPage;
