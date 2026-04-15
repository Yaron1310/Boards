import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { BACKEND_API_URL } from '../../constants';
import { FiLoader } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const VerifyAccountPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // The backend handles success/failure and redirects.
    // This frontend page is effectively just a waiting room,
    // in case the redirect from the backend function doesn't work
    // or if the user lands here directly somehow.
    // The backend redirect is the primary mechanism.
    const token = searchParams.get('token');

    if (token) {
        window.location.href = `${BACKEND_API_URL}/api/auth/verify-account?token=${token}`;
    } else {
        // No token, redirect to login with an error.
        navigate('/login?error_message=Invalid or missing verification link.');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
        <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
        <h1 className="text-2xl font-semibold text-gray-700">{t('auth.verifyingAccount')}</h1>
        <p className="text-gray-500">{t('auth.pleaseWaitRedirect')}</p>
      </div>
    </div>
  );
};

export default VerifyAccountPage;
