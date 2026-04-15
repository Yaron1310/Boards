import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import { useAuth } from '../../hooks/useAuth';
import { FiCreditCard, FiClock, FiDownload, FiCheckCircle, FiAlertCircle, FiShield, FiLoader, FiAlertTriangle } from 'react-icons/fi';

// Mock Invoice Data
const MOCK_INVOICES = [
    { id: 'inv_gym_003', date: '2024-07-01', amount: '$75.50', status: 'Paid', description: 'June 2024 Usage' },
    { id: 'inv_gym_002', date: '2024-06-01', amount: '$62.10', status: 'Paid', description: 'May 2024 Usage' },
    { id: 'inv_gym_001', date: '2024-05-01', amount: '$81.00', status: 'Paid', description: 'April 2024 Usage' },
];

const AcademyBillingPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [actionMessage, setActionMessage] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);

    const handleMockAction = (action: string) => {
        setActionMessage({ type: 'info', text: `Action "${action}" triggered. This is a demo. Payment provider integration coming soon.` });
        setTimeout(() => setActionMessage(null), 4000);
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Paid': return 'bg-green-100 text-green-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-4xl mx-auto">


                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg flex items-center animate-fade-in-down border ${
                        actionMessage.type === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
                        actionMessage.type === 'error' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-blue-100 text-blue-800 border-blue-200'
                    }`}>
                        <FiAlertCircle className="mr-2 h-5 w-5" />
                        {actionMessage.text}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Subscription Status Card */}
                    <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md border border-gray-100">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-800">{t('admin.academyPlan')}</h2>
                                <p className="text-sm text-gray-500">{t('billing.managedViaGymind')}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-green-100 text-green-800`}>
                                {t('billing.active')}
                            </span>
                        </div>
                        
                        <div className="flex items-center mb-4">
                            <div className="p-3 bg-purple-50 rounded-lg mr-4">
                                <FiShield className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-gray-900">{t('billing.payAsYouGo')}</p>
                                <p className="text-sm text-gray-600">{t('billing.billedMonthlyTokens')}</p>
                            </div>
                        </div>

                        <div className="flex items-center text-sm text-gray-500 mb-6">
                            <FiClock className="mr-2" />
                            Next billing date: <span className="font-medium text-gray-700 ml-1">August 1, 2024</span>
                        </div>
                    </div>

                    {/* Payment Method Card */}
                    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col">
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">{t('billing.paymentMethod')}</h2>
                        <div className="flex-grow flex flex-col justify-center items-center text-center mb-4">
                            <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-gray-700 text-lg">VISA</span>
                                    <FiCheckCircle className="text-green-500" />
                                </div>
                                <div className="mt-2 text-left">
                                    <p className="text-gray-500 text-sm">Ending in •••• 4242</p>
                                    <p className="text-gray-400 text-xs">Expires 12/25</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleMockAction('Update Payment Method')}
                            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium transition-colors"
                        >
                            {t('billing.updatePaymentMethod')}
                        </button>
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
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{inv.description}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{inv.amount}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(inv.status)}`}>
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
        </div>
    );
};

export default AcademyBillingPage;