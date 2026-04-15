
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

const UnsubscribePage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const email = searchParams.get('email');
  const campaignId = searchParams.get('campaignId');
  const academyName = searchParams.get('academyName') || 'the academy';

  useEffect(() => {
    const performUnsubscribe = async () => {
      if (!email || !campaignId) {
        setStatus('error');
        setError('Invalid unsubscribe link. Missing required parameters.');
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/marketing/unsubscribe?email=${encodeURIComponent(email)}&campaignId=${encodeURIComponent(campaignId)}`, {
          method: 'POST',
        });

        if (!response.ok) {
          throw new Error('Failed to unsubscribe. Please try again later.');
        }

        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setError(err.message);
      }
    };

    void performUnsubscribe();
  }, [email, campaignId]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          <img src="/logo_gym.webp" alt="Gymind" className="h-12" />
        </div>

        {status === 'loading' && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-600 font-medium">{t('common.processingRequest')}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="bg-emerald-100 text-emerald-700 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('marketing.unsubscribed')}</h1>
            <p className="text-gray-600">
              {t('marketing.unsubscribedDesc', { email, academy: academyName })}
            </p>
            <p className="text-sm text-gray-500 pt-4">
              {t('marketing.noMoreUpdates')}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-100 text-red-700 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t('common.somethingWentWrong')}</h1>
            <p className="text-red-600">{error}</p>
            <p className="text-sm text-gray-500 pt-4">
              {t('common.contactSupport')}
            </p>
          </div>
        )}
      </div>
      
      <div className="mt-8 text-gray-400 text-sm">
        {t('common.poweredByGymind')}
      </div>
    </div>
  );
};

export default UnsubscribePage;
