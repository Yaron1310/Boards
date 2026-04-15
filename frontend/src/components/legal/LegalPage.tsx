
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import LegalContent from './LegalContent';

const LegalPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="h-screen w-full overflow-y-auto custom-scrollbar bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden">
        <div className="p-6 sm:p-10">
          <Link to="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 transition-colors">
            <FiArrowLeft className="mr-2 rtl-flip" /> {t('common.back')}
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('layout.legalPrivacy')}</h1>

          <div className="border-b border-gray-200 mb-8 sticky top-0 bg-white z-10 pt-2">
            <nav className="-mb-px flex space-x-8">
              <a href="#terms" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap pb-4 px-1 border-b-2 font-medium">{t('legal.termsOfService')}</a>
              <a href="#privacy" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap pb-4 px-1 border-b-2 font-medium">{t('legal.privacyPolicy')}</a>
            </nav>
          </div>

          <LegalContent />

        </div>
      </div>
    </div>
  );
};

export default LegalPage;
