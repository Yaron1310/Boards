
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { BACKEND_API_URL } from '../../constants';
import { useRecaptcha } from '../../hooks/useRecaptcha';
import { FiMail, FiLogIn, FiEye, FiEyeOff, FiAlertCircle, FiCheckCircle, FiLoader } from 'react-icons/fi';
import LegalModal from '../legal/LegalModal';
import AccessibilityModal from '../legal/AccessibilityModal';
import { GoogleIconSVG } from './GoogleAuthIcons';
import { Buffer } from 'buffer';
import { useTranslation } from 'react-i18next';
import { useForceDocumentLang } from '../../hooks/useForceDocumentLang';

const RegistrationPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  useForceDocumentLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (localError) {
      const timer = setTimeout(() => {
        setLocalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [localError]);
  
  const [registrationState, setRegistrationState] = useState<'form' | 'pending' | 'error'>('form');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  
  const { register, loading: authLoading, authError, clearAuthError, user } = useAuth();
  const { executeRecaptcha } = useRecaptcha();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
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
    if (user) {
      if (flow === 'checkout' && planId) {
        navigate(`/checkout?planId=${planId}`);
      } else {
        navigate('/chat');
      }
    }
  }, [user, navigate, flow, planId]);

  useEffect(() => {
    const emailFromQuery = searchParams.get('email');
    if (emailFromQuery) {
        setEmail(emailFromQuery.toLowerCase());
    }
    if (searchParams.get('account_verified')) {
        setRegistrationState('form');
        setPendingMessage(null);
    }
    // Clean up URL to avoid confusion on refresh, but keep planId and flow if present
    const paramsToClean = ['account_verified', 'email'];
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
    if (localError || authError) {
        setLocalError(null);
        clearAuthError();
    }
  }, [name, email, password, confirmPassword, agreedToTerms, clearAuthError]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!agreedToTerms) {
        setLocalError(t('auth.mustAgreeToTerms'));
        return;
    }

    if (password !== confirmPassword) {
      setLocalError(t('auth.passwordsDoNotMatch'));
      return;
    }
    if (!name.trim() || !email.trim() || !password) {
        setLocalError(t('auth.allFieldsRequired'));
        return;
    }

    const isPasswordValid = password.length >= 8 && /^[!-~]+$/.test(password) && /\d/.test(password) && /[!@#$%^&*]/.test(password);
    if (!isPasswordValid) {
        setLocalError(t('auth.passwordRequirements'));
        return;
    }

    // If user is manually registering during checkout flow, save intent
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
    }

    // --- Standard Registration Flow (Handles both WorkHub Pre-approved and Checkout Payment Flow) ---
    // If planId is present (checkout flow), backend register will skip pre-approval.
    // If planId is missing, backend register will enforce pre-approval.
    const recaptchaToken = await executeRecaptcha('register');
    const result = await register({ name, email, password, planId: planId || undefined }, recaptchaToken);

    if (result.success) {
      if (result.message.includes("Password created")) {
        navigate(`/login?password_created=true&message=${encodeURIComponent(result.message)}`);
      } else {
        setPendingMessage(result.message);
        setRegistrationState('pending');
      }
    } else {
      setLocalError(result.message);
      setRegistrationState('error');
    }
  };
  
  const handleGoogleLogin = () => {
    if (!agreedToTerms) {
      setLocalError(t('auth.mustAgreeToTermsSignUp'));
      return;
    }
    
    // Save checkout intent if present
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
        
        // Construct state parameter to pass through OAuth
        const stateObj = { planId, flow: 'checkout' };
        // Use Buffer if available (polyfill) or btoa
        const stateStr = window.btoa(JSON.stringify(stateObj));
        window.location.href = `${BACKEND_API_URL}/api/auth/google?state=${stateStr}`;
    } else {
        window.location.href = `${BACKEND_API_URL}/api/auth/google`;
    }
  };

  const handleMicrosoftLogin = () => {
    if (!agreedToTerms) {
      setLocalError(t('auth.mustAgreeToTermsSignUp'));
      return;
    }

    // Save checkout intent if present
    if (flow === 'checkout' && planId) {
        localStorage.setItem('pending_checkout_plan_id', planId);
    }

    window.location.href = `${BACKEND_API_URL}/api/auth/microsoft`;
  };
  
  const displayError = localError || authError;
  const logoUrl = '/logo_gym.webp';

  // Construct login URL preserving checkout intent
  let loginUrl = '/login';
  if (flow === 'checkout' && planId) {
      loginUrl += `?flow=checkout&planId=${planId}`;
  }

  if (registrationState === 'pending') {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-cyan-500 p-4">
            <div className="bg-white p-8 sm:p-12 rounded-xl shadow-2xl w-full max-w-lg text-center">
                 <FiMail className="mx-auto h-16 w-16 text-green-500 mb-4"/>
                 <h1 className="text-2xl font-bold text-gray-800">{t('auth.pleaseVerifyEmail')}</h1>
                 <p className="text-gray-600 mt-2">{pendingMessage || t('auth.emailSentTo', { email })}</p>
                 <Link to={loginUrl} className="mt-8 inline-flex items-center justify-center px-6 py-2 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700">
                    {t('auth.backToLogin')}
                </Link>
            </div>
        </div>
    );
  }


  return (
    <div className="auth-page-no-contrast min-h-screen flex justify-center items-center bg-gradient-to-br from-green-400 to-cyan-500 px-4 py-8">
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
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">{t('auth.createAccount')}</h2>
          <p className="text-gray-600 text-center mb-6">{t('auth.joinToday')}</p>
          
          {displayError && (
            <div id="reg-form-error" role="alert" className="mb-6 text-sm text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 flex items-center shadow">
              <FiAlertCircle className="mr-3 h-5 w-5 flex-shrink-0"/>
              <span className="font-medium">{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
            <div>
              <label htmlFor="name_reg" className="block text-sm font-medium text-gray-700">{t('common.fullName')} <span aria-hidden="true">*</span></label>
              <input id="name_reg" type="text" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" aria-describedby={displayError ? "reg-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm" placeholder={t('common.fullNamePlaceholder')}/>
            </div>
            <div>
              <label htmlFor="email_reg" className="block text-sm font-medium text-gray-700">{t('common.emailAddress')} <span aria-hidden="true">*</span></label>
              <input id="email_reg" type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} required aria-required="true" aria-describedby={displayError ? "reg-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm" placeholder={t('common.emailPlaceholder')}/>
            </div>

            <div>
              <label htmlFor="password_reg_page" className="block text-sm font-medium text-gray-700">{t('common.password')} <span aria-hidden="true">*</span></label>
               <div className="mt-1 relative">
                  <input id="password_reg_page" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required aria-required="true" aria-describedby={displayError ? "reg-form-error" : undefined} className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm" placeholder="••••••••"/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700" aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}>
                      {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                  </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">{t('auth.passwordHint')}</p>
            </div>
            <div>
              <label htmlFor="confirmPassword_reg" className="block text-sm font-medium text-gray-700">{t('common.confirmPassword')} <span aria-hidden="true">*</span></label>
              <div className="mt-1 relative">
                  <input id="confirmPassword_reg" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required aria-required="true" aria-describedby={displayError ? "reg-form-error" : undefined} className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm" placeholder="••••••••"/>
                   <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5 text-gray-500 hover:text-gray-700" aria-label={showConfirmPassword ? t('common.hideConfirmPassword') : t('common.showConfirmPassword')}>
                      {showConfirmPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                  </button>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer"
                  required
                />
              </div>
              <div className="ml-2 text-sm">
                <label htmlFor="terms" className="font-medium text-gray-700">
                  {t('auth.iAgreeTo')} <button type="button" onClick={() => setShowLegalModal(true)} className="text-green-600 hover:underline bg-transparent border-none p-0 cursor-pointer font-medium">{t('auth.termsAndPrivacy')}</button>
                </label>
              </div>
            </div>

            <div>
              <button type="submit" disabled={authLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition duration-150 disabled:opacity-70">
                {authLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : <FiMail className="mr-2 h-5 w-5" /> }
                {authLoading ? t('auth.registering') : (planId ? t('auth.signUpAndVerify') : t('auth.register'))}
              </button>
            </div>
          </form>
          
           <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">{t('auth.orRegisterWith')}</span>
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
                {t('auth.signUpWithGoogle')}
              </button>
              <button
                onClick={handleMicrosoftLogin}
                type="button"
                disabled={authLoading}
                className="w-full inline-flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 disabled:opacity-70"
              >
                <img src="/ms-symbollockup_mssymbol_19.svg" alt="Microsoft" className="h-5 w-5 mr-2" />
                {t('auth.signUpWithMicrosoft')}
              </button>
            </div>
          </div>
          
          <p className="mt-8 text-center text-sm text-gray-600">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to={loginUrl} className="font-medium text-green-600 hover:text-green-500">
               <FiLogIn className="inline mr-1 h-4 w-4" /> {t('auth.signIn')}
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
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-500">{t('common.termsOfService')}</a> {t('common.apply')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationPage;
