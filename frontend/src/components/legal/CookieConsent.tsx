
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';

const CookieConsent: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Do not show cookie banner on native apps (Android/iOS)
    if (Capacitor.isNativePlatform()) {
      return;
    }

    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 bg-opacity-95 text-white p-4 shadow-2xl z-[9999] flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-700 animate-fade-in-up">
      <div className="text-sm text-gray-300 max-w-4xl">
        <p>
          {t('legal.cookieConsentText')}
        </p>
      </div>
      <button
        onClick={handleAccept}
        className="whitespace-nowrap px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors text-sm shadow-md"
      >
        {t('legal.cookieConsentAccept')}
      </button>
    </div>
  );
};

export default CookieConsent;
