
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../../hooks/useData';
import { useAuth } from '../../hooks/useAuth';
import { FiSave, FiLoader, FiAlertCircle, FiCheckCircle, FiKey, FiCopy, FiRefreshCw, FiCreditCard, FiList, FiPlusCircle, FiEdit, FiTrash2, FiGlobe, FiExternalLink, FiArrowUp, FiArrowDown, FiCheck, FiDownload, FiEye, FiEyeOff, FiArchive, FiLink, FiChevronDown, FiChevronUp, FiXCircle } from 'react-icons/fi';
import { Plan, PublicPlanConfig } from '../../types';
import TutorialSection from '../common/TutorialSection';
import { FaWordpressSimple } from 'react-icons/fa';
import PlanModal from './course/billing/PlanModal';
import { CURRENCIES, FONT_WEIGHTS, ModalWrapper, InfoTooltip } from './course/billing/Shared';
import ConfirmationModal from './shared/ConfirmationModal';
import ArchiveRestoreModal from './shared/ArchiveRestoreModal';

const BillingSettingsPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { 
        academySettings, 
        updateAcademySettings,
        regenerateApiKey, 
        isLoading: isDataLoading, 
        dataError, 
        clearDataError,
        plans,
        archivedPlans, fetchArchivedPlans, restorePlan,
        addPlan,
        updatePlan,
        deletePlan,
        confirmArchivePlan,
        courses,
        chatPersonas,
        questionnaires,
        tutorialSettings,
        systemSettings,
    } = useData();
    
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
    const [publicPageFeedback, setPublicPageFeedback] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
    const [modalError, setModalError] = useState<string|null>(null);
    const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: Plan; dependencies?: { name: string; id: string }[] } | null>(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [showDeletePublicPlanConfirm, setShowDeletePublicPlanConfirm] = useState<number | null>(null);
    const [showApiKey, setShowApiKey] = useState(false);

    // Public Plans Page State
    const [isPublicPageSettingsExpanded, setIsPublicPageSettingsExpanded] = useState(false);
    const [publicPageEnabled, setPublicPageEnabled] = useState(false);
    const [publicPageEnableGradient, setPublicPageEnableGradient] = useState(true);
    const [publicPageHeader, setPublicPageHeader] = useState('');
    const [publicPageFontWeight, setPublicPageFontWeight] = useState('font-extrabold');
    
    // Global Design State
    const [cardBackgroundColor, setCardBackgroundColor] = useState('#ffffff00');
    const [cardBorderColor, setCardBorderColor] = useState('#e5e7eb');
    const [cardFontColor, setCardFontColor] = useState('#1f2937');
    const [buttonBackgroundColor, setButtonBackgroundColor] = useState('#2563EB'); // Default blue-600
    const [buttonTextColor, setButtonTextColor] = useState('#FFFFFF'); // Default white

    const [selectedPublicPlans, setSelectedPublicPlans] = useState<PublicPlanConfig[]>([]);
    const [selectedPlanToAdd, setSelectedPlanToAdd] = useState('');
    
    // Decoupled Gradient Control State for Public Page
    const [publicPageHue, setPublicPageHue] = useState(270);
    const [publicPageHeight, setPublicPageHeight] = useState(85);
    const [publicPageOpacity, setPublicPageOpacity] = useState(40);
    
    const [expandedPublicPlanIndex, setExpandedPublicPlanIndex] = useState<number | null>(null);

    useEffect(() => {
        if (dataError && !editingPlan) {
            setFeedback({ type: 'error', text: dataError });
            clearDataError();
        }
    }, [dataError, clearDataError, editingPlan]);

    useEffect(() => {
        if (academySettings) {
            // Restore public page settings
            if (academySettings.publicPlansPage) {
                setPublicPageEnabled(academySettings.publicPlansPage.enabled);
                setPublicPageEnableGradient(academySettings.publicPlansPage.enableGradient !== undefined ? academySettings.publicPlansPage.enableGradient : true);
                setPublicPageHeader(academySettings.publicPlansPage.pageHeader || '');
                setPublicPageFontWeight(academySettings.publicPlansPage.headerFontWeight || 'font-extrabold');
                setSelectedPublicPlans(academySettings.publicPlansPage.selectedPlans || []);

                if (academySettings.publicPlansPage.customized) {
                    // Admin has explicitly saved these settings — use stored values
                    setCardBackgroundColor(academySettings.publicPlansPage.cardBackgroundColor || '#ffffff00');
                    setCardBorderColor(academySettings.publicPlansPage.cardBorderColor || '#e5e7eb');
                    setCardFontColor(academySettings.publicPlansPage.cardFontColor || '#1f2937');
                    setButtonBackgroundColor(academySettings.publicPlansPage.buttonBackgroundColor || '#2563EB');
                    setButtonTextColor(academySettings.publicPlansPage.buttonTextColor || '#FFFFFF');
                } else {
                    // Not yet customized — mirror the academy theme
                    const accent = academySettings.sidebarLinkColor || '#e5e7eb';
                    setCardBackgroundColor('#ffffff');
                    setCardBorderColor(accent);
                    setCardFontColor(accent);
                    setButtonBackgroundColor(accent);
                    setButtonTextColor(academySettings.sidebarColor || '#004e89');
                }
                
                // Initialize decoupled gradient settings, fallback to sidebar settings if not present (backward compatibility)
                setPublicPageHue(academySettings.publicPlansPage.gradientHueRotation ?? (academySettings.sidebarHueRotation || 270));
                setPublicPageHeight(academySettings.publicPlansPage.gradientHeight ?? (academySettings.sidebarGradientHeight || 85));
                setPublicPageOpacity(academySettings.publicPlansPage.gradientMaskOpacity ?? (academySettings.sidebarGradientMaskOpacity || 40));
            } else {
                // publicPlansPage not yet created — mirror academy theme for colors
                const accent = academySettings.sidebarLinkColor || '#e5e7eb';
                setCardBackgroundColor('#ffffff');
                setCardBorderColor(accent);
                setCardFontColor(accent);
                setButtonBackgroundColor(accent);
                setButtonTextColor(academySettings.sidebarColor || '#004e89');
                setPublicPageHue(academySettings.sidebarHueRotation || 270);
                setPublicPageHeight(academySettings.sidebarGradientHeight || 85);
                setPublicPageOpacity(academySettings.sidebarGradientMaskOpacity || 40);
            }
        }
    }, [academySettings]);

    // Auto-hide public page feedback after 5 seconds
    useEffect(() => {
        if (publicPageFeedback?.type === 'success') {
            const timer = setTimeout(() => {
                setPublicPageFeedback(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [publicPageFeedback]);

    const handleRegenerateKey = async () => {
        setFeedback(null);
        const updatedSettings = await regenerateApiKey();
        if (updatedSettings) {
            setFeedback({ type: 'success', text: t('admin.billing.apiKeyRegenerated') });
        }
        setShowRegenConfirm(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setFeedback({ type: 'success', text: t('admin.billing.copiedToClipboard') });
        }, () => {
            setFeedback({ type: 'error', text: t('admin.billing.copyFailed') });
        });
    };

    const handleSavePlan = async () => {
        if (!editingPlan) return;
        setModalError(null);
        setIsLoading(true);
        const result = editingPlan.id 
            ? await updatePlan(editingPlan.id, editingPlan) 
            : await addPlan(editingPlan);
        
        setIsLoading(false);
        if (result) {
            setFeedback({ type: 'success', text: t('admin.billing.planSaved', { name: (result as Plan).name }) });
            setEditingPlan(null);
        } else {
            setModalError(dataError || t('admin.billing.planSaveFailed'));
        }
    };
    
    const handleAttemptArchive = async (plan: Plan) => {
        clearFeedback();
        setIsLoading(true);
        const result = await deletePlan(plan.id);
        setIsLoading(false);
        if (result.isConflict) {
            setArchiveConfirmData({ resource: plan, dependencies: result.dependencies.organizations || [] });
        } else if (!dataError) {
            setArchiveConfirmData({ resource: plan });
        }
    };

    const handleConfirmArchive = async () => {
        if (!archiveConfirmData) return;
        setIsLoading(true);
        const success = await confirmArchivePlan(archiveConfirmData.resource.id);
        setArchiveConfirmData(null);
        if (success) {
            setFeedback({ type: 'success', text: t('admin.billing.planArchived') });
        }
        setIsLoading(false);
    };


    // --- Public Plans Handlers ---

    // Helper functions for HEX/Alpha color
    const getHexColor = (color: string) => {
        if (!color) return '#ffffff';
        return color.substring(0, 7);
    };

    const getAlphaValue = (color: string) => {
        if (!color || color.length !== 9) return 100;
        const alphaHex = color.substring(7, 9);
        return Math.round((parseInt(alphaHex, 16) / 255) * 100);
    };

    const handleBgColorChange = (newHex: string) => {
        const alpha = getAlphaValue(cardBackgroundColor);
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0');
        setCardBackgroundColor(`${newHex}${alpha === 100 ? '' : alphaHex}`);
    };

    const handleOpacityChange = (newAlpha: number) => {
        const hex = getHexColor(cardBackgroundColor);
        if (newAlpha === 100) {
            setCardBackgroundColor(hex);
        } else {
            const alphaHex = Math.round((newAlpha / 100) * 255).toString(16).padStart(2, '0');
            setCardBackgroundColor(`${hex}${alphaHex}`);
        }
    };

    const handlePublicPageToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isEnabled = e.target.checked;
        setPublicPageEnabled(isEnabled);

        setIsLoading(true);
        setFeedback(null);
        try {
            await updateAcademySettings({
                publicPlansPage: {
                    enabled: isEnabled,
                    enableGradient: publicPageEnableGradient,
                    gradientHueRotation: publicPageHue,
                    gradientHeight: publicPageHeight,
                    gradientMaskOpacity: publicPageOpacity,
                    pageHeader: publicPageHeader,
                    headerFontWeight: publicPageFontWeight,
                    cardBackgroundColor,
                    cardBorderColor,
                    cardFontColor,
                    buttonBackgroundColor,
                    buttonTextColor,
                    customized: academySettings?.publicPlansPage?.customized ?? false,
                    selectedPlans: selectedPublicPlans
                }
            });
            setFeedback({ type: 'success', text: isEnabled ? t('admin.billing.publicPageEnabled') : t('admin.billing.publicPageDisabled') });
        } catch (error: any) {
            setFeedback({ type: 'error', text: error.message || (isEnabled ? t('admin.billing.publicPageEnableFailed') : t('admin.billing.publicPageDisableFailed')) });
            setPublicPageEnabled(!isEnabled); // Revert switch visually
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddPublicPlan = () => {
        if (!selectedPlanToAdd) return;
        if (selectedPublicPlans.length >= 4) {
            setPublicPageFeedback({ type: 'error', text: t('admin.billing.maxPublicPlansReached') });
            return;
        }
        const originalPlan = plans.find(p => p.id === selectedPlanToAdd);
        if (!originalPlan) return;

        const newConfig: PublicPlanConfig = {
            planId: originalPlan.id,
            displayName: originalPlan.name,
            billingCycle: originalPlan.planType === 'subscription' ? 'Monthly' : '', // Default to Monthly for subs, empty for others
            description: '',
            bullets: ['Full feature access', 'Unlimited users'],
            buttonText: 'Start Free Trial',
            tagText: '',
            tagColor: '#10B981', // default green
            tagTextColor: '#ffffff', // default white
        };

        setSelectedPublicPlans([...selectedPublicPlans, newConfig]);
        setSelectedPlanToAdd('');
        // Auto-expand the newly added plan. Since it's appended to the end, the index is length.
        setExpandedPublicPlanIndex(selectedPublicPlans.length);
    };

    const handleDuplicatePublicPlan = (index: number) => {
        if (selectedPublicPlans.length >= 4) {
            setPublicPageFeedback({ type: 'error', text: t('admin.billing.maxPublicPlansReached') });
            return;
        }
        const configToDuplicate = selectedPublicPlans[index];
        const newConfig: PublicPlanConfig = JSON.parse(JSON.stringify(configToDuplicate));

        setSelectedPublicPlans([...selectedPublicPlans, newConfig]);
        setPublicPageFeedback({ type: 'success', text: t('admin.billing.publicPlanDuplicated') });
    };

    const handleMovePublicPlan = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === selectedPublicPlans.length - 1) return;

        const newPlans = [...selectedPublicPlans];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        // Swap elements
        [newPlans[index], newPlans[targetIndex]] = [newPlans[targetIndex], newPlans[index]];
        
        // If the moved item was expanded, move the expanded index too
        if (expandedPublicPlanIndex === index) {
            setExpandedPublicPlanIndex(targetIndex);
        } else if (expandedPublicPlanIndex === targetIndex) {
            setExpandedPublicPlanIndex(index);
        }

        setSelectedPublicPlans(newPlans);
    };

    const handleRemovePublicPlan = () => {
        if (showDeletePublicPlanConfirm === null) return;
        setSelectedPublicPlans(prev => prev.filter((_, idx) => idx !== showDeletePublicPlanConfirm));
        
        // Adjust expanded index if necessary
        if (expandedPublicPlanIndex === showDeletePublicPlanConfirm) {
            setExpandedPublicPlanIndex(null);
        } else if (expandedPublicPlanIndex !== null && expandedPublicPlanIndex > showDeletePublicPlanConfirm) {
            setExpandedPublicPlanIndex(expandedPublicPlanIndex - 1);
        }

        setShowDeletePublicPlanConfirm(null);
        setPublicPageFeedback({ type: 'success', text: t('admin.billing.publicPlanRemoved') });
    };

    const handleUpdatePublicPlanConfig = (index: number, field: keyof PublicPlanConfig, value: any) => {
        const updatedPlans = [...selectedPublicPlans];
        
        if (field === 'planId') {
            const selectedPlanObject = plans.find(p => p.id === value);
            updatedPlans[index] = { 
                ...updatedPlans[index], 
                planId: value,
                // Automatically update the display name only if a plan is found
                displayName: selectedPlanObject ? selectedPlanObject.name : updatedPlans[index].displayName
            };
        } else {
            updatedPlans[index] = { ...updatedPlans[index], [field]: value };
        }
        
        setSelectedPublicPlans(updatedPlans);
    };

    const handleBulletsChange = (index: number, text: string) => {
        const bullets = text.split('\n');
        handleUpdatePublicPlanConfig(index, 'bullets', bullets);
    };

    const handleSavePublicSettings = async () => {
        setIsLoading(true);
        setPublicPageFeedback(null);
        try {
            await updateAcademySettings({
                publicPlansPage: {
                    enabled: publicPageEnabled,
                    enableGradient: publicPageEnableGradient,
                    gradientHueRotation: publicPageHue,
                    gradientHeight: publicPageHeight,
                    gradientMaskOpacity: publicPageOpacity,
                    pageHeader: publicPageHeader,
                    headerFontWeight: publicPageFontWeight,
                    cardBackgroundColor,
                    cardBorderColor,
                    cardFontColor,
                    buttonBackgroundColor,
                    buttonTextColor,
                    customized: true,
                    selectedPlans: selectedPublicPlans
                }
            });
            setPublicPageFeedback({ type: 'success', text: t('admin.billing.publicPageSettingsSaved') });
            setExpandedPublicPlanIndex(null);
            setIsPublicPageSettingsExpanded(false); // Collapse section on save
        } catch (error: any) {
            setPublicPageFeedback({ type: 'error', text: error.message || t('admin.billing.publicPageSettingsSaveFailed') });
        } finally {
            setIsLoading(false);
        }
    };

    const clearFeedback = () => {
        setFeedback(null);
        setPublicPageFeedback(null);
        if (dataError) clearDataError();
    };
    
    // Construct public URL
    const publicUrl = academySettings?.appName ? `${window.location.origin}/public/${encodeURIComponent(academySettings.appName)}` : '';
    const activePlans = plans.filter(p => p.status !== 'archived');

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                        <FiCreditCard className="mr-3 text-purple-500"/> {t('admin.billing.title')}
                    </h1>
                    <div className="mt-4">
                        <TutorialSection videoUrl={tutorialSettings?.plansBilling?.videoUrl} />
                    </div>
                </div>
            </div>

            {/* Main Scrolling Content */}
            <div className="px-4 md:px-8 pb-8 pt-4">
                <div className="max-w-4xl mx-auto">
                    {feedback && (
                        <div className={`p-3 mb-6 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                            {feedback.text}
                            <button onClick={clearFeedback} className="ml-auto text-lg font-semibold">&times;</button>
                        </div>
                    )}
                    
                    {/* Plans Management Section */}
                    <div className="mb-10 p-6 bg-white shadow-lg rounded-lg">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-4">
                            <h2 className="text-xl font-semibold text-gray-700 flex items-center"><FiList className="mr-2 text-purple-600"/> {t('admin.billing.plansManagement')}</h2>
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <button onClick={() => setIsArchiveModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm w-full sm:w-auto">
                                    <FiArchive className="mr-2"/> {t('admin.billing.viewArchived')}
                                </button>
                                <button onClick={() => setEditingPlan({name: '', planType: 'subscription', hasAllChatAccess: true, hasAllQuestionnairesAccess: true, accessibleCourseIds: [], hasAllCoursesAccess: true, currency: 'USD', isForSingleUser: false })} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center w-full sm:w-auto">
                                    <FiPlusCircle className="mr-2" /> {t('admin.billing.addPlan')}
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">{t('admin.billing.plansManagementDescription')}</p>
                        <div className="bg-gray-50 shadow-inner rounded-lg overflow-x-auto custom-scrollbar">
                             {isDataLoading && activePlans.length === 0 ? <div className="p-4 text-center"><FiLoader className="animate-spin h-6 w-6 text-purple-500 mx-auto"/></div> :
                              activePlans.length === 0 ? <p className="p-4 text-center text-gray-500">{t('admin.billing.noActivePlans')}</p> :
                              <table className="min-w-full divide-y divide-gray-200">
                                 <thead className="bg-gray-100 relative z-10">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('common.name')}</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{t('admin.billing.planType')}</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">{t('admin.billing.maxUsers')}</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">{t('admin.billing.price')}</th>
                                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                            <div className="flex items-center justify-center">
                                                {t('admin.billing.paymentLink')}
                                                <InfoTooltip text={t('admin.billing.paymentLinkTooltip')} />
                                            </div>
                                        </th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
                                    </tr>
                                 </thead>
                                 <tbody className="bg-white divide-y divide-gray-200">
                                    {activePlans.map(plan => {
                                        const currencySymbol = CURRENCIES.find(c => c.code === plan.currency)?.symbol || '$';
                                        // Link to single-plan public page for this plan
                                        const encodedName = academySettings?.appName ? encodeURIComponent(academySettings.appName) : '';
                                        const paymentLink = encodedName
                                            ? `${window.location.origin}/public/${encodedName}/plan/${plan.id}`
                                            : `${window.location.origin}/register?flow=checkout&planId=${plan.id}`;
                                        
                                        return (
                                        <tr key={plan.id}>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">
                                                {plan.name}
                                                {plan.isForSingleUser && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">{t('admin.billing.singleUser')}</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 capitalize">{plan.planType?.replace('-', ' ')}</td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-600">{plan.maxUsers === 0 ? t('admin.billing.unlimited') : plan.maxUsers}</td>
                                            <td className="px-4 py-3 text-center text-sm text-gray-600">{plan.priceMonthly ? `${currencySymbol}${plan.priceMonthly}` : '-'}</td>
                                            <td className="px-4 py-3 text-center text-sm">
                                                <button 
                                                    onClick={() => copyToClipboard(paymentLink)}
                                                    className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100"
                                                    title={t('admin.billing.copyPaymentLink')}
                                                >
                                                    <FiLink size={16}/>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-1">
                                                <button onClick={() => setEditingPlan(plan)} className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100"><FiEdit size={16}/></button>
                                                <button onClick={() => handleAttemptArchive(plan)} className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100"><FiTrash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    )})}
                                 </tbody>
                              </table>
                             }
                        </div>
                    </div>

                    {/* Public Plans Page Section */}
                    <div className="mb-10 p-6 bg-white shadow-lg rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-700 flex items-center"><FiGlobe className="mr-2 text-blue-500"/> {t('admin.billing.publicPlansPage')}</h2>
                            <div className="flex items-center space-x-2">
                                <label className="flex items-center cursor-pointer">
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only" checked={publicPageEnabled} onChange={handlePublicPageToggle} />
                                        <div className={`block w-10 h-6 rounded-full transition-colors ${publicPageEnabled ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${publicPageEnabled ? 'transform translate-x-4' : ''}`}></div>
                                    </div>
                                    <div className="ml-2 text-sm font-medium text-gray-700">{t('admin.billing.enablePage')}</div>
                                </label>
                                {publicPageEnabled && !isPublicPageSettingsExpanded && (
                                    <button
                                        type="button"
                                        onClick={() => setIsPublicPageSettingsExpanded(true)}
                                        className="p-2 rounded-full text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                                        aria-controls="public-page-settings"
                                        title={t('admin.billing.editPublicPageSettings')}
                                    >
                                        <FiEdit size={20} />
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-4">{t('admin.billing.publicPlansPageDescription')}</p>

                        {publicPageEnabled && (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm flex items-center justify-between mb-6">
                                <span className="text-blue-800 break-all mr-2">{t('admin.billing.publicLink')}: <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="underline font-mono">{publicUrl}</a></span>
                                <div className="flex space-x-2 flex-shrink-0">
                                    <button onClick={() => copyToClipboard(publicUrl)} className="text-blue-600 hover:text-blue-800 p-1"><FiCopy/></button>
                                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 p-1"><FiExternalLink/></a>
                                </div>
                            </div>
                        )}

                        {publicPageEnabled && isPublicPageSettingsExpanded && (
                            <div id="public-page-settings" className="animate-fade-in-down space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.billing.pageTitle')}</label>
                                        <input 
                                            type="text" 
                                            value={publicPageHeader}
                                            onChange={(e) => setPublicPageHeader(e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md"
                                            placeholder={t('admin.billing.pageTitlePlaceholder')}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.billing.titleFontWeight')}</label>
                                        <select
                                            value={publicPageFontWeight}
                                            onChange={(e) => setPublicPageFontWeight(e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md bg-white"
                                        >
                                            {FONT_WEIGHTS.map(fw => (
                                                <option key={fw.value} value={fw.value}>{fw.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="pt-2">
                                     <label className="flex items-center cursor-pointer w-fit">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" checked={publicPageEnableGradient} onChange={(e) => setPublicPageEnableGradient(e.target.checked)} />
                                            <div className={`block w-10 h-6 rounded-full transition-colors ${publicPageEnableGradient ? 'bg-purple-500' : 'bg-gray-300'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${publicPageEnableGradient ? 'transform translate-x-4' : ''}`}></div>
                                        </div>
                                        <div className="ml-2 text-sm font-medium text-gray-700">{t('admin.billing.enableGradientBackground')}</div>
                                    </label>
                                </div>

                                {/* Gradient Settings Controls - DECOUPLED */}
                                {publicPageEnableGradient && (
                                    <div className="ml-8 space-y-4 pt-2 border-l-2 border-gray-100 pl-4 bg-gray-50 p-4 rounded-r-lg">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Hue Rotation */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.colorHue')}</label>
                                                <div className="flex items-center space-x-2">
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="360" 
                                                        value={publicPageHue} 
                                                        onChange={(e) => setPublicPageHue(parseInt(e.target.value))} 
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <span className="text-xs text-gray-600 w-8">{publicPageHue}°</span>
                                                </div>
                                            </div>

                                            {/* Height */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.heightPosition')}</label>
                                                <div className="flex items-center space-x-2">
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="100" 
                                                        value={publicPageHeight} 
                                                        onChange={(e) => setPublicPageHeight(parseInt(e.target.value))} 
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <span className="text-xs text-gray-600 w-8">{publicPageHeight}%</span>
                                                </div>
                                            </div>

                                            {/* Mask Opacity */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.opacity')}</label>
                                                <div className="flex items-center space-x-2">
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="100" 
                                                        value={publicPageOpacity} 
                                                        onChange={(e) => setPublicPageOpacity(parseInt(e.target.value))} 
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <span className="text-xs text-gray-600 w-8">{publicPageOpacity}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-gray-100 pt-4">
                                    <h3 className="text-md font-semibold text-gray-700 mb-3">{t('admin.billing.planCardButtonStyling')}</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.cardBackground')}</label>
                                            <div className="flex items-center space-x-2 mb-1">
                                                <input 
                                                    type="color" 
                                                    value={getHexColor(cardBackgroundColor)} 
                                                    onChange={(e) => handleBgColorChange(e.target.value)} 
                                                    className="h-8 w-10 p-0 border border-gray-300 rounded cursor-pointer"
                                                />
                                                <input 
                                                    type="text" 
                                                    value={cardBackgroundColor} 
                                                    readOnly
                                                    className="w-24 p-1 border rounded text-xs bg-gray-50 text-gray-500"
                                                />
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-xs text-gray-500">{t('admin.billing.opacity')}:</span>
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="100" 
                                                    value={getAlphaValue(cardBackgroundColor)} 
                                                    onChange={(e) => handleOpacityChange(parseInt(e.target.value))} 
                                                    className="w-20 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                />
                                                <span className="text-xs text-gray-600">{getAlphaValue(cardBackgroundColor)}%</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.cardBorder')}</label>
                                            <div className="flex items-center space-x-2">
                                                <input type="color" value={cardBorderColor} onChange={(e) => setCardBorderColor(e.target.value)} className="h-8 w-10 p-0 border border-gray-300 rounded cursor-pointer"/>
                                                <input type="text" value={cardBorderColor} onChange={(e) => setCardBorderColor(e.target.value)} className="w-20 p-1 border rounded text-xs"/>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.cardText')}</label>
                                            <div className="flex items-center space-x-2">
                                                <input type="color" value={cardFontColor} onChange={(e) => setCardFontColor(e.target.value)} className="h-8 w-10 p-0 border border-gray-300 rounded cursor-pointer"/>
                                                <input type="text" value={cardFontColor} onChange={(e) => setCardFontColor(e.target.value)} className="w-20 p-1 border rounded text-xs"/>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.buttonBackground')}</label>
                                            <div className="flex items-center space-x-2">
                                                <input type="color" value={buttonBackgroundColor} onChange={(e) => setButtonBackgroundColor(e.target.value)} className="h-8 w-10 p-0 border border-gray-300 rounded cursor-pointer"/>
                                                <input type="text" value={buttonBackgroundColor} onChange={(e) => setButtonBackgroundColor(e.target.value)} className="w-20 p-1 border rounded text-xs"/>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.buttonText')}</label>
                                            <div className="flex items-center space-x-2">
                                                <input type="color" value={buttonTextColor} onChange={(e) => setButtonTextColor(e.target.value)} className="h-8 w-10 p-0 border border-gray-300 rounded cursor-pointer"/>
                                                <input type="text" value={buttonTextColor} onChange={(e) => setButtonTextColor(e.target.value)} className="w-20 p-1 border rounded text-xs"/>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 pt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.billing.selectPlansToDisplay')}</label>
                                    <div className="flex gap-2 mb-4">
                                        <select 
                                            value={selectedPlanToAdd} 
                                            onChange={(e) => setSelectedPlanToAdd(e.target.value)} 
                                            className="flex-grow p-2 border border-gray-300 rounded-md bg-white"
                                            disabled={selectedPublicPlans.length >= 4}
                                        >
                                            <option value="">{t('admin.billing.addAPlan')}</option>
                                            {plans.filter(p => !selectedPublicPlans.some(sp => sp.planId === p.id)).map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleAddPublicPlan}
                                            disabled={!selectedPlanToAdd || selectedPublicPlans.length >= 4}
                                            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {t('common.add')}
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {selectedPublicPlans.map((config, index) => {
                                            const isExpanded = expandedPublicPlanIndex === index;

                                            return (
                                                <div key={`${config.planId}-${index}`} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                                                    <div className="flex justify-between items-center p-3 bg-white border-b border-gray-100">
                                                        <span className="font-semibold text-gray-700 flex items-center">
                                                            <span className="flex items-center justify-center w-5 h-5 bg-gray-200 text-gray-600 rounded-full text-xs mr-2">{index + 1}</span>
                                                            {config.displayName}
                                                        </span>
                                                        <div className="flex items-center space-x-1">
                                                            {expandedPublicPlanIndex === null && (
                                                                <div className="flex items-center space-x-1 mr-2 border-r pr-2 border-gray-200">
                                                                    <button
                                                                        onClick={() => handleMovePublicPlan(index, 'up')}
                                                                        disabled={index === 0}
                                                                        className="text-gray-500 hover:text-blue-600 p-1 disabled:opacity-30 disabled:hover:text-gray-500"
                                                                        title={t('admin.billing.moveUp')}
                                                                        aria-label={t('admin.billing.moveUp')}
                                                                    >
                                                                        <FiArrowUp/>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMovePublicPlan(index, 'down')}
                                                                        disabled={index === selectedPublicPlans.length - 1}
                                                                        className="text-gray-500 hover:text-blue-600 p-1 disabled:opacity-30 disabled:hover:text-gray-500"
                                                                        title={t('admin.billing.moveDown')}
                                                                        aria-label={t('admin.billing.moveDown')}
                                                                    >
                                                                        <FiArrowDown/>
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <button onClick={() => handleDuplicatePublicPlan(index)} className="text-gray-500 hover:text-green-600 p-1" title={t('admin.billing.duplicate')} aria-label={t('admin.billing.duplicate')}>
                                                                <FiCopy/>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedPublicPlanIndex(isExpanded ? null : index)}
                                                                className={`p-1 rounded-full ${isExpanded ? 'text-red-500 hover:text-red-700 hover:bg-red-100' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-100'}`}
                                                                title={isExpanded ? t('admin.billing.closeSettings') : t('admin.billing.editPlanDisplay')}
                                                                aria-label={isExpanded ? t('admin.billing.closeSettings') : t('admin.billing.editPlanDisplay')}
                                                            >
                                                                {isExpanded ? <FiXCircle /> : <FiEdit />}
                                                            </button>
                                                            <button onClick={() => setShowDeletePublicPlanConfirm(index)} className="text-red-500 hover:text-red-700 p-1" title={t('common.remove')} aria-label={t('common.remove')}>
                                                                <FiTrash2/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    {isExpanded && (
                                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                                            <div className="col-span-2">
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.linkedPlan')}</label>
                                                                <select
                                                                    value={config.planId}
                                                                    onChange={(e) => handleUpdatePublicPlanConfig(index, 'planId', e.target.value)}
                                                                    className="w-full p-2 border border-gray-300 rounded-md bg-white"
                                                                >
                                                                    {plans.map(p => (
                                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                                    ))}
                                                                </select>
                                                                <p className="text-[10px] text-gray-400 mt-1">{t('admin.billing.linkedPlanHint')}</p>
                                                            </div>
                                                            <div className="col-span-2 md:col-span-1">
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.displayName')}</label>
                                                                <input type="text" value={config.displayName} onChange={(e) => handleUpdatePublicPlanConfig(index, 'displayName', e.target.value)} className="w-full p-2 border rounded-md" />
                                                            </div>
                                                            <div className="col-span-2 md:col-span-1">
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.billingCycleLabel')}</label>
                                                                <select
                                                                    value={config.billingCycle}
                                                                    onChange={(e) => handleUpdatePublicPlanConfig(index, 'billingCycle', e.target.value)}
                                                                    className="w-full p-2 border rounded-md bg-white"
                                                                >
                                                                    <option value="">{t('admin.billing.billingCycleNone')}</option>
                                                                    <option value="Monthly">{t('admin.billing.billingCycleMonthly')}</option>
                                                                    <option value="Yearly">{t('admin.billing.billingCycleYearly')}</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.shortDescription')}</label>
                                                                <input type="text" value={config.description} onChange={(e) => handleUpdatePublicPlanConfig(index, 'description', e.target.value)} className="w-full p-2 border rounded-md" />
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.advantages')}</label>
                                                                <textarea rows={3} value={config.bullets.join('\n')} onChange={(e) => handleBulletsChange(index, e.target.value)} className="w-full p-2 border rounded-md" />
                                                            </div>
                                                            <div className="col-span-2 md:col-span-1 flex gap-2 flex-wrap">
                                                                <div className="flex-grow min-w-[120px]">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.badgeText')}</label>
                                                                    <input type="text" value={config.tagText || ''} onChange={(e) => handleUpdatePublicPlanConfig(index, 'tagText', e.target.value)} className="w-40 p-2 border rounded-md" placeholder={t('admin.billing.badgeTextPlaceholder')} />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.badgeBgColor')}</label>
                                                                    <input type="color" value={config.tagColor || '#10B981'} onChange={(e) => handleUpdatePublicPlanConfig(index, 'tagColor', e.target.value)} className="h-9 w-12 p-1 border rounded-md" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.billing.badgeTextColor')}</label>
                                                                    <input type="color" value={config.tagTextColor || '#FFFFFF'} onChange={(e) => handleUpdatePublicPlanConfig(index, 'tagTextColor', e.target.value)} className="h-9 w-12 p-1 border rounded-md" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 border-t border-gray-100">
                                    <button
                                        onClick={handleSavePublicSettings}
                                        disabled={isLoading}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                                    >
                                        {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('admin.billing.savePublicPageSettings')}
                                    </button>
                                </div>
                                
                                {publicPageFeedback && (
                                    <div className={`p-3 mt-2 rounded-md flex items-center text-sm justify-center ${publicPageFeedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {publicPageFeedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiAlertCircle className="mr-2"/>}
                                        {publicPageFeedback.text}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* WordPress Integration Plugin Section */}
                    <div className="p-6 bg-white shadow-lg rounded-lg">
                        <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                            <FaWordpressSimple className="mr-2 text-blue-500 shrink-0" style={{ maxWidth: '1em' }} aria-hidden="true"/>
                            {t('admin.billing.wpIntegrationPlugin')}
                        </h2>
                        <TutorialSection videoUrl={tutorialSettings?.wpPlugin?.videoUrl} />
                        <p className="text-sm text-gray-600 mb-4">{t('admin.billing.wpPluginDescription')}</p>
                        <a
                          href="/gymind-woocommerce-plugin.zip"
                          download
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm inline-flex items-center justify-center transition-colors text-sm"
                        >
                          <FiDownload className="mr-2" /> {t('admin.billing.downloadPlugin')}
                        </a>

                        <div className="mt-6 pt-6 border-t">
                            <h3 className="text-md font-semibold text-gray-700 mb-2 flex items-center"><FiKey className="mr-2 text-orange-500"/> {t('admin.billing.pluginApiKey')}</h3>
                            <p className="text-sm text-gray-600 mb-4">{t('admin.billing.pluginApiKeyDescription')}</p>

                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">{t('admin.billing.yourApiKey')}</label>
                                    {isDataLoading && !academySettings?.apiKey ? <div className="mt-1"><FiLoader className="animate-spin h-5 w-5 text-gray-400"/></div> :
                                        academySettings?.apiKey ? (
                                        <div className="mt-1 flex items-center space-x-2">
                                            <div className="relative flex-grow">
                                                <input
                                                    id="apiKey"
                                                    type={showApiKey ? "text" : "password"}
                                                    readOnly
                                                    value={academySettings.apiKey}
                                                    className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm pr-10"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                                                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                                >
                                                    {showApiKey ? <FiEyeOff /> : <FiEye />}
                                                </button>
                                            </div>
                                            <button onClick={() => copyToClipboard(academySettings.apiKey!)} className="p-2.5 bg-gray-200 rounded-md hover:bg-gray-300" aria-label={t('admin.billing.copyApiKey')}><FiCopy/></button>
                                        </div>
                                    ) : <p className="text-sm text-gray-500 mt-1">{t('admin.billing.noApiKeyYet')}</p>}
                                </div>

                                <div>
                                    <button onClick={() => setShowRegenConfirm(true)} className="text-sm text-orange-600 hover:text-orange-800 flex items-center py-2 px-3 rounded-md hover:bg-orange-50 transition-colors">
                                        <FiRefreshCw className="mr-2"/> {t('admin.billing.regenerateApiKey')}
                                    </button>
                                    <p className="text-xs text-gray-500 mt-1">{t('admin.billing.regenerateApiKeyWarning')}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {editingPlan && <PlanModal 
                plan={editingPlan} 
                courses={courses}
                chatPersonas={chatPersonas}
                questionnaires={questionnaires} 
                onClose={() => setEditingPlan(null)} 
                onSave={handleSavePlan} 
                isLoading={isLoading} 
                error={modalError} 
                setFormData={setEditingPlan} 
                systemSettings={systemSettings}
            />}
            
            {showRegenConfirm && ReactDOM.createPortal(
                 <ModalWrapper title={t('admin.billing.regenKeyModalTitle')} onClose={() => setShowRegenConfirm(false)} size="max-w-md">
                    <p className="text-gray-600 mb-6">{t('admin.billing.regenKeyModalMessage')}</p>
                    <div className="flex justify-end space-x-3">
                        <button onClick={() => setShowRegenConfirm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('common.cancel')}</button>
                        <button onClick={handleRegenerateKey} className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center"><FiRefreshCw className="mr-2"/> {t('admin.billing.regenerate')}</button>
                    </div>
                 </ModalWrapper>, document.getElementById('modal-root')!
            )}
            
            <ConfirmationModal
                isOpen={!!archiveConfirmData}
                onClose={() => setArchiveConfirmData(null)}
                onConfirm={handleConfirmArchive}
                isLoading={isLoading}
                title={t('admin.billing.confirmPlanArchiveTitle')}
                message={<>{t('admin.billing.confirmPlanArchiveMessage', { name: archiveConfirmData?.resource.name })}</>}
                confirmText={t('admin.billing.confirmArchiveButton')}
                dependencies={archiveConfirmData?.dependencies}
                dependencyWarning={t('admin.billing.planDependencyWarning', { count: archiveConfirmData?.dependencies?.length })}
            />

            <ArchiveRestoreModal
                isOpen={isArchiveModalOpen}
                onClose={() => setIsArchiveModalOpen(false)}
                title={t('admin.billing.archivedPlans')}
                items={archivedPlans}
                onRestore={restorePlan}
                fetchItems={fetchArchivedPlans}
            />

            {showDeletePublicPlanConfirm !== null && ReactDOM.createPortal(
                 <ModalWrapper title={t('admin.billing.removePublicPlanTitle')} onClose={() => setShowDeletePublicPlanConfirm(null)} size="max-w-md">
                     <p className="text-gray-600 mb-4">{t('admin.billing.removePublicPlanMessage')}</p>
                     <div className="flex justify-end space-x-3">
                         <button onClick={() => setShowDeletePublicPlanConfirm(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('common.cancel')}</button>
                         <button onClick={handleRemovePublicPlan} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center">{t('common.remove')}</button>
                     </div>
                 </ModalWrapper>, document.getElementById('modal-root')!
            )}

        </div>
    );
};

export default BillingSettingsPage;
