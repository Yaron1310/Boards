import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BACKEND_API_URL } from '../../constants';
import { FiLoader, FiCheckCircle, FiAlertCircle, FiLogIn } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

type Status = 'processing' | 'success' | 'error';

const UserApprovalPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage(t('auth.noApprovalToken'));
      return;
    }

    const approveUser = async () => {
      try {
        const response = await fetch(`${BACKEND_API_URL}/api/auth/approve-user?token=${token}`);

        // Since the backend sends an HTML response, we read it as text.
        const responseText = await response.text();

        if (!response.ok) {
            // Try to parse error from a simple HTML response
            const match = responseText.match(/<p>(.*?)<\/p>/);
            throw new Error(match ? match[1] : 'Approval failed. The link may be invalid or expired.');
        }

        setStatus('success');
        setMessage(t('auth.approvalSuccess'));
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || t('auth.approvalUnexpectedError'));
      }
    };

    approveUser();
  }, [searchParams, t]);

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <>
            <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
            <h1 className="text-2xl font-semibold text-gray-700">{t('auth.processingApproval')}</h1>
            <p className="text-gray-500">{message || t('auth.processingApprovalMessage')}</p>
          </>
        );
      case 'success':
        return (
          <>
            <FiCheckCircle className="h-16 w-16 text-green-500 mb-6" />
            <h1 className="text-3xl font-bold text-green-700 mb-3">{t('auth.approvalSuccessTitle')}</h1>
            <p className="text-gray-600 mb-8 max-w-md">{message}</p>
            <Link
              to="/login"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors"
            >
              <FiLogIn className="mr-2" /> {t('auth.backToApp')}
            </Link>
          </>
        );
      case 'error':
        return (
          <>
            <FiAlertCircle className="h-16 w-16 text-red-500 mb-6" />
            <h1 className="text-3xl font-bold text-red-700 mb-3">{t('auth.approvalFailed')}</h1>
            <p className="text-red-600 mb-8 max-w-md">{message}</p>
             <Link
              to="/login"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors"
            >
              <FiLogIn className="mr-2" /> {t('auth.backToApp')}
            </Link>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
        {renderContent()}
      </div>
    </div>
  );
};

export default UserApprovalPage;
