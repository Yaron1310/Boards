
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { UserRole, AcademyPayoutData } from '../../types';
import { FiDollarSign, FiLoader, FiAlertCircle, FiCheckCircle, FiRefreshCw, FiTrendingUp, FiTrendingDown, FiInfo } from 'react-icons/fi';
import * as apiService from '../../services/geminiService';

const SystemPaymentsPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [payouts, setPayouts] = useState<AcademyPayoutData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPayouts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await apiService.getAcademyPayouts();
            setPayouts(data);
        } catch (err: any) {
            setError(err.message || "Failed to load payout data.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (user?.role === UserRole.SYSTEM_ADMIN) {
            fetchPayouts();
        }
    }, [user]);

    if (user?.role !== UserRole.SYSTEM_ADMIN) {
        return <div className="p-6 text-red-600">{t('admin.accessDenied')}</div>;
    }

    const totalRevenue = payouts.reduce((sum, p) => sum + p.totalRevenue, 0);
    const totalCost = payouts.reduce((sum, p) => sum + p.totalTokenCost, 0);
    const totalPayoutDue = payouts.reduce((sum, p) => sum + Math.max(0, p.netPayout), 0);

    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                        <FiDollarSign className="mr-3 text-green-600"/> {t('admin.academyPayouts')}
                    </h1>
                    <button
                        onClick={fetchPayouts}
                        disabled={isLoading}
                        className="flex items-center px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 disabled:opacity-50"
                    >
                        <FiRefreshCw className={`mr-2 ${isLoading ? 'animate-spin' : ''}`}/> {t('common.refresh')}
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 text-red-700 border border-red-200 rounded-lg flex items-center">
                        <FiAlertCircle className="mr-3 h-5 w-5"/> {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-green-500">
                        <p className="text-sm font-medium text-gray-500 uppercase mb-1">{t('admin.totalRevenueCollected')}</p>
                        <p className="text-3xl font-bold text-gray-800">{formatter.format(totalRevenue)}</p>
                        <div className="mt-2 text-xs text-green-600 flex items-center">
                            <FiTrendingUp className="mr-1"/> From Organizations using Gymind Pay
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-red-500">
                        <p className="text-sm font-medium text-gray-500 uppercase mb-1">{t('admin.totalTokenCosts')}</p>
                        <p className="text-3xl font-bold text-gray-800">{formatter.format(totalCost)}</p>
                        <div className="mt-2 text-xs text-red-600 flex items-center">
                            <FiTrendingDown className="mr-1"/> Infrastructure/LLM Usage
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-blue-500">
                        <p className="text-sm font-medium text-gray-500 uppercase mb-1">{t('admin.totalPayoutDue')}</p>
                        <p className="text-3xl font-bold text-blue-700">{formatter.format(totalPayoutDue)}</p>
                        <div className="mt-2 text-xs text-blue-600 flex items-center">
                            <FiInfo className="mr-1"/> Revenue - Cost
                        </div>
                    </div>
                </div>

                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.academyName')}</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.paymentStatus')}</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.activeGymindOrgs')}</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.revenue')}</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.tokenCost')}</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('admin.netPayout')}</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.action')}</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {isLoading && payouts.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-4"><FiLoader className="animate-spin h-6 w-6 text-blue-500 mx-auto"/></td></tr>
                                ) : payouts.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-4 text-gray-500">{t('admin.noPayoutsThisPeriod')}</td></tr>
                                ) : (
                                    payouts.map((payout) => (
                                        <tr key={payout.academyId} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{payout.academyName}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                    <FiCheckCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                                                    {t('billing.active')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{payout.activeGymindOrgs}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium text-right">
                                                {formatter.format(payout.totalRevenue)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium text-right">
                                                {formatter.format(payout.totalTokenCost)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-700 text-right">
                                                {formatter.format(payout.netPayout)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                                <button 
                                                    className="text-gray-400 hover:text-green-600 transition-colors" 
                                                    title="Mark as Paid (Demo)"
                                                    onClick={() => alert("This is a demo action. In a real system, this would mark the payout as completed.")}
                                                >
                                                    <FiCheckCircle size={20}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemPaymentsPage;
