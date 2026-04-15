import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiSave, FiLoader, FiAlertCircle, FiMessageSquare, FiDollarSign, FiBookOpen } from 'react-icons/fi';
import QuestionnaireIcon from '../../../common/QuestionnaireIcon';
import { Plan, Course, ChatPersona, Questionnaire, SystemSettings } from '../../../types';
import { ModalWrapper, InfoTooltip } from './Shared';

interface PlanModalProps {
    plan: Partial<Plan>;
    courses: Course[];
    chatPersonas: ChatPersona[];
    questionnaires: Questionnaire[];
    onClose: () => void;
    onSave: () => void;
    isLoading: boolean;
    error: string | null;
    setFormData: React.Dispatch<React.SetStateAction<Partial<Plan> | null>>;
    systemSettings: SystemSettings | null;
}

const PlanModal: React.FC<PlanModalProps> = ({ plan, courses, chatPersonas, questionnaires, onClose, onSave, isLoading, error, setFormData, systemSettings }) => {
    const { t } = useTranslation();

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const checked = (e.target as HTMLInputElement).checked;
        const rawValue = isCheckbox ? checked : value;
        
        let val: any = rawValue;
        if (name.includes('Days') || name.includes('maxUsers') || name.includes('priceMonthly')) {
            val = Number(rawValue) || 0;
        }

        if (name.startsWith('accessRules.')) {
            const ruleName = name.split('.')[1];
            setFormData((prev: any) => ({ ...prev, accessRules: { ...prev.accessRules, [ruleName]: val }}));
        } else if (name === 'maxUsers') {
            setFormData((prev: any) => ({ ...prev, maxUsers: val }));
        } else {
            setFormData((prev: any) => ({ ...prev, [name]: val }));
        }
    };

    const handleCourseAccessTypeChange = (isAll: boolean) => {
        setFormData((prev: any) => ({ ...prev, hasAllCoursesAccess: isAll, }));
    };

    const handleCourseAccessChange = (courseId: string, checked: boolean) => {
        setFormData((prev: any) => {
            const newCourseIds = new Set(prev.accessibleCourseIds || []);
            if (checked) newCourseIds.add(courseId);
            else newCourseIds.delete(courseId);
            return { ...prev, accessibleCourseIds: Array.from(newCourseIds) };
        });
    };

    const handleChatAccessTypeChange = (isAll: boolean) => {
        setFormData((prev: any) => ({ ...prev, hasAllChatAccess: isAll, }));
    };

    const handleChatAccessChange = (personaId: string, checked: boolean) => {
        setFormData((prev: any) => {
            const newIds = new Set(prev.accessibleChatPersonaIds || []);
            if (checked) newIds.add(personaId);
            else newIds.delete(personaId);
            return { ...prev, accessibleChatPersonaIds: Array.from(newIds) };
        });
    };
    
    const handleQuestionnaireAccessTypeChange = (isAll: boolean) => {
        setFormData((prev: any) => ({ ...prev, hasAllQuestionnairesAccess: isAll, }));
    };

    const handleQuestionnaireAccessChange = (qId: string, checked: boolean) => {
        setFormData((prev: any) => {
            const newIds = new Set(prev.accessibleQuestionnaireIds || []);
            if (checked) newIds.add(qId);
            else newIds.delete(qId);
            return { ...prev, accessibleQuestionnaireIds: Array.from(newIds) };
        });
    };
    
    const costCalculation = useMemo(() => {
        if (!systemSettings) return null;
        
        const maxUsers = plan.maxUsers || 0;
        const costPer1000Pro = systemSettings.costPer1000TokensPro || 0;
        const costPer1000Flash = systemSettings.costPer1000TokensFlash || 0;
        
        let totalTokens = 0;
        let billingCycleLabel = '';

        if (plan.planType === 'subscription') {
            const limitPerUser = systemSettings.subscriptionMonthlyLimit || 0;
            totalTokens = maxUsers * limitPerUser;
            billingCycleLabel = 'Monthly';
        } else if (plan.planType === 'one-time') {
            billingCycleLabel = 'Total';
            
            if (plan.accessRules?.revokeChat === 'after_duration') {
                const durationDays = plan.accessRules?.revokeChatAfterDays || 0;
                const monthlyLimit = systemSettings.subscriptionMonthlyLimit || 0;
                const dailyLimit = monthlyLimit / 30;
                const tokensPerUser = durationDays * dailyLimit;
                totalTokens = maxUsers * tokensPerUser;
            } else { // Covers 'on_course_completion' and 'never'
                const tokensPerLesson = systemSettings.oneTimeTokensPerLesson || 0;
                const generalTokens = systemSettings.oneTimeGeneralTokens || 0;

                let totalLessons = 0;
                if (plan.hasAllCoursesAccess) {
                    totalLessons = courses.reduce((sum, course) => sum + (course.lessonCount || 0), 0);
                } else if (plan.accessibleCourseIds && plan.accessibleCourseIds.length > 0) {
                    totalLessons = courses
                        .filter(course => plan.accessibleCourseIds!.includes(course.id))
                        .reduce((sum, course) => sum + (course.lessonCount || 0), 0);
                }

                const lessonTokensPerUser = totalLessons * tokensPerLesson;
                const tokensPerUser = lessonTokensPerUser + generalTokens;
                totalTokens = maxUsers * tokensPerUser;
            }
        } else {
            return null;
        }
        
        const monthlyCostPro = (totalTokens / 1000) * costPer1000Pro;
        const monthlyCostFlash = (totalTokens / 1000) * costPer1000Flash;
        const estimatedCost = (0.7 * monthlyCostPro) + (0.3 * monthlyCostFlash);
        
        return {
            maxUsers,
            totalTokens: totalTokens.toLocaleString(),
            estimatedCost: estimatedCost.toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
            billingCycleLabel
        };
    }, [plan, systemSettings, courses]);

    return ReactDOM.createPortal(
        <ModalWrapper title={plan.id ? t('admin.plan.editTitle') : t('admin.plan.createTitle')} onClose={onClose}>
            <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-4">
                {error && <div id="plan-form-error" role="alert" className="p-3 rounded-md text-sm bg-red-100 text-red-700"><FiAlertCircle className="inline mr-2"/>{error}</div>}
                <p className="text-xs text-gray-500">{t('admin.plan.mandatoryFieldsNote')}</p>
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">{t('admin.plan.planName')} <span aria-hidden="true">*</span></label>
                    <input type="text" name="name" id="name" value={plan.name || ''} onChange={handleInputChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true" aria-describedby={error ? 'plan-form-error' : undefined}/>
                </div>
                
                 <div>
                    <h3 className="text-md font-semibold text-gray-700 mb-2">{t('admin.plan.planType')}</h3>
                    <div className="flex space-x-4">
                         <label className="flex items-center"><input type="radio" name="planType" value="subscription" checked={plan.planType === 'subscription'} onChange={handleInputChange} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.subscription')}</span></label>
                         <label className="flex items-center"><input type="radio" name="planType" value="one-time" checked={plan.planType === 'one-time'} onChange={handleInputChange} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.oneTimeAccess')}</span></label>
                    </div>
                </div>

                {/* Course Access */}
                <div className="pt-2 border-t">
                    <h3 className="text-md font-semibold text-gray-700 mb-2 flex items-center"><FiBookOpen className="mr-2 text-blue-500"/> {t('admin.plan.courseAccess')}</h3>
                    <div className="flex space-x-4 mb-3">
                         <label className="flex items-center"><input type="radio" name="courseAccessType" value="all" checked={plan.hasAllCoursesAccess === true} onChange={() => handleCourseAccessTypeChange(true)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.allCourses')}</span></label>
                         <label className="flex items-center"><input type="radio" name="courseAccessType" value="specific" checked={plan.hasAllCoursesAccess !== true} onChange={() => handleCourseAccessTypeChange(false)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.specificCourses')}</span></label>
                    </div>

                    {plan.hasAllCoursesAccess !== true && (
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2 border bg-gray-50 p-2 rounded-md">
                            {courses.length > 0 ? courses.map((course: Course) => (
                                <label key={course.id} className="flex items-center cursor-pointer text-sm font-medium">
                                    <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-blue-600" checked={plan.accessibleCourseIds?.includes(course.id)} onChange={(e) => handleCourseAccessChange(course.id, e.target.checked)}/>
                                    <span className="ml-3">{course.name}</span>
                                </label>
                            )) : <p className="text-sm text-gray-500">{t('admin.plan.noCoursesAvailable')}</p>}
                        </div>
                    )}
                </div>

                {/* AI Mentor Access */}
                <div className="pt-2 border-t">
                    <h3 className="text-md font-semibold text-gray-700 mb-2 flex items-center"><FiMessageSquare className="mr-2 text-blue-500"/> {t('admin.plan.aiMentorAccess')}</h3>
                    <div className="flex space-x-4 mb-3">
                         <label className="flex items-center"><input type="radio" name="chatAccessType" value="all" checked={plan.hasAllChatAccess !== false} onChange={() => handleChatAccessTypeChange(true)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.allAiMentors')}</span></label>
                         <label className="flex items-center"><input type="radio" name="chatAccessType" value="specific" checked={plan.hasAllChatAccess === false} onChange={() => handleChatAccessTypeChange(false)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.specificAiMentors')}</span></label>
                    </div>
                    {plan.hasAllChatAccess === false && (
                        <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2 border bg-gray-50 p-2 rounded-md">
                            {chatPersonas.length > 0 ? chatPersonas.map((persona: ChatPersona) => (
                                <label key={persona.id} className="flex items-center cursor-pointer text-sm font-medium">
                                    <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-blue-600" checked={plan.accessibleChatPersonaIds?.includes(persona.id)} onChange={(e) => handleChatAccessChange(persona.id, e.target.checked)}/>
                                    <span className="ml-3">{persona.name}</span>
                                </label>
                            )) : <p className="text-sm text-gray-500">{t('admin.plan.noAiMentorsAvailable')}</p>}
                        </div>
                    )}
                </div>

                {/* Questionnaire Access */}
                <div className="pt-2 border-t">
                    <h3 className="text-md font-semibold text-gray-700 mb-2 flex items-center"><QuestionnaireIcon className="mr-2 text-blue-500" /> {t('admin.plan.questionnaireAccess')}</h3>
                    <div className="flex space-x-4 mb-3">
                         <label className="flex items-center"><input type="radio" name="questionnaireAccessType" value="all" checked={plan.hasAllQuestionnairesAccess !== false} onChange={() => handleQuestionnaireAccessTypeChange(true)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.allQuestionnaires')}</span></label>
                         <label className="flex items-center"><input type="radio" name="questionnaireAccessType" value="specific" checked={plan.hasAllQuestionnairesAccess === false} onChange={() => handleQuestionnaireAccessTypeChange(false)} className="h-4 w-4 text-purple-600"/> <span className="ml-2">{t('admin.plan.specificQuestionnaires')}</span></label>
                    </div>
                    {plan.hasAllQuestionnairesAccess === false && (
                        <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2 border bg-gray-50 p-2 rounded-md">
                            {questionnaires.length > 0 ? questionnaires.map((q: Questionnaire) => (
                                <label key={q.id} className="flex items-center cursor-pointer text-sm font-medium">
                                    <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-blue-600" checked={plan.accessibleQuestionnaireIds?.includes(q.id)} onChange={(e) => handleQuestionnaireAccessChange(q.id, e.target.checked)}/>
                                    <span className="ml-3">{q.name}</span>
                                </label>
                            )) : <p className="text-sm text-gray-500">{t('admin.plan.noQuestionnairesAvailable')}</p>}
                        </div>
                    )}
                </div>

                {plan.planType === 'one-time' && (
                     <div className="pt-4 border-t space-y-4">
                        <h3 className="text-lg font-semibold text-gray-700">{t('admin.plan.conditionalAccessRules')}</h3>
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                            <h4 className="font-semibold text-blue-800 mb-2">{t('admin.plan.accessExpirationTrigger')}</h4>
                            <div className="space-y-2">
                                <label className="flex items-center"><input type="radio" name="accessRules.revokeChat" value="never" checked={plan.accessRules?.revokeChat === 'never' || !plan.accessRules?.revokeChat} onChange={handleInputChange} className="h-4 w-4 text-blue-600"/> <span className="ml-2">{t('admin.plan.neverForeverAccess')}</span></label>
                                <label className="flex items-center"><input type="radio" name="accessRules.revokeChat" value="on_course_completion" checked={plan.accessRules?.revokeChat === 'on_course_completion'} onChange={handleInputChange} className="h-4 w-4 text-blue-600"/> <span className="ml-2">{t('admin.plan.uponCourseCompletion')}</span></label>
                                {plan.accessRules?.revokeChat === 'on_course_completion' && 
                                    <>
                                        <select name="accessRules.revokeChatCourseId" value={plan.accessRules?.revokeChatCourseId || ''} onChange={handleInputChange} className="ml-6 p-2 border rounded-md w-full sm:w-auto">
                                            <option value="">{t('admin.plan.selectCourse')}</option>
                                            {courses.map((c: Course) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <div className="flex items-center ml-6 mt-2">
                                            <span className="mr-2">{t('admin.plan.revokeAfter')}</span>
                                            <input type="number" min="0" name="accessRules.revokeChatAfterCompletionDays" value={plan.accessRules?.revokeChatAfterCompletionDays ?? ''} onChange={handleInputChange} className="p-2 border rounded-md w-24"/>
                                            <span className="ml-2">{t('admin.plan.daysZeroImmediate')}</span>
                                        </div>
                                    </>
                                }
                                <label className="flex items-center"><input type="radio" name="accessRules.revokeChat" value="after_duration" checked={plan.accessRules?.revokeChat === 'after_duration'} onChange={handleInputChange} className="h-4 w-4 text-blue-600"/> <span className="ml-2">{t('admin.plan.afterFixedDuration')}</span></label>
                                 {plan.accessRules?.revokeChat === 'after_duration' &&
                                    <div className="flex items-center ml-6"><input type="number" min="1" name="accessRules.revokeChatAfterDays" value={plan.accessRules?.revokeChatAfterDays || ''} onChange={handleInputChange} className="p-2 border rounded-md w-24"/> <span className="ml-2">{t('admin.plan.daysAfterUserJoins')}</span></div>
                                }
                            </div>
                            
                            {plan.accessRules?.revokeChat && plan.accessRules?.revokeChat !== 'never' && (
                                <div className="ml-6 pt-3 mt-3 border-t border-blue-200">
                                    <p className="text-sm font-medium text-blue-800 mb-1">{t('admin.plan.postAccessQuestion')}</p>
                                    <div className="space-y-1">
                                        <label className="flex items-center">
                                            <input type="radio" name="accessRules.postAccessBehavior" value="revoke_all" checked={plan.accessRules?.postAccessBehavior === 'revoke_all' || !plan.accessRules?.postAccessBehavior} onChange={handleInputChange} className="h-4 w-4 text-blue-600"/>
                                            <span className="ml-2 text-sm">{t('admin.plan.revokeAll')}</span>
                                        </label>
                                        <label className="flex items-center">
                                            <input type="radio" name="accessRules.postAccessBehavior" value="content_only" checked={plan.accessRules?.postAccessBehavior === 'content_only'} onChange={handleInputChange} className="h-4 w-4 text-blue-600"/>
                                            <span className="ml-2 text-sm">{t('admin.plan.contentOnly')}</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                        </div>
                     </div>
                )}

                {(plan.planType === 'subscription' || plan.planType === 'one-time') && (
                    <div className="pt-4 border-t mt-4">
                        <h3 className="text-md font-semibold text-gray-700 mb-2 flex items-center">
                            {t('admin.plan.singleUserSubscription')}
                            <InfoTooltip text={t('admin.plan.singleUserSubscriptionTooltip')} />
                        </h3>
                        <div className="flex space-x-4 mb-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="singleUserSubscription"
                                    value="enable"
                                    checked={plan.isForSingleUser === true}
                                    onChange={() => setFormData((prev: any) => ({ ...prev, isForSingleUser: true }))}
                                    className="h-4 w-4 text-purple-600"
                                />
                                <span className="ml-2">{t('admin.plan.enable')}</span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    name="singleUserSubscription"
                                    value="disable"
                                    checked={!plan.isForSingleUser}
                                    onChange={() => setFormData((prev: any) => ({ ...prev, isForSingleUser: false }))}
                                    className="h-4 w-4 text-purple-600"
                                />
                                <span className="ml-2">{t('admin.plan.disable')}</span>
                            </label>
                        </div>

                        <hr className="border-t border-gray-200 my-4" />
                        <h3 className="text-md font-semibold text-gray-700 mb-2">{t('admin.plan.planPricing')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="maxUsers" className="block text-sm font-medium text-gray-700">{t('admin.plan.maxUsers')} <span aria-hidden="true">*</span></label>
                                <input type="number" name="maxUsers" id="maxUsers" value={plan.maxUsers || ''} onChange={handleInputChange} min="1" className="mt-1 w-full p-2 border border-gray-300 rounded-md disabled:bg-gray-200" required aria-required="true" aria-describedby={error ? 'plan-form-error' : undefined} placeholder="e.g., 100" />
                            </div>
                            <div>
                                <label htmlFor="priceMonthly" className="block text-sm font-medium text-gray-700 flex items-center">
                                    {plan.planType === 'subscription'
                                        ? t('admin.plan.monthlyPrice')
                                        : t('admin.plan.price')}
                                    <InfoTooltip text={t('admin.plan.priceTooltip')} />
                                </label>
                                <div className="mt-1 relative rounded-md shadow-sm">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">$</span>
                                    </div>
                                    <input
                                        type="number"
                                        name="priceMonthly"
                                        id="priceMonthly"
                                        value={plan.priceMonthly || ''}
                                        onChange={handleInputChange}
                                        min="0"
                                        step="0.01"
                                        className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                        {costCalculation && (
                            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-md text-sm">
                                <p className="font-semibold text-indigo-800 flex items-center mb-2"><FiDollarSign className="mr-2"/> {t('admin.plan.costEstimation')}</p>
                                <p className="text-indigo-700">{t('admin.plan.estimatedMaxCost', { cycle: costCalculation.billingCycleLabel, cost: costCalculation.estimatedCost })}</p>
                                <p className="text-xs text-indigo-500 mt-2">
                                {t('admin.plan.costEstimationNote')}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end space-x-3 pt-4 border-t flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isLoading}>{t('common.cancel')}</button>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center" disabled={isLoading}>
                        {isLoading ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('common.save')}
                    </button>
                </div>
            </form>
        </ModalWrapper>,
        document.getElementById('modal-root')!
    );
}

export default PlanModal;
