
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import * as apiService from '../../services/geminiService';
import { useRecaptcha } from '../../hooks/useRecaptcha';
import { FiLoader, FiLock, FiAlertCircle, FiEye, FiEyeOff, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';

const CHECKOUT_FORM_DATA_KEY = 'gymind_checkout_form_data';

// The main page component
const CheckoutPage: React.FC = () => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const planId = searchParams.get('planId');
    const navigate = useNavigate();
    const { user, selectedOrganization, initiateCheckoutRegistration } = useAuth();
    const { executeRecaptcha } = useRecaptcha();

    const [plan, setPlan] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    
    const [pageState, setPageState] = useState<'form' | 'pendingVerification'>('form');
    const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
    const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    // New Required Fields
    const [company, setCompany] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [zip, setZip] = useState('');
    const [country, setCountry] = useState('');

    const [isLoading, setIsLoading] = useState(false);
    const [iframeUrl, setIframeUrl] = useState<string | null>(null);

    const isSingleUserPlan = plan?.isForSingleUser === true;

    useEffect(() => {
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, []);
    
    // Effect to handle user coming back from email verification
    useEffect(() => {
        const sessionFromUrl = searchParams.get('checkout_session');
        if (sessionFromUrl) {
            setIsLoading(true);
            apiService.getCheckoutSessionData(sessionFromUrl)
                .then(data => {
                    console.log('[DIAGNOSE_PAYMENT_FLOW] Post-verification: Received session data from backend.', data);
                    const formDataForStorage = {
                        name: data.name, email: data.email, // No password
                        company: data.company, address: data.address, city: data.city, 
                        zip: data.zip, country: data.country,
                        planId: data.planId, academyId: data.academyId
                    };
                    localStorage.setItem(CHECKOUT_FORM_DATA_KEY, JSON.stringify(formDataForStorage));
                    console.log('[DIAGNOSE_PAYMENT_FLOW] Post-verification: Saved non-sensitive data to localStorage.');
                    
                    setName(data.name);
                    setEmail(data.email);
                    setPassword(data.password); // Keep in state to pass to initiatePaymentSimulator
                    setCompany(data.company);
                    setAddress(data.address);
                    setCity(data.city);
                    setZip(data.zip);
                    setCountry(data.country);
                    
                    setVerifiedEmail(data.email);
                    setCheckoutSessionId(sessionFromUrl);

                    const newSearchParams = new URLSearchParams(searchParams);
                    newSearchParams.delete('checkout_session');
                    // We must also ensure planId is present in URL for the `useEffect` that fetches plan details
                    if (!newSearchParams.has('planId') && data.planId) {
                        newSearchParams.set('planId', data.planId);
                    }
                    setSearchParams(newSearchParams, { replace: true });
                })
                .catch(err => {
                    setError('Your session has expired or is invalid. Please fill out the form again.');
                })
                .finally(() => setIsLoading(false));
        }
    }, [searchParams, setSearchParams]);

    // Effect to handle the retry flow after a failed payment
    useEffect(() => {
        const paymentError = searchParams.get('error');

        if (paymentError && paymentError.startsWith('payment_failed')) {
            console.log('[DIAGNOSE_PAYMENT_FLOW] Step 2: Payment failure detected in URL.');
            const savedDataString = localStorage.getItem(CHECKOUT_FORM_DATA_KEY);
            
            if (savedDataString) {
                const savedData = JSON.parse(savedDataString);
                console.log('[DIAGNOSE_PAYMENT_FLOW] Step 3: Found saved form data in localStorage.', savedData);
                
                setName(savedData.name || '');
                setEmail(savedData.email || '');
                setCompany(savedData.company || '');
                setAddress(savedData.address || '');
                setCity(savedData.city || '');
                setZip(savedData.zip || '');
                setCountry(savedData.country || '');
                setPassword(''); 
                setConfirmPassword('');

                const reInitiatePayment = async () => {
                    const planIdFromStorage = savedData.planId;
                    if (!planIdFromStorage) {
                        console.log('[DIAGNOSE_PAYMENT_FLOW] Step 4 - ABORTED: planId is missing from localStorage.');
                        setError("Your session has expired. No plan selected. Please go back and choose a plan.");
                        return;
                    }

                    setIsLoading(true);
                    setError("Your payment failed. Please check your details and try again.");
                    console.log(`[DIAGNOSE_PAYMENT_FLOW] Step 4: Re-initiating payment session with planId '${planIdFromStorage}' from localStorage.`);
                    
                    try {
                        // Fetch plan details for the summary box during the retry flow.
                        const fetchedPlan = await apiService.getPublicPlanDetails(planIdFromStorage);
                        setPlan(fetchedPlan);

                        const response = await apiService.initiatePaymentSimulator({
                            planId: planIdFromStorage,
                            name: savedData.name,
                            email: savedData.email,
                            company: savedData.company,
                            address: savedData.address,
                            city: savedData.city,
                            zip: savedData.zip,
                            country: savedData.country,
                            organizationId: savedData.organizationId
                        });

                        if (response.iframeUrl) {
                            console.log('[DIAGNOSE_PAYMENT_FLOW] Step 5: New iframe URL received. Displaying payment form.');
                            setIframeUrl(response.iframeUrl);
                        } else {
                            throw new Error("Failed to get a new payment session.");
                        }
                    } catch (err: any) {
                        console.log('[DIAGNOSE_PAYMENT_FLOW] Step 5 - FAILED: Error re-initiating payment.', err);
                        setError(err.message || "Could not start a new payment session. Please try submitting the form again.");
                        setIframeUrl(null);
                    } finally {
                        setIsLoading(false);
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete('error');
                        setSearchParams(newParams, { replace: true });
                    }
                };
                
                reInitiatePayment();

            } else {
                console.log('[DIAGNOSE_PAYMENT_FLOW] Step 3 - FAILED: No saved form data found in localStorage. Displaying empty form.');
                setError("Your previous payment failed, and your session has expired. Please fill out your details again.");
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('error');
                setSearchParams(newParams, { replace: true });
            }
        }
    }, [searchParams, setSearchParams]);


    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setEmail(user.email || '');
            if (selectedOrganization) {
                setCompany(selectedOrganization.name);
            } else if (!company) {
                setCompany(`${user.name}'s Workspace`);
            }
        }
    }, [user, selectedOrganization]);

    useEffect(() => {
        // This effect is for the INITIAL page load to fetch plan details.
        // It should NOT run during the payment failure retry flow (which is handled in another effect),
        // or if an iframe is already being displayed.
        if (searchParams.get('error')?.startsWith('payment_failed') || iframeUrl) {
            return;
        }

        const initialPaymentError = searchParams.get('error');
        if (initialPaymentError && !localStorage.getItem(CHECKOUT_FORM_DATA_KEY)) {
            setError("Payment failed or was cancelled. Please try again.");
        }
        
        if (!planId) {
            // Only set error if not loading an iframe, to avoid race conditions.
            if (!iframeUrl) {
                setError("No plan selected. Please go back and choose a plan.");
            }
            return;
        }
        
        const fetchPlan = async () => {
            setIsLoading(true);
            try {
                const fetchedPlan = await apiService.getPublicPlanDetails(planId);
                setPlan(fetchedPlan);
            } catch (err: any) {
                setError(err.message || "Failed to load plan details.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPlan();
    }, [planId, searchParams, iframeUrl]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const companyValue = (isSingleUserPlan && !company.trim()) ? name : company;

        if (!isSingleUserPlan && !companyValue.trim()) {
            setError('Company / Organization Name is required for multi-user plans.');
            return;
        }

        console.log('[DIAGNOSE_PAYMENT_FLOW] Step 1: Saving form data to localStorage before processing.');
        const formDataForStorage = { name, email, company: companyValue, address, city, zip, country, planId, academyId: plan?.academyId, organizationId: selectedOrganization?.id };
        localStorage.setItem(CHECKOUT_FORM_DATA_KEY, JSON.stringify(formDataForStorage));

        const formDataForApi = { name, email, password, company: companyValue, address, city, zip, country, planId, academyId: plan?.academyId, organizationId: selectedOrganization?.id };

        if (!user && !verifiedEmail) {
            if (password !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            const isPasswordValid = password.length >= 8 && /^[!-~]+$/.test(password) && /\d/.test(password) && /[!@#$%^&*]/.test(password);
            if (!isPasswordValid) {
                setError("Latin characters only (English letters, numbers, and symbols). Password must be at least 8 characters long and contain at least one digit and one special character.");
                return;
            }

            setIsLoading(true);
            try {
                const recaptchaToken = await executeRecaptcha('checkout_registration');
                await initiateCheckoutRegistration(formDataForApi, recaptchaToken);
                setPageState('pendingVerification');
            } catch (err: any) {
                setError(err.message || "An error occurred during registration.");
            } finally {
                setIsLoading(false);
            }
            return;
        }

        setIsLoading(true);
        try {
            const response = await apiService.initiatePaymentSimulator({
                planId: planId!, name, email,
                password: user ? undefined : password,
                company: companyValue, 
                address, city, zip, country,
                checkoutSessionId: checkoutSessionId,
                organizationId: selectedOrganization?.id
            });
            
            if (response.iframeUrl) {
                setIframeUrl(response.iframeUrl);
            } else {
                setError("Failed to initiate payment gateway.");
            }
        } catch (err: any) {
            setError(err.message || "An error occurred initiating payment.");
        } finally {
            setIsLoading(false);
        }
    };
    
    if (pageState === 'pendingVerification') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white p-8 sm:p-12 rounded-xl shadow-2xl w-full max-w-lg text-center animate-fade-in-up">
                    <h1 className="text-2xl font-bold text-gray-800">{t('checkout.verifyEmail')}</h1>
                    <p className="text-gray-600 mt-4">{t('checkout.verifyEmailDesc', { email })}</p>
                    <p className="text-gray-500 mt-2 text-sm">{t('checkout.checkInbox')}</p>
                </div>
            </div>
        );
    }

    // A more specific loading state for the retry flow
    if (isLoading && searchParams.get('error')?.startsWith('payment_failed')) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <FiLoader className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4"/>
                    <p className="text-lg font-medium text-gray-700">{t('checkout.preparingSession')}</p>
                </div>
            </div>
        );
    }

    if ((isLoading && !iframeUrl) || (!plan && !error)) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><FiLoader className="animate-spin h-10 w-10 text-blue-600"/></div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end items-center mb-6 pb-2 border-b border-gray-200 gap-4 sm:gap-8">
                    {/* Left Side (Desktop) / Top Group (Mobile) */}
                    <div className="flex items-end gap-3">
                        <img src="/checkout.webp" alt="Checkout Icon" className="h-14 w-auto" />
                        <h1 className="text-4xl font-bold text-gray-800">{t('checkout.title')}</h1>
                    </div>

                    {/* Right Side (Desktop) / Bottom Group (Mobile) */}
                    <div className="w-full sm:w-auto flex justify-center sm:justify-end">
                        <div className="flex items-center gap-1 text-gray-500">
                            <span className="text-[10px] sm:text-xs">Powered by</span>
                            <img src="/logo_gym.webp" alt="Gymind Logo" className="h-6 sm:h-8 w-auto"/>
                        </div>
                    </div>
                </header>

                <div className="flex flex-col md:flex-row gap-8">
                    {/* Left: Order Summary */}
                    <div className="md:w-1/3 order-1 md:order-1">
                        <div className="bg-white p-6 rounded-xl shadow-lg">
                            <div className="flex items-center justify-center gap-3 mb-4">
                                <div 
                                    className="h-12 w-12 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 p-1"
                                    style={{ backgroundColor: plan?.sidebarColor || '#e5e7eb' }}
                                >
                                    <img src={plan?.logoUrl || '/logo_gym.webp'} alt={plan?.academyName || 'Academy Logo'} className="h-full w-full object-contain rounded-full" />
                                </div>
                                <span className="text-xl font-semibold text-gray-700">{plan?.academyName}</span>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4 text-center">{t('checkout.orderSummary')}</h2>
                            {plan && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-gray-700">
                                        <span>{t('checkout.plan')}:</span>
                                        <span className="font-semibold">{plan.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-700">
                                        <span>{t('checkout.academy')}:</span>
                                        <span className="font-semibold">{plan.academyName}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-gray-700 border-t pt-4">
                                        <span className="text-lg font-bold">{t('checkout.total')}:</span>
                                        <span className="text-lg font-bold">{plan.currency || '$'}{plan.price}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 mt-4 text-center flex items-center justify-center">
                            <FiLock className="mr-1"/> {t('checkout.securePayment')}
                        </p>
                    </div>

                    {/* Right: Registration & Payment Iframe */}
                    <div className="md:w-2/3 order-2 md:order-2 bg-white p-8 rounded-xl shadow-lg">
                        {iframeUrl ? (
                            <div className="w-full">
                                <h2 className="text-xl font-semibold text-gray-700 mb-4">{t('checkout.completePayment')}</h2>
                                {error && (
                                     <div className="p-3 bg-red-50 text-red-700 rounded-md border border-red-200 flex items-center text-sm font-medium mb-4">
                                        <FiAlertCircle className="mr-2"/> {error}
                                    </div>
                                )}
                                <div className="p-4 mb-4 bg-yellow-50 text-yellow-800 rounded-lg border border-yellow-200 flex items-start">
                                    <FiAlertTriangle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-bold">Demonstration Only</h3>
                                        <p className="text-sm">This is a payment simulator for demonstration purposes. Any card details will result in a successful transaction. <strong>Do not use real credit card information.</strong></p>
                                    </div>
                                </div>
                                <div className="w-full h-[600px] border border-gray-200 rounded-lg overflow-hidden bg-gray-50 relative">
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-0">{t('checkout.loadingSecurePayment')}</div>
                                    <iframe src={iframeUrl} className="w-full h-full relative z-10" frameBorder="0" title="Payment Simulator" />
                                </div>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-xl font-semibold text-gray-700">{user ? t('checkout.confirmDetails') : t('checkout.createAccount')}</h2>
                                {error && (
                                    <div id="checkout-form-error" role="alert" className="mt-4 p-3 bg-red-50 text-red-700 rounded-md border border-red-200 flex items-center text-sm font-medium">
                                        <FiAlertCircle className="mr-2"/> {error}
                                    </div>
                                )}
                                <form id="registration-form" onSubmit={handleSubmit} className="space-y-6 mt-6">
                                    {verifiedEmail && (
                                        <div className="p-3 bg-green-50 text-green-700 rounded-md border border-green-200 flex items-center text-sm font-medium">
                                            <FiCheckCircle className="mr-2"/> {t('checkout.emailVerified')}
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-500">{t('checkout.requiredFieldsNote')}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('checkout.emailAddress')} <span aria-hidden="true">*</span></label>
                                            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-gray-50" disabled={!!user || !!verifiedEmail}/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('checkout.fullName')} <span aria-hidden="true">*</span></label>
                                            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className={`mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm ${user ? 'bg-gray-50' : ''}`} disabled={!!user}/>
                                        </div>
                                        {!user && !verifiedEmail && (
                                            <>
                                                <div className="md:col-span-2">
                                                    <label htmlFor="password_checkout" className="block text-sm font-medium text-gray-700">{t('checkout.createPassword')} <span aria-hidden="true">*</span></label>
                                                    <div className="mt-1 relative">
                                                        <input id="password_checkout" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm" placeholder="••••••••"/>
                                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500"><FiEyeOff size={20} /></button>
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-500">{t('checkout.passwordRequirements')}</p>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label htmlFor="confirmPassword_checkout" className="block text-sm font-medium text-gray-700">{t('checkout.confirmPassword')} <span aria-hidden="true">*</span></label>
                                                    <input id="confirmPassword_checkout" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm" placeholder="••••••••"/>
                                                </div>
                                            </>
                                        )}
                                        <div className="md:col-span-2 pt-4 border-t border-gray-200">
                                            <h3 className="text-lg font-medium text-gray-800 mb-4">{t('checkout.billingInformation')}</h3>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label htmlFor="company" className="block text-sm font-medium text-gray-700">
                                                {t('checkout.companyName')}{' '}
                                                {isSingleUserPlan
                                                    ? <span className="text-gray-500 font-normal">({t('common.optional')})</span>
                                                    : <span aria-hidden="true">*</span>}
                                            </label>
                                            <input
                                                id="company"
                                                type="text"
                                                value={company}
                                                onChange={(e) => setCompany(e.target.value)}
                                                required={!isSingleUserPlan}
                                                aria-required={!isSingleUserPlan}
                                                aria-describedby={error ? "checkout-form-error" : undefined}
                                                className={`mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm ${user ? 'bg-gray-50' : ''}`}
                                                disabled={!!user}
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label htmlFor="address" className="block text-sm font-medium text-gray-700">{t('checkout.address')} <span aria-hidden="true">*</span></label>
                                            <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm"/>
                                        </div>
                                        <div>
                                            <label htmlFor="city" className="block text-sm font-medium text-gray-700">{t('checkout.city')} <span aria-hidden="true">*</span></label>
                                            <input id="city" type="text" value={city} onChange={(e) => setCity(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm"/>
                                        </div>
                                        <div>
                                            <label htmlFor="zip" className="block text-sm font-medium text-gray-700">{t('checkout.zipCode')} <span aria-hidden="true">*</span></label>
                                            <input id="zip" type="text" value={zip} onChange={(e) => setZip(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm"/>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label htmlFor="country" className="block text-sm font-medium text-gray-700">{t('checkout.country')} <span aria-hidden="true">*</span></label>
                                            <input id="country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} required aria-required="true" aria-describedby={error ? "checkout-form-error" : undefined} className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm"/>
                                        </div>
                                    </div>
                                    <button disabled={isLoading} id="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-lg shadow-lg disabled:opacity-50 flex items-center justify-center text-lg transition-colors mt-6">
                                        {isLoading ? <FiLoader className="animate-spin h-6 w-6" /> : (user || verifiedEmail) ? t('checkout.proceedToPayment') : t('checkout.verifyEmailAndContinue')}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
