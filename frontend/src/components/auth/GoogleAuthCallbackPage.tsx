
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FiAlertCircle, FiLoader, FiHome } from 'react-icons/fi';

const GoogleAuthCallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthenticatedUserFromGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    const token = searchParams.get('token');
    const authFailed = searchParams.get('google_auth_failed');
    const errorMessage = searchParams.get('error_message');
    // planId might be passed back from backend if it was in the state
    const urlPlanId = searchParams.get('planId'); 

    // Check for new Google user flow (needs organization selection - rare legacy flow)
    const userIdToComplete = searchParams.get('user_id');
    const name = searchParams.get('name');
    const email = searchParams.get('email');

    if (authFailed) {
        setError(errorMessage || 'Google Sign-In failed. Please try again.');
        setProcessing(false);
        return;
    }
    
    if (userIdToComplete) {
        // New user needs to select organization
        const nameParam = name ? `&name=${encodeURIComponent(name)}` : '';
        const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
        navigate(`/select-organization?user_id=${userIdToComplete}${nameParam}${emailParam}`, { replace: true });
        return; 
    }
    
    if (token) {
      // Token received, let AuthContext handle fetching the user
      const authenticate = async () => {
        try {
          const success = await setAuthenticatedUserFromGoogle(token);
          if (success) {
            // Check for pending checkout flow. Prioritize URL param, then localStorage.
            const pendingCheckoutPlanId = urlPlanId || localStorage.getItem('pending_checkout_plan_id');
            
            if (pendingCheckoutPlanId) {
                console.log('Redirecting to checkout with plan:', pendingCheckoutPlanId);
                localStorage.removeItem('pending_checkout_plan_id');
                navigate(`/checkout?planId=${pendingCheckoutPlanId}`, { replace: true });
            } else {
                navigate('/dashboard', { replace: true });
            }
          } else {
            setError('Authentication failed. Could not retrieve user details. Please try again.');
            setProcessing(false);
          }
        } catch (e: any) {
          console.error('Error processing Google Sign-In:', e);
          setError(e.message || 'An error occurred while processing your Google Sign-In. Please try again.');
          setProcessing(false);
        }
      };
      authenticate();
    } else if (!userIdToComplete) {
      setError('Authentication failed. Missing information from Google. Please try again.');
      setProcessing(false);
    }
  }, [searchParams, navigate, setAuthenticatedUserFromGoogle]);

  if (processing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
        <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
        <h1 className="text-2xl font-semibold text-gray-700">{t('auth.processingLogin')}</h1>
        <p className="text-gray-500">{t('auth.pleaseWaitMoment')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-4 text-center">
        <FiAlertCircle className="h-16 w-16 text-red-500 mb-6" />
        <h1 className="text-3xl font-bold text-red-700 mb-3">{t('auth.signInFailed')}</h1>
        <p className="text-red-600 mb-8 max-w-md">{error}</p>
        <Link
          to="/login"
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors"
        >
          <FiHome className="mr-2" /> {t('auth.backToLogin')}
        </Link>
      </div>
    );
  }

  // Fallback loading state if processing finishes but navigation hasn't occurred (should be rare)
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
      <FiLoader className="animate-spin h-12 w-12 text-blue-500 mb-4" />
      <h1 className="text-2xl font-semibold text-gray-700">{t('auth.finalizing')}</h1>
    </div>
  );
};

export default GoogleAuthCallbackPage;
