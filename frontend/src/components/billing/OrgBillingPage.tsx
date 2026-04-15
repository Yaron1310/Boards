import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { FiCreditCard, FiClock, FiDownload, FiCheckCircle, FiAlertCircle, FiShield, FiLoader, FiAlertTriangle, FiExternalLink } from 'react-icons/fi';
import * as apiService from '../../services/geminiService';

// Mock Invoice Data
const MOCK_INVOICES = [
    { id: 'inv_003', date: '2023-12-01', amount: '$499.00', status: 'Paid', pdfUrl: '#' },
    { id: 'inv_002', date: '2023-11-01', amount: '$499.00', status: 'Paid', pdfUrl: '#' },
    { id: 'inv_001', date: '2023-10-01', amount: '$499.00', status: 'Paid', pdfUrl: '#' },
];

const OrgBillingPage: React.FC = () => {
    const { t } = useTranslation();
    const { selectedOrganization, refreshAuthUser } = useAuth();
    const { plans, academySettings } = useData();
    const [actionMessage, setActionMessage] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);
    const [showCancelSubConfirm, setShowCancelSubConfirm] = useState(false);
    const [showRestoreSubConfirm, setShowRestoreSubConfirm] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Automatically clear any action message after 5 seconds
    useEffect(() => {
        if (actionMessage) {
            const timer = setTimeout(() => {
                setActionMessage(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [actionMessage]);

    const activePlan = plans.find(p => p.id === selectedOrganization?.planId);
    
    // Determine if cancellation is available
    const isSubscription = activePlan?.planType === 'subscription';
    
    // Use the new status field, defaulting to 'incomplete' if missing (e.g. older data)
    const subStatus = selectedOrganization?.subscriptionStatus || 'incomplete';
    const cancelAtPeriodEnd = selectedOrganization?.cancelAtPeriodEnd;
    const isSubActive = subStatus === 'active' || subStatus === 'trialing';

    // Cancellation is allowed if it's an active subscription managed by Gymind or a configured WordPress plugin.
    const canCancel = isSubscription && isSubActive && !cancelAtPeriodEnd && (
        selectedOrganization?.subscriptionProvider === 'gymind' ||
        (selectedOrganization?.subscriptionProvider === 'woocommerce' && !!academySettings?.subscriptionCancellationWebhookUrl)
    );

    const canRestore = isSubscription && cancelAtPeriodEnd && (
        selectedOrganization?.subscriptionProvider === 'gymind' ||
        selectedOrganization?.subscriptionProvider === 'woocommerce'
    );

    const handleMockAction = (action: string) => {
        setActionMessage({ type: 'info', text: `Action "${action}" triggered. This is a demo. Payment provider integration coming soon.` });
    };

    const handleCancelSubscription = async () => {
        setIsProcessing(true);
        setActionMessage(null);
        try {
            const result = await apiService.cancelMySubscription();
            setActionMessage({ type: 'success', text: result.message });
            setShowCancelSubConfirm(false);
            await refreshAuthUser();
        } catch (err: any) {
            setActionMessage({ type: 'error', text: err.message || 'Failed to cancel subscription.' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRestoreSubscription = async () => {
        setIsProcessing(true);
        setActionMessage(null);
        try {
            const result = await apiService.restoreMySubscription();
            setActionMessage({ type: 'success', text: result.message });
            setShowRestoreSubConfirm(false);
            await refreshAuthUser();
        } catch (err: any) {
            setActionMessage({ type: 'error', text: err.message || 'Failed to restore subscription.' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Helper to get status badge color
    const getStatusColor = (status: string) => {
        switch(status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'trialing': return 'bg-blue-100 text-blue-800';
            case 'cancelled': return 'bg-gray-100 text-gray-800';
            case 'past_due': return 'bg-red-100 text-red-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    const formatDate = (dateValue: any) => {
        if (!dateValue) return '';
        let date: Date;
        if (dateValue.toDate) { // Firestore Timestamp
            date = dateValue.toDate();
        } else {
            date = new Date(dateValue);
        }
        return date.toLocaleDateString('en-GB'); // dd/mm/yyyy
    };

    const getFullStatus = () => {
        if (cancelAtPeriodEnd) {
            const dateStr = formatDate(selectedOrganization?.subscriptionEndDate);
            return `Active | Pending Cancellation ${dateStr ? `Until ${dateStr}` : ''}`;
        }
        return subStatus.replace('_', ' ');
    };

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
                    <FiCreditCard className="mr-3 text-purple-600" /> {t('billing.organizationBilling')}
                </h1>

                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center animate-fade-in-down border ${
                        actionMessage.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
                        actionMessage.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-blue-100 text-blue-800 border-blue-200'
                    }`}>
                        {actionMessage.type === 'success' ? <FiCheckCircle className="mr-2 h-5 w-5" /> : 
                         actionMessage.type === 'error' ? <FiAlertCircle className="mr-2 h-5 w-5" /> :
                         <FiAlertCircle className="mr-2 h-5 w-5" />}
                        {actionMessage.text}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Subscription Status Card */}
                    <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md border border-gray-100">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">{t('billing.currentSubscription')}</h2>
                                <p className="text-sm text-gray-500">
                                    {selectedOrganization?.subscriptionProvider === 'gymind'
                                        ? t('billing.managedViaGymind')
                                        : t('billing.managedViaExternal')}
                                </p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(subStatus)}`}>
                                {subStatus.replace('_', ' ')}
                            </span>
                        </div>
                        
                        <div className="flex items-center mb-4">
                            <div className="p-3 bg-purple-50 rounded-lg mr-4">
                                <FiShield className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-gray-900">{activePlan?.name || t('billing.noPlanSelected')}</p>
                                <p className="text-sm text-gray-600">
                                    {activePlan?.planType === 'subscription'
                                        ? t('billing.seatsMonthly', { seats: activePlan.maxUsers || 1 })
                                        : t('billing.oneTimeAccess')}
                                    {activePlan?.priceMonthly !== undefined && (
                                        <span className="ml-1">• {activePlan.priceMonthly} {activePlan.currency || 'USD'}</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center text-sm text-gray-500 mb-6">
                            <FiCheckCircle className="mr-2 text-green-500" />
                            {t('billing.status')}: <span className="font-medium text-gray-700 ml-1 capitalize">
                                {getFullStatus()}
                            </span>
                        </div>


                        <div className="flex space-x-3">
                            <Link
                                to={`/public/${encodeURIComponent(selectedOrganization?.academyName || '')}`}
                                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium transition-colors inline-block"
                            >
                                {t('billing.upgradeChangePlan')}
                            </Link>

                            {canCancel && (
                                <button
                                    onClick={() => setShowCancelSubConfirm(true)}
                                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md text-sm font-medium transition-colors"
                                >
                                    {t('billing.cancelSubscription')}
                                </button>
                            )}

                            {canRestore && (
                                <button
                                    onClick={() => setShowRestoreSubConfirm(true)}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium transition-colors flex items-center disabled:opacity-50"
                                >
                                    {t('billing.restoreSubscription')}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Payment Method Card */}
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('billing.paymentMethod')}</h2>

                        <div className="flex-grow flex flex-col justify-center items-center text-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                            {selectedOrganization?.subscriptionProvider === 'gymind' ? (
                                <>
                                    <FiShield className="h-10 w-10 text-purple-600 mb-3" />
                                    <p className="font-bold text-gray-800">{t('billing.gymindSecurePayment')}</p>
                                    <p className="text-xs text-gray-500 mt-1 text-center">{t('billing.managedViaGymind')}</p>
                                </>
                            ) : (
                                <>
                                    <FiExternalLink className="h-10 w-10 text-blue-500 mb-3" />
                                    <p className="font-bold text-gray-800">{t('billing.externalAcademyPayment')}</p>
                                    <p className="text-xs text-gray-500 mt-1 text-center">{t('billing.managedViaAcademyPortal')}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Billing History */}
                <div className="bg-white rounded-lg shadow-md border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-800">{t('billing.billingHistory')}</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('billing.date')}</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('billing.description')}</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('billing.amount')}</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('billing.status')}</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('billing.invoice')}</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {MOCK_INVOICES.map((inv) => (
                                    <tr key={inv.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{inv.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{t('billing.monthlySubscription')}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{inv.amount}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleMockAction(`Download Invoice ${inv.id}`)}
                                                className="text-indigo-600 hover:text-indigo-900 flex items-center justify-end w-full"
                                            >
                                                <FiDownload className="mr-1" /> PDF
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Cancel Subscription Confirmation Modal */}
            {showCancelSubConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
                        <div className="flex items-start mb-4">
                            <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800">{t('billing.cancelSubscription')}</h3>
                                <p className="text-sm text-gray-500">{t('billing.confirmCancelSub')}</p>
                            </div>
                        </div>

                        <div className="bg-red-50 p-4 rounded-md mb-6 border border-red-100">
                            <p className="text-sm text-red-800">
                                {t('billing.cancelAccessContinues')}
                            </p>
                            <p className="text-sm text-red-800 mt-2 font-semibold">
                                {t('billing.cancelUndoHint', { date: formatDate(selectedOrganization?.subscriptionEndDate) || t('billing.endOfPeriod') })}
                            </p>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowCancelSubConfirm(false)}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                {t('common.goBack')}
                            </button>
                            <button
                                onClick={handleCancelSubscription}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center disabled:opacity-50"
                            >
                                {isProcessing && <FiLoader className="animate-spin mr-2" />}
                                {isProcessing ? t('common.processing') : t('billing.confirmCancellation')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root')!
            )}
            {/* Restore Subscription Confirmation Modal */}
            {showRestoreSubConfirm && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
                        <div className="flex items-start mb-4">
                            <FiCheckCircle className="text-green-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-800">{t('billing.restoreSubscription')}</h3>
                                <p className="text-sm text-gray-500">{t('billing.confirmRestoreSub')}</p>
                            </div>
                        </div>

                        <div className="bg-green-50 p-4 rounded-md mb-6 border border-green-100">
                            <p className="text-sm text-green-800">
                                {t('billing.restoreSubDesc')}
                            </p>
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowRestoreSubConfirm(false)}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                            >
                                {t('common.goBack')}
                            </button>
                            <button
                                onClick={handleRestoreSubscription}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center disabled:opacity-50"
                            >
                                {isProcessing && <FiLoader className="animate-spin mr-2" />}
                                {isProcessing ? t('common.processing') : t('billing.restoreSubscription')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root')!
            )}
        </div>
    );
};

export default OrgBillingPage;