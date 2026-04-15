
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types';
import { FiCheck, FiAlertCircle, FiLogIn, FiLoader, FiBriefcase, FiShield, FiUser, FiGlobe } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const SelectContextPage: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  const {
    completeLoginWithContext,
    switchContext,
    contextSelectionMode,
    availableContexts,
    cancelContextSelection,
    loading,
    authError,
    clearAuthError,
    user,
    userForContextSelection
  } = useAuth();

  const [selectedValue, setSelectedValue] = useState<string>('');

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
    // Pre-select the first available option
    if (availableContexts.length > 0 && availableContexts[0].contexts.length > 0) {
      setSelectedValue(availableContexts[0].contexts[0].value);
    }
  }, [availableContexts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAuthError();
    if (!selectedValue) return;

    try {
        const { organizationId, role } = JSON.parse(selectedValue);
        if (contextSelectionMode === 'login') {
            await completeLoginWithContext(organizationId, role);
        } else if (contextSelectionMode === 'switch') {
            await switchContext(organizationId, role);
        }
    } catch (error) {
        console.error("Failed to complete login with context:", error);
    }
  };

  const logoUrl = '/logo_gym.webp';

  const userForDisplay = user || userForContextSelection;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 p-4">
      <div className="bg-white p-8 sm:p-12 rounded-xl shadow-2xl w-full max-w-lg">
        <div className="text-center mb-8">
          <img src={logoUrl} alt={t('common.appLogoAlt')} className="mx-auto h-16 w-auto rounded-full" />
          <p className="text-gray-600 mt-2 text-xl">{t('auth.welcomeUser', { name: userForDisplay?.name || t('auth.userFallback') })}</p>
          <p className="text-gray-500 mt-1">{t('auth.selectRoleToContinue')}</p>
        </div>

        {authError && (
          <div className="mb-6 text-sm text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 flex items-center shadow">
            <FiAlertCircle className="mr-3 h-5 w-5 flex-shrink-0"/>
            <span className="font-medium">{authError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="max-h-60 overflow-y-auto custom-scrollbar pr-2 -mr-2">
            {availableContexts.map(({ groupName, contexts }) => (
                <div key={groupName} className="mb-4">
                    <h2 className="text-sm font-semibold text-gray-500 mb-2 flex items-center">
                        {groupName === 'System Administration' ? <FiGlobe className="mr-2"/> : <FiShield className="mr-2"/>}
                        {groupName}
                    </h2>
                    <div className="space-y-2">
                        {contexts.map(ctx => {
                            const Icon = ctx.role === 'system_admin' ? FiShield : ctx.role === 'academy_admin' ? FiShield : ctx.role === 'organization_admin' ? FiBriefcase : FiUser;
                            return (
                                <label key={ctx.value} className="flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all border-gray-300 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50 has-[:checked]:shadow-md">
                                    <Icon className="mr-3 text-gray-500" />
                                    <span className="flex-grow text-gray-800 font-medium">{ctx.label}</span>
                                    <input
                                        type="radio"
                                        name="context-selection"
                                        value={ctx.value}
                                        checked={selectedValue === ctx.value}
                                        onChange={(e) => setSelectedValue(e.target.value)}
                                        className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-400"
                                    />
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !selectedValue}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition duration-150 disabled:opacity-70"
            >
              {loading ? (
                <FiLoader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              ) : <FiCheck className="mr-2 h-5 w-5" /> }
              {loading ? t('auth.signingIn') : t('common.continue')}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-gray-600">
          <button onClick={cancelContextSelection} className="font-medium text-purple-600 hover:text-purple-500">
             <FiLogIn className="inline mr-1 h-4 w-4" /> {contextSelectionMode === 'login' ? t('auth.goBackToLogin') : t('auth.cancelSwitch')}
          </button>
        </p>
      </div>
    </div>
  );
};

export default SelectContextPage;
