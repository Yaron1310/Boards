import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as apiService from '../../services/geminiService';
import { FiHexagon, FiCheckCircle, FiLoader, FiAlertCircle, FiCheck, FiX, FiCreditCard } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const OrganizationSetupWizard: React.FC = () => {
  const { i18n } = useTranslation();
  const t = i18n.getFixedT('en');
  const [step, setStep] = useState(1);
  const [organizationName, setOrganizationName] = useState('');

  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameAvailable, setNameAvailable] = useState(false);

  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const { finalizeLoginSession } = useAuth();
  const navigate = useNavigate();

  // Debounced name check
  const checkName = useCallback(async (name: string) => {
    if (name.length < 3) {
      setNameError(t('auth.organizationNameTooShort'));
      setNameAvailable(false);
      setIsCheckingName(false);
      return;
    }
    try {
      const { isUnique } = await apiService.checkOrganizationNameUniqueness(name);
      if (isUnique) {
        setNameError(null);
        setNameAvailable(true);
      } else {
        setNameError(t('auth.organizationNameTaken'));
        setNameAvailable(false);
      }
    } catch (err: any) {
      setNameError(err.message || t('auth.errorCheckingName'));
      setNameAvailable(false);
    } finally {
      setIsCheckingName(false);
    }
  }, [t]);

  useEffect(() => {
    if (!organizationName) {
        setIsCheckingName(false);
        setNameError(null);
        setNameAvailable(false);
        return;
    }

    setIsCheckingName(true);
    const handler = setTimeout(() => {
        checkName(organizationName);
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [organizationName, checkName]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAvailable) return;

    setIsActivating(true);
    setActivationError(null);
    try {
      await apiService.setupOrganization(organizationName);
      setStep(2);
    } catch (err: any) {
      setActivationError(err.message || t('auth.failedToCreateOrganization'));
    } finally {
      setIsActivating(false);
    }
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, you would handle payment tokenization here.
    // For this demo, we just proceed to activation.
    setStep(3);
  };

  const handleActivate = async () => {
    setIsActivating(true);
    setActivationError(null);
    try {
        const loginResponse = await apiService.activateOrganizationSubscription();
        finalizeLoginSession(loginResponse);
        // The App.tsx router will now render the main app.
        navigate('/admin');
    } catch (err: any) {
        setActivationError(err.message || t('auth.activationError'));
        setIsActivating(false);
    }
  };

  const renderNameStatus = () => {
    if (isCheckingName) {
        return <FiLoader className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 animate-spin" />;
    }
    if (nameError) {
        return <FiX className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-red-500" />;
    }
    if (nameAvailable) {
        return <FiCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />;
    }
    return null;
  };

  const logoUrl = '/logo_gym.webp';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-8">
            <img src={logoUrl} alt={t('common.appLogoAlt')} className="h-16 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800">{t('auth.organizationSetup')}</h1>
            <p className="text-gray-500">{t('auth.organizationSetupSubtitle')}</p>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-center space-x-2 mb-8">
            <div className={`flex items-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${step >= 1 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>1</div><span className="ml-2 font-medium">{t('auth.stepDetails')}</span>
            </div>
            <div className={`flex-1 h-0.5 ${step > 1 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`flex items-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${step >= 2 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>2</div><span className="ml-2 font-medium">{t('auth.stepPayment')}</span>
            </div>
            <div className={`flex-1 h-0.5 ${step > 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`flex items-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold ${step >= 3 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>3</div><span className="ml-2 font-medium">{t('auth.stepActivate')}</span>
            </div>
          </div>

          {activationError && (
              <div className="p-3 my-4 bg-red-100 text-red-700 rounded-lg flex items-center text-sm"><FiAlertCircle className="mr-2"/> {activationError}</div>
          )}

          {/* Step Content */}
          {step === 1 && (
            <form onSubmit={handleNameSubmit} className="space-y-6 animate-fade-in-up">
              <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
              <div>
                <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 mb-1">{t('auth.organizationNameLabel')} <span aria-hidden="true">*</span></label>
                <div className="relative">
                    <input id="organizationName" type="text" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className={`w-full p-3 pr-10 border rounded-lg shadow-sm focus:outline-none focus:ring-2 ${nameError ? 'border-red-500 ring-red-300' : nameAvailable ? 'border-green-500 ring-green-300' : 'border-gray-300 focus:ring-blue-500'}`} placeholder="e.g., Stark Industries Training" required aria-required="true" autoFocus />
                    {renderNameStatus()}
                </div>
                {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
                {!nameError && nameAvailable && <p className="text-xs text-green-600 mt-1">{t('auth.greatName')}</p>}
              </div>
              <button type="submit" disabled={!nameAvailable || isCheckingName || isActivating} className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {isActivating ? <FiLoader className="animate-spin h-5 w-5 mx-auto"/> : t('common.continue')}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handlePaymentSubmit} className="space-y-6 animate-fade-in-up">
              <p className="text-xs text-gray-500">{t('common.mandatoryFields')}</p>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                <h3 className="font-semibold text-gray-800 mb-2">Plan: Pay As You Go</h3>
                <p>Add a payment method to activate your workspace. You will only be billed for what you use. There are no upfront subscription costs.</p>
              </div>
              <div>
                <label htmlFor="cardName" className="block text-sm font-medium text-gray-700">{t('auth.cardholderName')} <span aria-hidden="true">*</span></label>
                <input id="cardName" type="text" className="mt-1 w-full p-3 border border-gray-300 rounded-lg" placeholder={t('common.fullNamePlaceholder')} required aria-required="true"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('auth.cardDetails')}</label>
                <div className="mt-1 p-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 italic">
                    Demo Payment Form - No real card needed.
                </div>
              </div>
               <div className="flex justify-between items-center pt-4">
                 <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">{t('common.back')}</button>
                 <button type="submit" className="bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                    {t('auth.addPaymentMethod')}
                 </button>
               </div>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fade-in-up text-center">
              <FiCheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-semibold text-gray-800">{t('auth.finalStepActivate')}</h2>
              <p className="text-gray-600">{t('auth.finalStepSubtitle')}</p>
              <button onClick={handleActivate} disabled={isActivating} className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-lg shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                {isActivating ? <FiLoader className="animate-spin h-5 w-5 mx-auto" /> : t('auth.activateMyOrganization')}
              </button>
              <button onClick={() => setStep(2)} disabled={isActivating} className="text-sm text-gray-500 hover:text-gray-700">{t('common.back')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrganizationSetupWizard;
