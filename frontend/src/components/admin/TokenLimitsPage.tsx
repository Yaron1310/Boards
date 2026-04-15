
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import type { SystemSettings } from '../../types';
import { FiCpu, FiSave, FiLoader, FiAlertCircle, FiCheckCircle, FiDollarSign, FiZap } from 'react-icons/fi';

const TokenLimitsPage: React.FC = () => {
    const { t } = useTranslation();
    const {
        systemSettings,
        fetchSystemSettings,
        updateSystemSettings,
        isLoading: dataIsLoading,
        dataError,
        clearDataError
    } = useData();
    
    const [formData, setFormData] = useState<SystemSettings>({
        oneTimeTokensPerLesson: 0,
        oneTimeGeneralTokens: 0,
        subscriptionMonthlyLimit: 0,
        geminiProModelName: '',
        geminiFlashModelName: '',
        costPer1000TokensPro: 0,
        rawCostPer1000TokensPro: 0,
        profitMarginPer1000TokensPro: 0,
        costPer1000TokensFlash: 0,
        rawCostPer1000TokensFlash: 0,
        profitMarginPer1000TokensFlash: 0,
        globalSystemPrompt: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
      if (feedback) {
        const timer = setTimeout(() => {
          setFeedback(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [feedback]);

    // New state for cost breakdown
    const [rawCostPro, setRawCostPro] = useState<number | string>('');
    const [profitMarginPro, setProfitMarginPro] = useState<number | string>('');
    const [rawCostFlash, setRawCostFlash] = useState<number | string>('');
    const [profitMarginFlash, setProfitMarginFlash] = useState<number | string>('');

    useEffect(() => {
        fetchSystemSettings();
    }, [fetchSystemSettings]);

    useEffect(() => {
        if (systemSettings) {
            setFormData(systemSettings);
            // On initial load, populate the breakdown inputs from the settings
            setRawCostPro(systemSettings.rawCostPer1000TokensPro ?? '');
            setProfitMarginPro(systemSettings.profitMarginPer1000TokensPro ?? '');
            setRawCostFlash(systemSettings.rawCostPer1000TokensFlash ?? '');
            setProfitMarginFlash(systemSettings.profitMarginPer1000TokensFlash ?? '');
        }
    }, [systemSettings]);

    useEffect(() => {
        if (dataError) {
            setFeedback({ type: 'error', text: dataError });
            clearDataError();
        }
    }, [dataError, clearDataError]);

    // Recalculate total cost for Pro model when breakdown changes
    useEffect(() => {
        if (rawCostPro !== '' || profitMarginPro !== '') {
            const raw = parseFloat(String(rawCostPro)) || 0;
            const profit = parseFloat(String(profitMarginPro)) || 0;
            setFormData(prev => ({ 
                ...prev, 
                costPer1000TokensPro: raw + profit,
                rawCostPer1000TokensPro: raw,
                profitMarginPer1000TokensPro: profit,
            }));
        }
    }, [rawCostPro, profitMarginPro]);

    // Recalculate total cost for Flash model when breakdown changes
    useEffect(() => {
        if (rawCostFlash !== '' || profitMarginFlash !== '') {
            const raw = parseFloat(String(rawCostFlash)) || 0;
            const profit = parseFloat(String(profitMarginFlash)) || 0;
            setFormData(prev => ({ 
                ...prev, 
                costPer1000TokensFlash: raw + profit,
                rawCostPer1000TokensFlash: raw,
                profitMarginPer1000TokensFlash: profit,
            }));
        }
    }, [rawCostFlash, profitMarginFlash]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'geminiProModelName' || name === 'geminiFlashModelName' || name === 'globalSystemPrompt') {
            setFormData(prev => ({ ...prev, [name]: value }));
        } else {
            const numValue = parseInt(value.replace(/,/g, ''), 10) || 0;
            setFormData(prev => ({ ...prev, [name]: numValue }));
        }
    };

    const formatNumber = (num: number | undefined) => {
        if (num === undefined) return '';
        return num.toLocaleString('en-US');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        setIsLoading(true);
        const success = await updateSystemSettings(formData);
        if (success) {
            setFeedback({ type: 'success', text: t('admin.tokenLimits.settingsUpdatedSuccess') });
        }
        setIsLoading(false);
    };

    const pageIsLoading = dataIsLoading && !systemSettings;
    
    const proRaw = parseFloat(String(rawCostPro)) || 0;
    const proProfit = parseFloat(String(profitMarginPro)) || 0;
    const proMarkup = proRaw > 0 ? ((proProfit / proRaw) * 100).toFixed(0) : 0;

    const flashRaw = parseFloat(String(rawCostFlash)) || 0;
    const flashProfit = parseFloat(String(profitMarginFlash)) || 0;
    const flashMarkup = flashRaw > 0 ? ((flashProfit / flashRaw) * 100).toFixed(0) : 0;

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                    <FiCpu className="mr-3 text-green-500"/> {t('admin.tokenLimits.title')}
                </h1>

                {feedback && (
                    <div className={`p-3 mb-6 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                        {feedback.text}
                        <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label={t('admin.tokenLimits.dismissFeedback')}>&times;</button>
                    </div>
                )}

                <div className="bg-white p-6 rounded-lg shadow-lg">
                    {pageIsLoading ? (
                        <div className="flex justify-center items-center p-10">
                            <FiLoader className="animate-spin h-8 w-8 text-blue-500" />
                            <p className="ml-3 text-gray-600">{t('admin.tokenLimits.loadingSettings')}</p>
                        </div>
                    ) : (
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <p className="text-xs text-gray-500">{t('admin.tokenLimits.mandatoryFieldsNote')}</p>
                        {/* Global System Prompt */}
                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><FiZap className="mr-2 text-yellow-500" /> {t('admin.tokenLimits.globalAiMentorPrompt')}</h2>
                            <p className="text-xs text-gray-500 mb-2">{t('admin.tokenLimits.globalAiMentorPromptDescription')}</p>
                            <div>
                                <label htmlFor="globalSystemPrompt" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.globalSystemPromptLabel')}</label>
                                <textarea
                                    id="globalSystemPrompt"
                                    name="globalSystemPrompt"
                                    value={formData.globalSystemPrompt || ''}
                                    onChange={handleInputChange}
                                    rows={6}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-xs"
                                    placeholder={t('admin.tokenLimits.globalSystemPromptPlaceholder')}
                                />
                            </div>
                        </div>

                        {/* Model Configuration */}
                         <div className="p-4 border border-gray-200 rounded-lg">
                            <h2 className="text-xl font-semibold text-gray-700 mb-4">{t('admin.tokenLimits.modelConfiguration')}</h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="geminiProModelName" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.proModelName')}</label>
                                    <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.proModelNameDescription')}</p>
                                    <input
                                        type="text"
                                        id="geminiProModelName"
                                        name="geminiProModelName"
                                        value={formData.geminiProModelName || ''}
                                        onChange={handleInputChange}
                                        className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                        placeholder={t('admin.tokenLimits.proModelNamePlaceholder')}
                                        required
                                        aria-required="true"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="geminiFlashModelName" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.flashModelName')}</label>
                                    <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.flashModelNameDescription')}</p>
                                    <input
                                        type="text"
                                        id="geminiFlashModelName"
                                        name="geminiFlashModelName"
                                        value={formData.geminiFlashModelName || ''}
                                        onChange={handleInputChange}
                                        className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                        placeholder={t('admin.tokenLimits.flashModelNamePlaceholder')}
                                        required
                                        aria-required="true"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Billing Section */}
                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center"><FiDollarSign className="mr-2"/> {t('admin.tokenLimits.billingCostEstimation')}</h2>
                             <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.proModelCostLabel')}</label>
                                    <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.costBreakdownDescription')}</p>
                                    <div className="flex flex-wrap items-center space-x-4 mt-2">
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.rawCost')}</label>
                                            <div className="pointer-events-none absolute inset-y-0 left-0 top-5 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                            <input type="number" step="0.0001" min="0" value={rawCostPro} onChange={e => setRawCostPro(e.target.value)} className="pl-7 block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g. 0.003"/>
                                        </div>
                                        <span className="text-2xl font-thin text-gray-400 mt-5">+</span>
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.profitMargin')}</label>
                                            <div className="pointer-events-none absolute inset-y-0 left-0 top-5 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                            <input type="number" step="0.0001" min="0" value={profitMarginPro} onChange={e => setProfitMarginPro(e.target.value)} className="pl-7 block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g. 0.006"/>
                                        </div>
                                        <span className="text-2xl font-thin text-gray-400 mt-5">=</span>
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.totalAcademyCost')}</label>
                                            <div className="mt-1 p-3 border border-gray-200 rounded-md bg-gray-50 font-semibold text-gray-800 w-48 text-center">
                                                ${(formData.costPer1000TokensPro || 0).toFixed(4)}
                                                <div className="text-xs font-normal text-green-600">
                                                    ({ proMarkup }% {t('admin.tokenLimits.profitMarkup')})
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {(rawCostPro === '' && profitMarginPro === '') && formData.costPer1000TokensPro > 0 &&
                                        <p className="text-xs text-blue-600 mt-1">{t('admin.tokenLimits.currentlySavedCost', { cost: formData.costPer1000TokensPro })}</p>
                                    }
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.flashModelCostLabel')}</label>
                                    <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.costBreakdownDescription')}</p>
                                    <div className="flex flex-wrap items-center space-x-4 mt-2">
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.rawCost')}</label>
                                            <div className="pointer-events-none absolute inset-y-0 left-0 top-5 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                            <input type="number" step="0.0001" min="0" value={rawCostFlash} onChange={e => setRawCostFlash(e.target.value)} className="pl-7 block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g. 0.001"/>
                                        </div>
                                        <span className="text-2xl font-thin text-gray-400 mt-5">+</span>
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.profitMargin')}</label>
                                            <div className="pointer-events-none absolute inset-y-0 left-0 top-5 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                                            <input type="number" step="0.0001" min="0" value={profitMarginFlash} onChange={e => setProfitMarginFlash(e.target.value)} className="pl-7 block w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="e.g. 0.002"/>
                                        </div>
                                        <span className="text-2xl font-thin text-gray-400 mt-5">=</span>
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500">{t('admin.tokenLimits.totalAcademyCost')}</label>
                                            <div className="mt-1 p-3 border border-gray-200 rounded-md bg-gray-50 font-semibold text-gray-800 w-48 text-center">
                                                ${(formData.costPer1000TokensFlash || 0).toFixed(4)}
                                                <div className="text-xs font-normal text-green-600">
                                                    ({ flashMarkup }% {t('admin.tokenLimits.profitMarkup')})
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {(rawCostFlash === '' && profitMarginFlash === '') && formData.costPer1000TokensFlash > 0 &&
                                        <p className="text-xs text-blue-600 mt-1">{t('admin.tokenLimits.currentlySavedCost', { cost: formData.costPer1000TokensFlash })}</p>
                                    }
                                </div>
                             </div>
                        </div>

                        {/* One-Time Access Section */}
                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h2 className="text-xl font-semibold text-gray-700 mb-4">{t('admin.tokenLimits.oneTimeAccessPlans')}</h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="oneTimeTokensPerLesson" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.tokensPerLesson')}</label>
                                    <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.tokensPerLessonDescription')}</p>
                                    <input
                                        type="text"
                                        id="oneTimeTokensPerLesson"
                                        name="oneTimeTokensPerLesson"
                                        value={formatNumber(formData.oneTimeTokensPerLesson)}
                                        onChange={handleInputChange}
                                        className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="oneTimeGeneralTokens" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.generalAiMentorTokens')}</label>
                                     <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.generalAiMentorTokensDescription')}</p>
                                    <input
                                        type="text"
                                        id="oneTimeGeneralTokens"
                                        name="oneTimeGeneralTokens"
                                        value={formatNumber(formData.oneTimeGeneralTokens)}
                                        onChange={handleInputChange}
                                        className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Subscription Section */}
                        <div className="p-4 border border-gray-200 rounded-lg">
                            <h2 className="text-xl font-semibold text-gray-700 mb-4">{t('admin.tokenLimits.subscriptionPlans')}</h2>
                            <div>
                                <label htmlFor="subscriptionMonthlyLimit" className="block text-sm font-medium text-gray-700">{t('admin.tokenLimits.monthlyTokenLimitPerUser')}</label>
                                <p className="text-xs text-gray-500 mb-1">{t('admin.tokenLimits.monthlyTokenLimitDescription')}</p>
                                <input
                                    type="text"
                                    id="subscriptionMonthlyLimit"
                                    name="subscriptionMonthlyLimit"
                                    value={formatNumber(formData.subscriptionMonthlyLimit)}
                                    onChange={handleInputChange}
                                    className="mt-1 block w-full sm:w-1/2 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                                />
                            </div>
                        </div>

                        <div className="pt-5">
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={isLoading || dataIsLoading}
                                    className="w-full sm:w-auto flex justify-center py-2 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>}
                                    {isLoading ? t('admin.tokenLimits.saving') : t('admin.tokenLimits.saveAllSettings')}
                                </button>
                            </div>
                        </div>
                    </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TokenLimitsPage;
