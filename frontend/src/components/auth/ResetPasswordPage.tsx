
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as apiService from '../../services/geminiService';
import { FiKey, FiEye, FiEyeOff, FiAlertCircle, FiLoader, FiLogIn } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useForceDocumentLang } from '../../hooks/useForceDocumentLang';

const ResetPasswordPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  useForceDocumentLang();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Enable scrolling on this page
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    return () => {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    };
  }, []);

  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      navigate('/login?error_message=Invalid or missing password reset link.');
    } else {
      setToken(t);
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    setLocalError(null);
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword !== confirmPassword) {
      setLocalError(t('auth.passwordsDoNotMatch'));
      return;
    }

    const isPasswordValid = newPassword.length >= 8 && /^[!-~]+$/.test(newPassword) && /\d/.test(newPassword) && /[!@#$%^&*]/.test(newPassword);
    if (!isPasswordValid) {
        setLocalError(t('auth.passwordRequirements'));
        return;
    }

    if (token) {
      setLoading(true);
      try {
        await apiService.resetPassword(token, newPassword);
        navigate('/login?password_reset=true');
      } catch (err: any) {
        setLocalError(err.message || t('auth.genericError'));
      } finally {
        setLoading(false);
      }
    }
  };

  const logoUrl = '/logo_gym.webp';

  return (
    <div className="min-h-screen flex justify-center bg-gradient-to-br from-blue-500 to-indigo-600 px-4 py-12">
      <div className="bg-white p-8 sm:p-12 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt={t('common.appLogoAlt')} className="mx-auto h-20 w-auto" />
          <p className="text-gray-600">{t('auth.createNewPassword')}</p>
        </div>

        {localError && (
          <div id="reset-form-error" role="alert" className="mb-6 text-sm text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 flex items-center shadow">
            <FiAlertCircle className="mr-3 h-5 w-5 flex-shrink-0" />
            <span className="font-medium">{localError}</span>
          </div>
        )}

        {token ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
            <div>
              <label htmlFor="new_password_reset" className="block text-sm font-medium text-gray-700">{t('auth.newPassword')} <span aria-hidden="true">*</span></label>
              <div className="mt-1 relative">
                <input
                  id="new_password_reset"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-describedby={localError ? "reset-form-error" : undefined}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500" aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}>
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">{t('auth.passwordHint')}</p>
            </div>
            <div>
              <label htmlFor="confirm_password_reset" className="block text-sm font-medium text-gray-700">{t('auth.confirmNewPassword')} <span aria-hidden="true">*</span></label>
              <div className="mt-1 relative">
                <input
                  id="confirm_password_reset"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  aria-required="true"
                  aria-describedby={localError ? "reset-form-error" : undefined}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500" aria-label={showConfirmPassword ? t('common.hideConfirmPassword') : t('common.showConfirmPassword')}>
                  {showConfirmPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70"
              >
                {loading ? <FiLoader className="animate-spin mr-2" /> : <FiKey className="mr-2" />}
                {loading ? t('auth.resetting') : t('auth.resetPassword')}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center">
            <FiLoader className="animate-spin h-8 w-8 text-blue-500 mx-auto" />
            <p className="mt-2 text-gray-600">{t('common.loading')}</p>
          </div>
        )}
         <p className="mt-8 text-center text-sm text-gray-600">
          {t('auth.rememberPassword')}{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
             <FiLogIn className="inline mr-1 h-4 w-4" /> {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
