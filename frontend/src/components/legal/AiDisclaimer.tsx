
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle } from 'react-icons/fi';

const AiDisclaimer: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="mt-1 text-center relative group">
      <p className="text-[10px] text-gray-400 cursor-help inline-flex items-center">
        <FiAlertCircle className="mr-1" />
        {t('legal.aiCanMakeMistakes')}
      </p>
      
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 md:w-96 p-3 bg-gray-800 text-gray-200 text-xs rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 text-center leading-relaxed">
        <p className="font-bold mb-1 text-white">{t('legal.aiDisclaimerTitle')}</p>
        <p>
          {t('legal.aiDisclaimerText')}
        </p>
        <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"></div>
      </div>
    </div>
  );
};

export default AiDisclaimer;
