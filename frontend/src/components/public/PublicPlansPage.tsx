
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import * as apiService from '../../services/geminiService';
import { useAuth } from '../../hooks/useAuth';
import { FiLoader, FiCheck, FiAlertCircle } from 'react-icons/fi';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const GradientOverlay: React.FC<{
    sidebarColor: string;
    hue: number;
    height: number;
    opacity: number;
}> = ({ sidebarColor, hue, height, opacity }) => (
    <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
            background: sidebarColor,
            filter: `hue-rotate(${hue}deg) brightness(1.4) saturate(1.4)`,
            maskImage: `linear-gradient(to top, rgba(0,0,0,${opacity / 100}) 0%, transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to top, rgba(0,0,0,${opacity / 100}) 0%, transparent 100%)`,
            height: `${height}%`,
            top: 'auto',
            bottom: 0,
        }}
    />
);

// ─── Normal (multi-plan) mode ─────────────────────────────────────────────────

const PublicPlansPage: React.FC = () => {
    const { t } = useTranslation();
    const { academyName, planId } = useParams<{ academyName: string; planId?: string }>();
    const { user, selectedOrganization } = useAuth();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        if (!academyName) return;
        const fetchData = async () => {
            try {
                const response = planId
                    ? await apiService.getPublicSinglePlanPage(academyName, planId)
                    : await apiService.getPublicAcademyDetails(academyName);
                setData(response);
            } catch (err: any) {
                setError(err.message || 'Failed to load plans.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [academyName, planId]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <FiLoader aria-label="Loading" className="animate-spin h-10 w-10 text-blue-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                <FiAlertCircle aria-hidden="true" className="h-12 w-12 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-gray-800">{t('common.unableToLoad')}</h1>
                <p className="text-gray-600 mt-2">{error || t('plans.academyNotFound')}</p>
            </div>
        );
    }

    // Single-plan mode
    if (planId && data.plan) {
        return <SinglePlanView data={data} user={user} />;
    }

    // Multi-plan mode
    const { theme, plans, publicPlansPage, appName, logoUrl, academyName: fetchedAcademyName } = data;

    const bgStyle = { backgroundColor: theme.sidebarColor || '#004e89' };
    const headerFontClass = publicPlansPage?.headerFontWeight || 'font-extrabold';
    const cardBgColor = publicPlansPage?.cardBackgroundColor || '#ffffff00';
    const cardBorderColor = publicPlansPage?.cardBorderColor || '#e5e7eb';
    const cardFontColor = publicPlansPage?.cardFontColor || '#1f2937';
    const buttonBgColor = publicPlansPage?.buttonBackgroundColor || '#2563EB';
    const buttonTextColor = publicPlansPage?.buttonTextColor || '#FFFFFF';
    const headerColor = theme.displayNameColor || '#ffffff';
    const showGradient = publicPlansPage?.enableGradient !== false;
    const gradientHue = publicPlansPage?.gradientHueRotation ?? 270;
    const gradientHeight = publicPlansPage?.gradientHeight ?? 85;
    const gradientOpacity = publicPlansPage?.gradientMaskOpacity ?? 40;

    return (
        <div className="min-h-screen relative w-full font-[Assistant] flex flex-col" style={bgStyle}>
            {showGradient && (
                <GradientOverlay
                    sidebarColor={theme.sidebarColor}
                    hue={gradientHue}
                    height={gradientHeight}
                    opacity={gradientOpacity}
                />
            )}

            <div className="relative z-10 container mx-auto px-8 py-12 flex-grow flex flex-col">
                <div className="text-center mb-12 flex-shrink-0">
                    <div className="flex items-center justify-center gap-4">
                        {logoUrl && (
                            <img
                                src={logoUrl}
                                alt={appName}
                                className="h-16 w-auto rounded-lg object-contain"
                                onError={(e: any) => e.target.style.display = 'none'}
                            />
                        )}
                        {fetchedAcademyName && (
                            <h1 className="font-bold" style={{ color: headerColor, fontSize: '3rem' }}>{fetchedAcademyName}</h1>
                        )}
                    </div>
                    <h2
                        className={`text-4xl mt-12 font-[Assistant] ${headerFontClass}`}
                        style={{ color: headerColor }}
                    >
                        {publicPlansPage?.pageHeader || t('plans.selectBestPlan')}
                    </h2>
                </div>

                <div className="flex-grow flex items-center justify-center">
                    <div className="flex flex-wrap justify-center gap-12 md:gap-6 max-w-7xl mx-auto">
                        {plans.map((plan: any) => {
                            const currency = plan.currency === 'USD' ? '$' : plan.currency === 'EUR' ? '€' : plan.currency;
                            const priceDisplay = plan.priceMonthly ? `${currency}${plan.priceMonthly}` : 'Free';
                            const showBillingCycle = !!plan.billingCycle && plan.billingCycle.trim() !== '';

                            return (
                                <div
                                    key={plan.id}
                                    className="w-full md:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] min-w-[280px] max-w-[350px] rounded-2xl shadow-xl flex flex-col relative transform hover:-translate-y-1 transition-transform duration-300 visible"
                                    style={{ backgroundColor: cardBgColor, border: `1px solid ${cardBorderColor}` }}
                                >
                                    {plan.tagText && (
                                        <div
                                            className="absolute top-0 right-8 transform -translate-y-1/2 px-4 py-1 rounded text-base font-bold shadow-sm z-20 whitespace-nowrap"
                                            style={{ backgroundColor: plan.tagColor || '#10B981', color: plan.tagTextColor || '#ffffff' }}
                                        >
                                            {plan.tagText}
                                        </div>
                                    )}

                                    <div className="p-6 flex-grow rounded-t-2xl" style={{ color: cardFontColor }}>
                                        <h3 className="text-xl font-bold mb-2">{plan.displayName}</h3>
                                        <div className="flex items-baseline mb-4">
                                            <span className="text-[50px] font-extrabold leading-none">{priceDisplay}</span>
                                            {showBillingCycle && (
                                                <span className="ml-1 opacity-70">/ {plan.billingCycle}</span>
                                            )}
                                        </div>
                                        <p className="text-sm mb-6 opacity-80">{plan.description}</p>

                                        <ul className="space-y-3 mb-6">
                                            {plan.bullets
                                                .filter((b: string) => b && b.trim() !== '')
                                                .map((bullet: string, idx: number) => (
                                                    <li key={idx} className="flex items-start text-sm opacity-80">
                                                        <FiCheck aria-hidden="true" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                                                        <span>{bullet}</span>
                                                    </li>
                                                ))}
                                        </ul>
                                    </div>

                                    <div className="p-6 bg-black/5 mt-auto flex justify-center rounded-b-2xl">
                                        {selectedOrganization?.planId === plan.id ? (
                                            <div
                                                className="inline-block w-full px-8 py-3 font-bold text-center rounded-lg shadow-sm opacity-50 cursor-not-allowed"
                                                style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
                                            >
                                                {t('plans.currentPlan')}
                                            </div>
                                        ) : (
                                            <Link
                                                to={user ? `/checkout?planId=${plan.id}` : `/register?flow=checkout&planId=${plan.id}`}
                                                className="inline-block w-full px-8 py-3 font-bold text-center rounded-lg transition-all shadow-md hover:brightness-90"
                                                style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
                                            >
                                                {t('plans.selectPlan')}
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Single-plan view ─────────────────────────────────────────────────────────

const SinglePlanView: React.FC<{ data: any; user: any }> = ({ data, user }) => {
    const { t } = useTranslation();
    const { theme, publicPlansPage, appName, logoUrl, plan, academyName } = data;

    const bgStyle = { backgroundColor: theme.sidebarColor || '#004e89' };
    const cardBgColor = publicPlansPage?.cardBackgroundColor || '#ffffff00';
    const cardBorderColor = publicPlansPage?.cardBorderColor || '#e5e7eb';
    const cardFontColor = publicPlansPage?.cardFontColor || '#1f2937';
    const buttonBgColor = publicPlansPage?.buttonBackgroundColor || '#2563EB';
    const buttonTextColor = publicPlansPage?.buttonTextColor || '#FFFFFF';
    const headerColor = theme.displayNameColor || '#ffffff';
    const showGradient = publicPlansPage?.enableGradient !== false;
    const gradientHue = publicPlansPage?.gradientHueRotation ?? 270;
    const gradientHeight = publicPlansPage?.gradientHeight ?? 85;
    const gradientOpacity = publicPlansPage?.gradientMaskOpacity ?? 40;

    const currency = plan.currency === 'USD' ? '$' : plan.currency === 'EUR' ? '€' : plan.currency || '';
    const priceDisplay = plan.priceMonthly ? `${currency}${plan.priceMonthly}` : 'Free';
    const showBillingCycle = !!plan.billingCycle && plan.billingCycle.trim() !== '';

    const advantages: string[] = [];
    if (plan.maxUsers > 0) advantages.push(`Up to ${plan.maxUsers} users`);
    if (plan.courseCount > 0) advantages.push(`${plan.courseCount} course${plan.courseCount !== 1 ? 's' : ''}`);
    if (plan.mentorCount > 0) advantages.push(`${plan.mentorCount} AI mentor${plan.mentorCount !== 1 ? 's' : ''}`);
    if (plan.questionnaireCount > 0) advantages.push(`${plan.questionnaireCount} questionnaire${plan.questionnaireCount !== 1 ? 's' : ''}`);

    return (
        <div className="min-h-screen relative w-full font-[Assistant] flex flex-col" style={bgStyle}>
            {showGradient && (
                <GradientOverlay
                    sidebarColor={theme.sidebarColor}
                    hue={gradientHue}
                    height={gradientHeight}
                    opacity={gradientOpacity}
                />
            )}

            <div className="relative z-10 container mx-auto px-8 py-12 flex-grow flex flex-col items-center justify-center">
                <div className="flex items-center gap-4 mb-8">
                    {logoUrl && (
                        <img
                            src={logoUrl}
                            alt={appName}
                            className="h-16 w-auto rounded-lg object-contain"
                            onError={(e: any) => e.target.style.display = 'none'}
                        />
                    )}
                    {(academyName || appName) && (
                        <h1 className="font-bold" style={{ color: headerColor, fontSize: '3rem' }}>
                            {academyName || appName}
                        </h1>
                    )}
                </div>

                <div
                    className="w-full max-w-sm rounded-2xl shadow-xl flex flex-col relative"
                    style={{ backgroundColor: cardBgColor, border: `1px solid ${cardBorderColor}` }}
                >
                    <div className="p-6 flex-grow rounded-t-2xl" style={{ color: cardFontColor }}>
                        <h3 className="text-xl font-bold mb-2">{plan.displayName}</h3>
                        <div className="flex items-baseline mb-6">
                            <span className="text-[50px] font-extrabold leading-none">{priceDisplay}</span>
                            {showBillingCycle && (
                                <span className="ml-1 opacity-70">/ {plan.billingCycle}</span>
                            )}
                        </div>

                        {advantages.length > 0 && (
                            <ul className="space-y-3 mb-6" aria-label="Plan features">
                                {advantages.map((item, idx) => (
                                    <li key={idx} className="flex items-start text-sm opacity-80">
                                        <FiCheck aria-hidden="true" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="p-6 bg-black/5 mt-auto flex justify-center rounded-b-2xl">
                        <Link
                            to={user ? `/checkout?planId=${plan.id}` : `/register?flow=checkout&planId=${plan.id}`}
                            className="inline-block w-full px-8 py-3 font-bold text-center rounded-lg transition-all shadow-md hover:brightness-90"
                            style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
                        >
                            {t('common.continue')}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicPlansPage;
