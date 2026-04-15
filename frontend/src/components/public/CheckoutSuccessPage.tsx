
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as apiService from '../../services/geminiService';
import { FiLoader, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

const CheckoutSuccessPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { finalizeLoginSession } = useAuth();
    
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [message, setMessage] = useState('Finalizing your session...');
    
    // Guard to prevent double execution in React Strict Mode
    const hasExecutedRef = useRef(false);

    useEffect(() => {
        const sessionId = searchParams.get('session_id');
        const paymentStatus = searchParams.get('payment_status');

        console.log('[CheckoutSuccess] Page mounted. Params:', { sessionId, paymentStatus });

        if (paymentStatus === 'success' && sessionId) {
            if (hasExecutedRef.current) {
                console.log('[CheckoutSuccess] Already executed/executing. Skipping.');
                return;
            }
            hasExecutedRef.current = true;

            const completeAuth = async () => {
                console.log('[CheckoutSuccess] calling finalizePaymentSession...');
                try {
                    // This fetches the { accessToken, user, selectedOrganization } object
                    // This is a one-time operation. The backend deletes the session after this.
                    const loginData = await apiService.finalizePaymentSession(sessionId);
                    console.log('[CheckoutSuccess] API success. Data:', loginData);
                    
                    if (!loginData || !loginData.accessToken) {
                        console.error('[CheckoutSuccess] Invalid data structure received!', loginData);
                        throw new Error('Invalid response from server.');
                    }

                    // This synchronously sets React state. Token is in httpOnly cookie.
                    finalizeLoginSession(loginData);
                    console.log('[CheckoutSuccess] Session finalized in AuthContext.');

                    setStatus('success');
                    setMessage('Payment successful! Redirecting to your dashboard...');
                    
                    // Use a hard redirect to ensure a clean state for the main app
                    setTimeout(() => {
                        console.log('[CheckoutSuccess] Redirecting to /dashboard...');
                        window.location.replace('/dashboard');
                    }, 1500);

                } catch (err: any) {
                    console.error('[CheckoutSuccess] Error:', err);
                    setStatus('error');
                    setMessage(err.message || "Authentication failed after payment. Your payment was successful, but we couldn't log you in automatically. Please try logging in manually.");
                }
            };
            completeAuth();
        } else {
            console.warn('[CheckoutSuccess] Missing params.');
            setStatus('error');
            setMessage("Invalid session or incomplete payment. Please try logging in.");
        }
    }, [searchParams, finalizeLoginSession]);
    
    const renderContent = () => {
        switch(status) {
            case 'processing':
                return (
                    <>
                        <FiLoader className="animate-spin h-12 w-12 text-blue-600 mb-4" />
                        <h1 className="text-2xl font-bold text-gray-800">{t('common.processing')}</h1>
                    </>
                );
            case 'success':
                 return (
                    <>
                        <FiCheckCircle className="h-12 w-12 text-green-500 mb-4" />
                        <h1 className="text-2xl font-bold text-gray-800">{t('checkout.success')}</h1>
                    </>
                );
            case 'error':
                 return (
                    <>
                        <FiAlertCircle className="h-12 w-12 text-red-500 mb-4" />
                        <h1 className="text-2xl font-bold text-gray-800">{t('common.error')}</h1>
                        <Link to="/login" className="mt-6 text-blue-600 hover:underline">{t('auth.goToLogin')}</Link>
                    </>
                );
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-12 rounded-xl shadow-lg text-center max-w-md w-full">
                {renderContent()}
                <p className="text-gray-600 mt-2">{message}</p>
            </div>
        </div>
    );
};

export default CheckoutSuccessPage;
