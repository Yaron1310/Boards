import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import * as apiService from '../../services/geminiService';
import type { Plan } from '../../types';
import { FiAlertTriangle, FiCreditCard, FiCheck, FiLoader, FiX } from 'react-icons/fi';
import { CURRENCIES } from '../admin/course/billing/Shared';

interface SelfSubscribeModalProps {
    plan: Plan;
    onClose: () => void;
    onSuccess: () => void;
}

const SelfSubscribeModal: React.FC<SelfSubscribeModalProps> = ({ plan, onClose, onSuccess }) => {
    const { t } = useTranslation();
    const [form, setForm] = useState({ company: '', address: '', city: '', zip: '', country: '' });
    const [iframeUrl, setIframeUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const result = await apiService.selfSubscribe({ planId: plan.id, ...form });
            setIframeUrl(result.iframeUrl);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to initiate payment.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'payment-success' || event.data === 'payment-success') {
                onSuccess();
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onSuccess]);

    const currencySymbol = CURRENCIES.find(c => c.code === plan.currency)?.symbol || plan.currency || '$';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{t('subscription.subscribeTo', { name: plan.name })}</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" aria-label="Close subscription modal">
                        <FiX size={20} />
                    </button>
                </div>

                <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
                    {iframeUrl ? (
                        <iframe
                            src={iframeUrl}
                            title="Payment"
                            className="w-full h-[400px] border rounded"
                            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
                        />
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                                {t('subscription.planLabel')}: <strong>{plan.name}</strong> — {currencySymbol}{plan.priceMonthly?.toFixed(2)}{t('subscription.perMonth')}
                            </p>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700" role="alert">{error}</div>
                            )}

                            <div>
                                <label htmlFor="self-sub-company" className="block text-sm font-medium text-gray-700 mb-1">{t('subscription.companyFullName')}</label>
                                <input id="self-sub-company" type="text" required value={form.company}
                                    onChange={e => setForm(prev => ({ ...prev, company: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                    aria-required="true" />
                            </div>
                            <div>
                                <label htmlFor="self-sub-address" className="block text-sm font-medium text-gray-700 mb-1">{t('subscription.address')}</label>
                                <input id="self-sub-address" type="text" required value={form.address}
                                    onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                    aria-required="true" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="self-sub-city" className="block text-sm font-medium text-gray-700 mb-1">{t('subscription.city')}</label>
                                    <input id="self-sub-city" type="text" required value={form.city}
                                        onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        aria-required="true" />
                                </div>
                                <div>
                                    <label htmlFor="self-sub-zip" className="block text-sm font-medium text-gray-700 mb-1">{t('subscription.zipCode')}</label>
                                    <input id="self-sub-zip" type="text" required value={form.zip}
                                        onChange={e => setForm(prev => ({ ...prev, zip: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        aria-required="true" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="self-sub-country" className="block text-sm font-medium text-gray-700 mb-1">{t('subscription.country')}</label>
                                <input id="self-sub-country" type="text" required value={form.country}
                                    onChange={e => setForm(prev => ({ ...prev, country: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                    aria-required="true" />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                                aria-label={t('subscription.subscribeTo', { name: plan.name })}
                            >
                                {isLoading ? <FiLoader className="animate-spin mr-2" /> : <FiCreditCard className="mr-2" />}
                                {isLoading ? t('common.processing') : t('subscription.proceedToPayment')}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};


const SubscriptionRequiredBanner: React.FC = () => {
    const { t } = useTranslation();
    const { selectedOrganization, isOrgSubscriptionActive } = useAuth();
    const [singleUserPlans, setSingleUserPlans] = useState<Plan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (!isOrgSubscriptionActive && selectedOrganization?.academyId) {
            setIsLoadingPlans(true);
            apiService.getPublicSingleUserPlans(selectedOrganization.academyId)
                .then(plans => setSingleUserPlans(plans))
                .catch(() => setSingleUserPlans([]))
                .finally(() => setIsLoadingPlans(false));
        } else {
            setIsLoadingPlans(false);
        }
    }, [isOrgSubscriptionActive, selectedOrganization?.academyId]);

    if (isOrgSubscriptionActive) return null;

    const handleSubscriptionSuccess = () => {
        setSelectedPlan(null);
        setShowSuccess(true);
        // Reload the page to refresh auth context with new org
        setTimeout(() => window.location.reload(), 2000);
    };

    return (
        <>
            <div className="mb-6 p-5 bg-amber-50 border border-amber-300 rounded-lg shadow-sm" role="alert" aria-live="polite">
                <div className="flex items-start gap-3">
                    <FiAlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={22} />
                    <div className="flex-grow">
                        <h3 className="text-lg font-semibold text-amber-800">{t('subscription.orgSubscriptionInactive')}</h3>
                        <p className="text-amber-700 text-sm mt-1">
                            {t('subscription.orgSubscriptionInactiveDesc')}
                        </p>

                        {showSuccess && (
                            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700 flex items-center gap-2" role="status">
                                <FiCheck /> {t('subscription.subscriptionActivated')}
                            </div>
                        )}

                        {!showSuccess && !isLoadingPlans && singleUserPlans.length > 0 && (
                            <div className="mt-4">
                                <p className="text-sm font-medium text-amber-800 mb-3">
                                    {t('subscription.subscribeIndividually')}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {singleUserPlans.map(plan => {
                                        const currencySymbol = CURRENCIES.find(c => c.code === plan.currency)?.symbol || plan.currency || '$';
                                        return (
                                            <div key={plan.id} className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col">
                                                <h4 className="font-semibold text-gray-800 text-sm">{plan.name}</h4>
                                                <p className="text-lg font-bold text-blue-600 mt-1">
                                                    {currencySymbol}{plan.priceMonthly?.toFixed(2)}
                                                    <span className="text-xs text-gray-500 font-normal">{t('subscription.perMonth')}</span>
                                                </p>
                                                <ul className="mt-2 text-xs text-gray-600 space-y-1 flex-grow">
                                                    {plan.hasAllChatAccess && (
                                                        <li className="flex items-center gap-1"><FiCheck className="text-green-500 flex-shrink-0" /> {t('subscription.aiMentors')}</li>
                                                    )}
                                                    {plan.hasAllQuestionnairesAccess && (
                                                        <li className="flex items-center gap-1"><FiCheck className="text-green-500 flex-shrink-0" /> {t('subscription.questionnaires')}</li>
                                                    )}
                                                    {plan.hasAllCoursesAccess && (
                                                        <li className="flex items-center gap-1"><FiCheck className="text-green-500 flex-shrink-0" /> {t('subscription.allCourses')}</li>
                                                    )}
                                                </ul>
                                                <button
                                                    onClick={() => setSelectedPlan(plan)}
                                                    className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors"
                                                    aria-label={t('subscription.subscribeTo', { name: plan.name })}
                                                >
                                                    {t('subscription.subscribe')}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {!showSuccess && !isLoadingPlans && singleUserPlans.length === 0 && (
                            <p className="text-sm text-amber-700 mt-3">
                                {t('subscription.contactAdmin')}
                            </p>
                        )}

                        {isLoadingPlans && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-amber-700">
                                <FiLoader className="animate-spin" /> {t('subscription.checkingPlans')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedPlan && (
                <SelfSubscribeModal
                    plan={selectedPlan}
                    onClose={() => setSelectedPlan(null)}
                    onSuccess={handleSubscriptionSuccess}
                />
            )}
        </>
    );
};

export default SubscriptionRequiredBanner;
