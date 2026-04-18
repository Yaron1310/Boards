import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FiLoader, FiAlertCircle, FiHome } from 'react-icons/fi';

const OrganizationAuthCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeOrganizationSetupLogin, authError } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      const authenticate = async () => {
        try {
            const success = await completeOrganizationSetupLogin(token);
            if (success) {
              navigate('/setup-workspace', { replace: true });
            }
            // If !success, the error is already set in authContext and will be displayed.
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred during setup.');
        }
      };
      authenticate();
    } else {
      setError('Invalid setup link. Token is missing.');
    }
  }, [searchParams, navigate, completeOrganizationSetupLogin]);

  const displayError = error || authError;

  if (displayError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-4 text-center">
        <FiAlertCircle className="h-16 w-16 text-red-500 mb-6" />
        <h1 className="text-3xl font-bold text-red-700 mb-3">{t('auth.setupFailed')}</h1>
        <p className="text-red-600 mb-8 max-w-md">{displayError}</p>
        <Link
            to="/login"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700"
        >
          <FiHome className="mr-2" /> {t('auth.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
      <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
      <h1 className="text-2xl font-semibold text-gray-700">{t('auth.initializingOrganizationSetup')}</h1>
      <p className="text-gray-500">{t('auth.pleaseWaitMoment')}</p>
    </div>
  );
};

export default OrganizationAuthCallbackPage;
