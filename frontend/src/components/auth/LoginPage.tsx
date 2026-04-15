
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { BACKEND_API_URL } from '../../constants';
import * as apiService from '../../services/geminiService';
import { useRecaptcha } from '../../hooks/useRecaptcha';
import { FiLogIn, FiUserPlus, FiEye, FiEyeOff, FiAlertCircle, FiInfo, FiLoader } from 'react-icons/fi';
import { Capacitor } from '@capacitor/core';
import LegalModal from '../legal/LegalModal';
import AccessibilityModal from '../legal/AccessibilityModal';
import { GoogleIconSVG } from './GoogleAuthIcons';
import { useTranslation } from 'react-i18next';
import { useForceDocumentLang } from '../../hooks/useForceDocumentLang';

const LoginPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  useForceDocumentLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  const { login, loading: authLoading, authError, clearAuthError, user, contextSelectionMode, nativeGoogleLogin, nativeMicrosoftLogin } = useAuth();
  const { executeRecaptcha } = useRecaptcha();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageSpecificError, setPageSpecificError] = useState<string | null>(null);
  useEffect(() => {
    if (pageSpecificError) {
      const timer = setTimeout(() => {
        setPageSpecificError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pageSpecificError]);

  const [pageSpecificInfo, setPageSpecificInfo] = useState<string | null>(null);
  useEffect(() => {
    if (pageSpecificInfo) {
      const timer = setTimeout(() => {
        setPageSpecificInfo(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pageSpecificInfo]);

  const [forgotPasswordState, setForgotPasswordState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [showLegalModal, setShowLegalModal] = useState(false);

  const planId = searchParams.get('planId');
  const flow = searchParams.get('flow');

  useEffect(() => {
    const html = document.documentElement;
    html.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    return () => {
      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  useEffect(() => {
    if (user && !contextSelectionMode) {
      const pendingPlanId = localStorage.getItem('pending_checkout_plan_id') || searchParams.get('planId');
      if (pendingPlanId) {
          localStorage.removeItem('pending_checkout_plan_id'); // Clear it
          navigate(`/checkout?planId=${pendingPlanId}`);
      } else {
          navigate('/dashboard');
      }
    }
  }, [user, contextSelectionMode, navigate, searchParams]);

  useEffect(() => {
    const googleAuthFailed = searchParams.get('google_auth_failed');
    const urlErrorMessage = searchParams.get('error_message');
    const sessionExpired = searchParams.get('session_expired');
    const accountVerified = searchParams.get('account_verified');
    const passwordCreated = searchParams.get('password_created');
    const passwordReset = searchParams.get('password_reset');
    const infoMessage = searchParams.get('message');


    if (googleAuthFailed) {
        setPageSpecificError(urlErrorMessage || t('auth.googleSignInFailed'));
    } else if (sessionExpired) {
        setPageSpecificInfo(t('auth.sessionExpired'));
    } else if (accountVerified) {
        setPageSpecificInfo(t('auth.emailVerified'));
    } else if (passwordCreated) {
        setPageSpecificInfo(infoMessage || t('auth.passwordCreated'));
    } else if (passwordReset) {
        setPageSpecificInfo(t('auth.passwordResetSuccess'));
    } else if (urlErrorMessage) {
        setPageSpecificError(urlErrorMessage);
    }

    // Clean up URL after reading the messages, but keep planId info if present
    const paramsToClean = ['google_auth_failed', 'error_message', 'session_expired', 'account_verified', 'password_created', 'password_reset', 'message'];
    let paramsChanged = false;
    paramsToClean.forEach(param => {
        if (searchParams.has(param)) {
            searchParams.delete(param);
            paramsChanged = true;
        }
    });
    if (paramsChanged) {
        setSearchParams(searchParams, { replace: true });
    }

  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (pageSpecificError || pageSpecificInfo || authError) {
      setPageSpecificError(null);
      setPageSpecificInfo(null);
      clearAuthError();
      setForgotPasswordState('idle');
    }
  }, [email, password, clearAuthError]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageSpecificError(null);
    clearAuthError();

    if (!email || !password) {
        setPageSpecificError(t('auth.emailPasswordRequired'));
        return;
    }

    if (!/^[!-~]+$/.test(password)) {
        setPageSpecificError(t('auth.latinCharsOnly'));
        return;
    }

    // Save intent before login attempt
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
    }

    try {
        const recaptchaToken = await executeRecaptcha('login');
        await login(email, password, recaptchaToken);
        // Successful login is handled by the useEffect watching the `user` object.
    } catch (error: any) {
        // The backend now provides the complete, user-facing error message,
        // which is caught here and displayed.
        setPageSpecificError(error.message);
    }
  };

  const handleGoogleLogin = () => {
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
    }

    if (Capacitor.isNativePlatform()) {
        nativeGoogleLogin();
    } else {
        window.location.href = `${BACKEND_API_URL}/api/auth/google`;
    }
  };

  const handleMicrosoftLogin = () => {
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
    }

    if (Capacitor.isNativePlatform()) {
      nativeMicrosoftLogin();
    } else {
      window.location.href = `${BACKEND_API_URL}/api/auth/microsoft`;
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setPageSpecificError(t('auth.enterEmailToReset'));
      return;
    }
    setForgotPasswordState('loading');
    setPageSpecificError(null);
    setPageSpecificInfo(null);
    clearAuthError();

    try {
      const recaptchaToken = await executeRecaptcha('forgot_password');
      const result = await apiService.requestPasswordReset(email, recaptchaToken);
      setForgotPasswordState('sent');
      setPageSpecificInfo(result.message);
    } catch (error: any) {
      setForgotPasswordState('idle');
      setPageSpecificError(error.message);
    }
  };


  const displayError = pageSpecificError || authError;
  const logoUrl = '/logo_gym.webp'; // Hardcoded logo URL

  return (
    <div className="auth-page-no-contrast min-h-screen flex justify-center items-center bg-gradient-to-br from-[#3b82f645] to-[#eb0fe72b] px-4 py-8">
      <LegalModal isOpen={showLegalModal} onClose={() => setShowLegalModal(false)} />
      <AccessibilityModal isOpen={showAccessibilityModal} onClose={() => setShowAccessibilityModal(false)} />

      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden md:scale-[.8]">

        {/* Left Section: Branding (Top on Mobile) */}
        <div className="md:w-1/2 bg-gray-50 p-8 md:p-12 flex flex-col justify-center items-center text-center border-b md:border-b-0 md:border-r border-gray-100">
          <img src={logoUrl} alt={t('common.appLogoAlt')} className="h-24 w-auto" />
          <div className="flex items-center justify-center text-ind text-[0.95rem]" style={{ fontWeight: 550 }}>
            <span>{t('auth.taglineLearn')}</span>
            <span className="mx-2 text-xl leading-normal">·</span>
            <span>{t('auth.taglineGrow')}</span>
            <span className="mx-2 text-xl leading-normal">·</span>
            <span>{t('auth.taglineTransform')}</span>
          </div>
        </div>

        {/* Right Section: Form (Bottom on Mobile) */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">{t('auth.signInTitle')}</h2>

          {displayError && (
            <div id="login-form-error" role="alert" className="mb-6 text-sm text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 flex items-center shadow">
              <FiAlertCircle className="mr-3 h-5 w-5 flex-shrink-0"/>
              <span className="font-medium">{displayError}</span>
            </div>
          )}

          {pageSpecificInfo && !displayError && (
            <div className={`mb-6 text-sm p-4 rounded-lg border flex items-center shadow ${forgotPasswordState === 'sent' ? 'bg-green-100 border-green-300 text-green-700' : 'bg-blue-100 border-blue-300 text-blue-700'}`}>
              <FiInfo className="mr-3 h-5 w-5 flex-shrink-0"/>
              <span className="font-medium">{pageSpecificInfo}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('common.emailAddress')} <span aria-hidden="true">*</span></label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                required
                aria-required="true"
                aria-describedby={displayError ? "login-form-error" : undefined}
                className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder={t('common.emailPlaceholder')}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password_login" className="block text-sm font-medium text-gray-700">{t('common.password')} <span aria-hidden="true">*</span></label>
                <div className="text-sm">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={authLoading || forgotPasswordState === 'loading'}
                    className="font-medium text-blue-600 hover:text-blue-500 disabled:text-gray-400"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              </div>
              <div className="mt-1 relative">
                  <input
                  id="password_login"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-describedby={displayError ? "login-form-error" : undefined}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="••••••••"
                  />
                  <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700"
                      aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                  >
                      {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                  </button>
              </div>
            </div>

            <div>
              <div className="text-xs text-center text-gray-500 mb-3">
                <button type="button" onClick={() => setShowLegalModal(true)} className="hover:text-blue-600 hover:underline">
                  {t('auth.termsPrivacyApply')}
                </button>
              </div>
              <button
                type="submit"
                disabled={authLoading || forgotPasswordState === 'loading'}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 disabled:opacity-70"
              >
                {authLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : <FiLogIn className="mr-2 h-5 w-5" /> }
                {authLoading ? t('auth.signingIn') : t('auth.signIn')}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">{t('auth.orContinueWith')}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={handleGoogleLogin}
                type="button"
                disabled={authLoading}
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 disabled:opacity-70"
              >
                <GoogleIconSVG className="h-5 w-5 mr-2" />
                {t('auth.signInWithGoogle')}
              </button>
              <button
                onClick={handleMicrosoftLogin}
                type="button"
                disabled={authLoading}
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 disabled:opacity-70"
              >
                <img src="/ms-symbollockup_mssymbol_19.svg" alt="Microsoft" className="h-5 w-5 mr-2" />
                {t('auth.signInWithMicrosoft')}
              </button>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-gray-600">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              <FiUserPlus className="inline mr-1 h-4 w-4" /> {t('auth.createOne')}
            </Link>
          </p>

          <div className="mt-8 pt-4 border-t border-gray-100 text-center">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowAccessibilityModal(true)}
                className="text-gray-400 hover:text-gray-600 bg-transparent border-none p-0 cursor-pointer"
                aria-label={t('common.accessibilityStatement')}
                title={t('common.accessibilityStatement')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="22px" viewBox="0 -960 960 960" width="22px" fill="currentColor" aria-hidden="true" style={{ marginTop: '-5px' }}>
                  <path d="M423.5-743.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5ZM360-80v-520q-60-5-122-15t-118-25l20-80q78 21 166 30.5t174 9.5q86 0 174-9.5T820-720l20 80q-56 15-118 25t-122 15v520h-80v-240h-80v240h-80Z"/>
                </svg>
              </button>
              <p className="text-[15px] text-gray-400">
                {t('common.copyright')}
              </p>
            </div>
            <p className="text-[10px] text-gray-400 text-center mx-auto" style={{ maxWidth: '80%', marginTop: '20px' }}>
              {t('common.recaptchaProtection')}{' '}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500">{t('common.privacyPolicy')}</a> {t('common.and')}{' '}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500">{t('common.termsOfService')}</a> {t('common.apply')}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
