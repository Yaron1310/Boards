import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { FiCreditCard, FiCheckCircle, FiAlertCircle, FiLoader, FiAlertTriangle, FiXCircle } from 'react-icons/fi';
import * as apiService from '../../services/geminiService';
import { useTranslation } from 'react-i18next';

const MySubscriptionPage: React.FC = () => {
    const { t } = useTranslation();
    const { selectedOrganization, refreshAuthUser } = useAuth();
    const { plans } = useData();
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
    const [showCancelSubConfirm, setShowCancelSubConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const activePlan = useMemo(() => {
        return plans.find(p => p.id === selectedOrganization?.planId);
    }, [plans, selectedOrganization]);

    const isPersonalSubscription = selectedOrganization?.isPersonal === true;

    if (!isPersonalSubscription) {
        return (
            <div className="w-full h-full p-6 md:p-8 flex flex-col items-center justify-center text-center">
                <FiAlertCircle className="h-12 w-12 text-gray-400 mb-4" />
                <h2 className="text-xl font-semibold text-gray-700">{t('subscription.noPersonalSubscription')}</h2>
                <p className="text-gray-500 mt-2">
                    This page is for managing individual subscriptions. It looks like you are part of a corporate plan.
                </p>
            </div>
        );
    }

    const subStatus = selectedOrganization?.subscriptionStatus || 'incomplete';
    const isSubActive = subStatus === 'active' || subStatus === 'trialing';

    const handleCancelSubscription = async () => {
        setIsProcessing(true);
        setActionMessage(null);
        try {
            const result = await apiService.cancelMySubscription();
            setActionMessage({ type: 'success', text: result.message });
            await refreshAuthUser(); // Refresh user state to get new org status
        } catch (err: any) {
            setActionMessage({ type: 'error', text: err.message || t('subscription.failedToCancel') });
        } finally {
            setIsProcessing(false);
            setShowCancelSubConfirm(false);
        }
    };

    const getStatusInfo = (status: string) => {
        switch (status) {
            case 'active': return { label: t('subscription.statusActive'), color: 'bg-green-100 text-green-800' };
            case 'trialing': return { label: t('subscription.statusTrialing'), color: 'bg-blue-100 text-blue-800' };
            case 'cancelled': return { label: t('subscription.statusCancelled'), color: 'bg-gray-100 text-gray-800' };
            case 'past_due': return { label: t('subscription.statusPastDue'), color: 'bg-red-100 text-red-800' };
            default: return { label: status, color: 'bg-yellow-100 text-yellow-800' };
        }
    };

    const statusInfo = getStatusInfo(subStatus);

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                    <FiCreditCard className="mr-3 text-purple-600" /> {t('subscription.mySubscription')}
                </h1>

                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center border ${
                        actionMessage.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
                        'bg-red-100 text-red-800 border-red-200'
                    }`}>
                        {actionMessage.type === 'success' ? <FiCheckCircle className="mr-2 h-5 w-5" /> : <FiAlertCircle className="mr-2 h-5 w-5" />}
                        {actionMessage.text}
                    </div>
                )}

                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">{t('subscription.yourPlan')}</h2>
                            <p className="text-sm text-gray-500">
                                {selectedOrganization?.subscriptionProvider === 'gymind'
                                    ? t('subscription.managedViaGymind')
                                    : t('subscription.managedViaExternal')}
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusInfo.color}`}>
                            {statusInfo.label}
                        </span>
                    </div>

                    {!activePlan ? (
                        <div className="py-8 text-center text-gray-500">
                            <FiLoader className="animate-spin h-6 w-6 mx-auto mb-2" />
                            <p>{t('subscription.loadingPlanDetails')}</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-2xl font-bold text-gray-900">{activePlan.name}</p>
                            <p className="text-gray-600 mt-2">{activePlan.description}</p>
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-3xl font-bold text-purple-700">
                                    ${activePlan.priceMonthly} <span className="text-base font-normal text-gray-500">{t('subscription.perMonth')}</span>
                                </p>
                            </div>
                        </>
                    )}

                    {isSubActive && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                            <h3 className="font-semibold text-gray-700 mb-2">{t('subscription.manageSubscription')}</h3>
                            <button
                                onClick={() => setShowCancelSubConfirm(true)}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm font-medium transition-colors"
                            >
                                {t('subscription.cancelSubscription')}
                            </button>
                        </div>
                    )}

                    {subStatus === 'cancelled' && (
                         <div className="mt-6 pt-6 border-t border-gray-200">
                            <p className="text-sm text-gray-600">Your subscription is cancelled and will not renew. Your access will continue until the end of your current billing period.</p>
                         </div>
                    )}
                </div>
            </div>

            {showCancelSubConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
                        <div className="flex items-start mb-4">
                            <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800">{t('subscription.confirmCancellation')}</h3>
                                <p className="text-sm text-gray-500">Are you sure you want to cancel?</p>
                            </div>
                        </div>
                        <div className="bg-red-50 p-4 rounded-md mb-6 border border-red-100">
                            <p className="text-sm text-red-800">Your subscription will not renew, and access will be removed at the end of your current billing period. This action cannot be undone.</p>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setShowCancelSubConfirm(false)} disabled={isProcessing} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">{t('subscription.goBack')}</button>
                            <button onClick={handleCancelSubscription} disabled={isProcessing} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50">
                                {isProcessing && <FiLoader className="animate-spin mr-2" />}
                                {isProcessing ? t('common.processing') : t('subscription.confirmCancellation')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root')!
            )}
        </div>
    );
};

export default MySubscriptionPage;
