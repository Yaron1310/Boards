import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Organization, Conversation, User, ExtractedFactors, UserQuestionnaireResult, PreApprovedUser, Course, UserCourseProgress, AcademySettings, TokenUsageData, Academy, ChatPersona, Questionnaire, Message, Plan, SystemSettings, PersonalInsight, TutorialSettings, AcademyBillingCycle } from '../types';
import { UserRole } from '../types';
import * as apiService from '../services/geminiService';
import { useAuth } from '../hooks/useAuth';
import { queryKeys } from '../hooks/queries/queryKeys';
import { useAcademiesQuery, useAcademySettingsQuery } from '../hooks/queries/useAcademyQueries';
import { useOrganizationsQuery, useArchivedOrganizationsQuery } from '../hooks/queries/useOrganizationQueries';
import { usePlansQuery, useArchivedPlansQuery } from '../hooks/queries/usePlanQueries';
import { useUsersQuery, usePreApprovedUsersQuery } from '../hooks/queries/useUserQueries';
import { useConversationsQuery, useAccessiblePersonasQuery, useChatPersonasQuery, useArchivedChatPersonasQuery } from '../hooks/queries/useChatQueries';
import { useCoursesQuery, useArchivedCoursesQuery, useMyProgressQuery, useOrgProgressQuery } from '../hooks/queries/useCourseQueries';
import { usePublishedQuestionnairesQuery, useQuestionnairesAdminQuery, useArchivedQuestionnairesQuery, useMyQuestionnaireResultsQuery } from '../hooks/queries/useQuestionnaireQueries';
import { usePersonalInsightsQuery } from '../hooks/queries/useInsightQueries';
import { useSystemSettingsQuery, useTutorialSettingsQuery } from '../hooks/queries/useSettingsQueries';
import { useUserTokenUsageQuery, useOrgTokenUsageQuery, useAcademyTokenUsageQuery } from '../hooks/queries/useAnalyticsQueries';
import { useBillingCycleQuery } from '../hooks/queries/useBillingQueries';

// Add utility functions for localStorage and export them
export const saveToLocalStorage = <T,>(key: string, value: T): void => {
  try {
    const serializedValue = JSON.stringify(value);
    localStorage.setItem(key, serializedValue);
  } catch (error) {
    console.warn(`Error saving ${key} to localStorage:`, error);
  }
};

export const loadFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const serializedValue = localStorage.getItem(key);
    if (serializedValue === null) {
      return defaultValue;
    }
    return JSON.parse(serializedValue);
  } catch (error) {
    console.warn(`Error reading ${key} from localStorage:`, error);
    return defaultValue;
  }
};

interface DataContextType {
  academies: Academy[];
  fetchAcademies: () => Promise<void>;
  addAcademy: (name: string) => Promise<Academy | null>;
  updateAcademy: (id: string, name: string) => Promise<boolean>;
  deleteAcademy: (id: string) => Promise<boolean>;
  addAcademyAdmin: (academyId: string, email: string) => Promise<{message: string} | null>;
  removeAcademyAdmin: (academyId: string, userId: string) => Promise<{message: string} | null>;

  organizations: Organization[];
  archivedOrganizations: Organization[];
  fetchOrganizations: (filterType?: 'corporate' | 'individual' | 'all') => Promise<void>;
  fetchArchivedOrganizations: () => Promise<void>;
  addOrganization: (name: string, academyId: string, planId?: string) => Promise<Organization | null>;
  updateOrganization: (id: string, data: { name?: string, planId?: string }) => Promise<boolean>;
  deleteOrganization: (id: string, force?: boolean) => Promise<{ isConflict: boolean, dependencies?: any }>;
  confirmArchiveOrganization: (id: string) => Promise<boolean>;
  restoreOrganization: (id: string) => Promise<boolean>;
  addOrganizationManager: (organizationId: string, email: string) => Promise<{message: string} | null>;
  removeOrganizationManager: (organizationId: string, userId: string) => Promise<{message: string} | null>;
  removeUserFromOrganization: (organizationId: string, userId: string) => Promise<boolean>;

  plans: Plan[];
  archivedPlans: Plan[];
  fetchPlans: () => Promise<void>;
  fetchArchivedPlans: () => Promise<void>;
  addPlan: (planData: Partial<Plan>) => Promise<Plan | null>;
  updatePlan: (id: string, planData: Partial<Plan>) => Promise<boolean>;
  deletePlan: (id: string, force?: boolean) => Promise<{ isConflict: boolean, dependencies?: any }>;
  confirmArchivePlan: (id: string) => Promise<boolean>;
  restorePlan: (id: string) => Promise<boolean>;

  conversations: Conversation[];
  fetchUserConversations: () => Promise<void>;
  saveConversation: (conversationData: { messages: Message[], extractedFactors: ExtractedFactors, personaId: string, personaName: string, isPrivate?: boolean }) => Promise<Conversation | null>;
  deleteConversationMessages: (conversationId: string) => Promise<Conversation | null>;

  users: User[];
  fetchUsers: () => Promise<void>;
  deleteUser: (userId: string, deletionType: 'soft' | 'hard') => Promise<boolean>;
  cancelUserSubscriptionByAdmin: (userId: string) => Promise<{message: string} | null>;

  preApprovedUsers: PreApprovedUser[];
  preApproveUsersInBulk: (emails: string[], organizationId: string) => Promise<{successCount: number} | null>;
  revokePreApprovedUser: (preApprovedUserId: string) => Promise<boolean>;

  // Accessible personas: user-filtered list for the chat UI (all roles except SYSTEM_ADMIN).
  // Distinct from chatPersonas which is the admin-management list (ACADEMY_ADMIN+).
  accessiblePersonas: ChatPersona[];
  fetchAccessiblePersonas: () => Promise<void>;

  chatPersonas: ChatPersona[];
  archivedChatPersonas: ChatPersona[];
  fetchChatPersonas: () => Promise<void>;
  fetchArchivedChatPersonas: () => Promise<void>;
  addChatPersona: (personaData: Partial<ChatPersona>) => Promise<ChatPersona | null>;
  updateChatPersona: (id: string, personaData: Partial<ChatPersona>) => Promise<ChatPersona | null>;
  deleteChatPersona: (id: string, force?: boolean) => Promise<{ isConflict: boolean, dependencies?: any }>;
  confirmArchiveChatPersona: (id: string) => Promise<boolean>;
  restoreChatPersona: (id: string) => Promise<boolean>;

  // Published questionnaires: user-facing list (all roles except SYSTEM_ADMIN).
  // Distinct from questionnaires which is the admin-management list (ACADEMY_ADMIN+).
  publishedQuestionnaires: Questionnaire[];

  questionnaires: Questionnaire[];
  archivedQuestionnaires: Questionnaire[];
  fetchQuestionnaires: () => Promise<void>;
  fetchPublishedQuestionnaires: () => Promise<void>;
  fetchArchivedQuestionnaires: () => Promise<void>;
  deleteQuestionnaire: (id: string, force?: boolean) => Promise<{ isConflict: boolean, dependencies?: any }>;
  confirmArchiveQuestionnaire: (id: string) => Promise<boolean>;
  restoreQuestionnaire: (id: string) => Promise<boolean>;

  myQuestionnaireResults: UserQuestionnaireResult[];
  fetchMyLatestResults: () => Promise<void>;
  saveQuestionnaireResult: (questionnaireId: string, resultData: Partial<Pick<UserQuestionnaireResult, 'categoryScores' | 'topCategories' | 'source'>> & Record<string, any>) => Promise<UserQuestionnaireResult | null>;

  personalInsights: PersonalInsight[];
  savePersonalInsight: (payload: { key: string; label: string; value: any }) => Promise<PersonalInsight | null>;
  archivePersonalInsight: (id: string) => Promise<void>;
  archiveConversationInsight: (id: string) => Promise<void>;
  archiveQuestionnaireResult: (id: string) => Promise<void>;
  restorePersonalInsight: (id: string) => Promise<boolean>;
  restoreConversationInsight: (id: string) => Promise<boolean>;
  restoreQuestionnaireResult: (id: string) => Promise<boolean>;

  academySettings: AcademySettings | null;
  updateAcademySettings: (settings: Partial<AcademySettings> & { logoUpload?: string; }) => Promise<AcademySettings | null>;
  setAcademySettingsLocal: (settings: AcademySettings | null) => void;
  regenerateApiKey: () => Promise<AcademySettings | null>;
  enableBridge: () => Promise<AcademySettings | null>;
  disableBridge: () => Promise<AcademySettings | null>;
  regenerateBridgeKey: () => Promise<AcademySettings | null>;

  systemSettings: SystemSettings | null;
  fetchSystemSettings: () => Promise<void>;
  updateSystemSettings: (settings: SystemSettings) => Promise<boolean>;

  tutorialSettings: TutorialSettings | null;
  fetchTutorialSettings: () => Promise<void>;
  updateTutorialSettings: (settings: TutorialSettings) => Promise<boolean>;

  courses: Course[];
  archivedCourses: Course[];
  fetchCourses: () => Promise<void>;
  fetchArchivedCourses: () => Promise<void>;
  fetchCourseWithLessons: (courseId: string) => Promise<void>;
  deleteCourse: (id: string, force?: boolean) => Promise<{ isConflict: boolean, dependencies?: any }>;
  confirmArchiveCourse: (id: string) => Promise<boolean>;
  restoreCourse: (id: string) => Promise<boolean>;

  myProgress: UserCourseProgress[];
  organizationProgress: UserCourseProgress[];
  fetchProgress: () => Promise<void>;
  markLessonComplete: (courseId: string, lessonId: string) => Promise<boolean>;

  userTokenUsage: TokenUsageData | null;
  orgTokenUsage: TokenUsageData | null;
  academyTokenUsage: TokenUsageData | null;
  fetchUserTokenUsage: (month?: number, year?: number) => Promise<void>;
  fetchOrgTokenUsage: (month?: number, year?: number) => Promise<void>;
  fetchAcademyTokenUsage: (month?: number, year?: number) => Promise<void>;
  isAnalyticsLoading: boolean;

  currentBillingCycle: AcademyBillingCycle | null;
  fetchCurrentBillingCycle: () => Promise<void>;
  topUpUsage: (additionalUsers: number) => Promise<AcademyBillingCycle | null>;

  isLoading: boolean;
  dataError: string | null;
  clearDataError: () => void;
  fetchAllData: (userRole: UserRole, selectedOrgId?: string) => Promise<void>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, selectedOrganization, logout } = useAuth();
  const queryClient = useQueryClient();

  // --- Role-based query enablement ---
  const isLoggedIn = !!user && !!selectedOrganization;
  const role = user?.role;
  const isSystemAdmin = role === UserRole.SYSTEM_ADMIN;
  const isAcademyAdmin = role === UserRole.ACADEMY_ADMIN;
  const isOrgAdmin = role === UserRole.ORGANIZATION_ADMIN;
  const isAdminRole = isSystemAdmin || isAcademyAdmin || isOrgAdmin;
  const isNonSystemUser = isAcademyAdmin || isOrgAdmin || role === UserRole.REGULAR_USER;

  // --- React Query hooks (enabled per role — data loads lazily) ---
  const academiesQuery = useAcademiesQuery(isLoggedIn && isSystemAdmin);
  const organizationsQuery = useOrganizationsQuery(undefined, isLoggedIn && (isSystemAdmin || isAcademyAdmin));
  const archivedOrganizationsQuery = useArchivedOrganizationsQuery(false);
  const plansQuery = usePlansQuery(isLoggedIn && (isAcademyAdmin || isOrgAdmin));
  const archivedPlansQuery = useArchivedPlansQuery(false);
  const usersQuery = useUsersQuery(undefined, isLoggedIn && isAdminRole);
  const preApprovedUsersQuery = usePreApprovedUsersQuery(isLoggedIn && (isAcademyAdmin || isOrgAdmin));
  const conversationsQuery = useConversationsQuery(undefined, isLoggedIn && isNonSystemUser);
  const accessiblePersonasQuery = useAccessiblePersonasQuery(isLoggedIn && isNonSystemUser);
  const chatPersonasQuery = useChatPersonasQuery(isLoggedIn && isAcademyAdmin);
  const archivedChatPersonasQuery = useArchivedChatPersonasQuery(false);
  const coursesQuery = useCoursesQuery(isLoggedIn && (isSystemAdmin || isNonSystemUser));
  const archivedCoursesQuery = useArchivedCoursesQuery(false);
  const myProgressQuery = useMyProgressQuery(isLoggedIn && isNonSystemUser);
  const orgProgressQuery = useOrgProgressQuery(isLoggedIn ? role : undefined);
  const publishedQuestionnairesQuery = usePublishedQuestionnairesQuery(isLoggedIn && isNonSystemUser);
  const questionnairesAdminQuery = useQuestionnairesAdminQuery(isLoggedIn && isAcademyAdmin);
  const archivedQuestionnairesQuery = useArchivedQuestionnairesQuery(false);
  const myQuestionnaireResultsQuery = useMyQuestionnaireResultsQuery(isLoggedIn);
  const personalInsightsQuery = usePersonalInsightsQuery(isLoggedIn);
  const academySettingsQuery = useAcademySettingsQuery(isLoggedIn && isNonSystemUser);
  const systemSettingsQuery = useSystemSettingsQuery(isLoggedIn && (isSystemAdmin || isAcademyAdmin));
  const tutorialSettingsQuery = useTutorialSettingsQuery(isLoggedIn && (isSystemAdmin || isAcademyAdmin));
  const userTokenUsageQuery = useUserTokenUsageQuery(undefined, undefined, isLoggedIn && (isAcademyAdmin || isOrgAdmin));
  const orgTokenUsageQuery = useOrgTokenUsageQuery(undefined, undefined, isLoggedIn && (isSystemAdmin || isAcademyAdmin || isOrgAdmin));
  const academyTokenUsageQuery = useAcademyTokenUsageQuery(undefined, undefined, isLoggedIn && (isSystemAdmin || isAcademyAdmin));
  const billingCycleQuery = useBillingCycleQuery(isLoggedIn && isAcademyAdmin);

  // --- Derived state from React Query ---
  const academies = academiesQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  const archivedOrganizations = archivedOrganizationsQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const archivedPlans = archivedPlansQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const preApprovedUsers = preApprovedUsersQuery.data ?? [];
  const conversations = conversationsQuery.data ?? [];
  const accessiblePersonas = accessiblePersonasQuery.data ?? [];
  const chatPersonas = chatPersonasQuery.data ?? [];
  const archivedChatPersonas = archivedChatPersonasQuery.data ?? [];
  const courses = coursesQuery.data ?? [];
  const archivedCourses = archivedCoursesQuery.data ?? [];
  const myProgress = myProgressQuery.data ?? [];
  const organizationProgress = orgProgressQuery.data ?? [];
  const publishedQuestionnaires = publishedQuestionnairesQuery.data ?? [];
  const questionnaires = questionnairesAdminQuery.data ?? [];
  const archivedQuestionnaires = archivedQuestionnairesQuery.data ?? [];
  const myQuestionnaireResults = myQuestionnaireResultsQuery.data ?? [];
  const personalInsights = personalInsightsQuery.data ?? [];
  const academySettings = academySettingsQuery.data ?? null;
  const systemSettings = systemSettingsQuery.data ?? null;
  const tutorialSettings = tutorialSettingsQuery.data ?? null;
  const userTokenUsage = userTokenUsageQuery.data ?? null;
  const orgTokenUsage = orgTokenUsageQuery.data ?? null;
  const academyTokenUsage = academyTokenUsageQuery.data ?? null;
  const currentBillingCycle = billingCycleQuery.data ?? null;

  // --- General state ---
  const [dataError, setDataError] = useState<string | null>(null);

  // Composite loading: true while any role-enabled query is loading for the first time
  const isLoading = [
    academiesQuery, organizationsQuery, usersQuery, conversationsQuery,
    accessiblePersonasQuery, chatPersonasQuery, coursesQuery, myProgressQuery,
    publishedQuestionnairesQuery, questionnairesAdminQuery,
    myQuestionnaireResultsQuery, personalInsightsQuery,
    academySettingsQuery, systemSettingsQuery, tutorialSettingsQuery,
    plansQuery, preApprovedUsersQuery, orgProgressQuery,
    userTokenUsageQuery, orgTokenUsageQuery, academyTokenUsageQuery,
    billingCycleQuery,
  ].some(q => q.isLoading && q.fetchStatus !== 'idle');

  const isAnalyticsLoading = userTokenUsageQuery.isLoading || orgTokenUsageQuery.isLoading || academyTokenUsageQuery.isLoading;

  const clearDataError = useCallback(() => setDataError(null), []);

  useEffect(() => {
    if (dataError) {
      const timer = setTimeout(() => {
        setDataError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [dataError]);

  // Clear all query cache on logout
  useEffect(() => {
    if (!user || !selectedOrganization) {
      queryClient.clear();
    }
  }, [user, selectedOrganization, queryClient]);

  const handleApiCall = useCallback(async <T,>(apiCall: () => Promise<T>, onSuccess?: (data: T) => void, errorMessage?: string): Promise<T | null> => {
    setDataError(null);
    try {
        const data = await apiCall();
        if (onSuccess) onSuccess(data);
        return data;
    } catch (error: any) {
        if (error.message.includes('expired')) {
             if (!(window as any).isLoggingOut) {
                (window as any).isLoggingOut = true;
                logout();
            }
        } else if (error.code === 'ORG_SUBSCRIPTION_INACTIVE') {
            setDataError("This feature requires an active subscription.");
        } else {
            setDataError(errorMessage || error.message || "An unknown error occurred.");
        }
        return null;
    }
  }, [logout]);

  // --- Invalidation-based fetch functions (backward compat) ---
  const fetchAcademies = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.academies.all });
  }, [queryClient]);

  const fetchOrganizations = useCallback(async (filterType?: 'corporate' | 'individual' | 'all') => {
    if (filterType && filterType !== 'all') {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.filtered(filterType) });
    }
    // Always invalidate the main organizations query (filterType: undefined) since
    // that's what DataContext uses. 'all' and undefined fetch the same unfiltered data.
    await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
  }, [queryClient]);

  const fetchArchivedOrganizations = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: queryKeys.organizations.archived, queryFn: () => apiService.getArchivedOrganizations() });
  }, [queryClient]);

  const fetchPlans = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.plans.all });
  }, [queryClient]);

  const fetchArchivedPlans = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: queryKeys.plans.archived, queryFn: () => apiService.getArchivedPlans() });
  }, [queryClient]);

  const fetchUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  }, [queryClient]);

  const fetchPreApprovedUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.preApproved });
  }, [queryClient]);

  const fetchUserConversations = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
  }, [queryClient]);

  const fetchAccessiblePersonas = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.personas.accessible });
  }, [queryClient]);

  const fetchPublishedQuestionnaires = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.questionnaires.published });
  }, [queryClient]);

  const fetchChatPersonas = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.personas.admin });
  }, [queryClient]);

  const fetchArchivedChatPersonas = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: queryKeys.personas.archived, queryFn: () => apiService.getArchivedChatPersonas() });
  }, [queryClient]);

  const fetchQuestionnaires = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.questionnaires.admin });
  }, [queryClient]);

  const fetchArchivedQuestionnaires = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: queryKeys.questionnaires.archived, queryFn: () => apiService.getArchivedQuestionnaires() });
  }, [queryClient]);

  const fetchMyLatestResults = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.questionnaires.myResults });
  }, [queryClient]);

  const fetchAcademySettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.academy });
  }, [queryClient]);

  const fetchSystemSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.system });
  }, [queryClient]);

  const fetchTutorialSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.tutorial });
  }, [queryClient]);

  const fetchCourses = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.courses.all });
  }, [queryClient]);

  const fetchArchivedCourses = useCallback(async () => {
    await queryClient.fetchQuery({ queryKey: queryKeys.courses.archived, queryFn: () => apiService.getArchivedCourses() });
  }, [queryClient]);

  const fetchCourseWithLessons = useCallback(async (courseId: string) => {
    const detailedCourse = await handleApiCall(() => apiService.getCourseWithLessons(courseId), undefined, 'Failed to fetch course details.');
    if (detailedCourse) {
      queryClient.setQueryData(queryKeys.courses.all, (old: Course[] | undefined) =>
        old ? old.map(c => c.id === courseId ? detailedCourse : c) : [detailedCourse]
      );
    }
  }, [handleApiCall, queryClient]);

  const fetchProgress = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.my }),
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.organization }),
    ]);
  }, [queryClient]);

  const fetchUserTokenUsage = useCallback(async (month?: number, year?: number) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.analytics.userToken(month, year) });
  }, [queryClient]);

  const fetchOrgTokenUsage = useCallback(async (month?: number, year?: number) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.analytics.orgToken(month, year) });
  }, [queryClient]);

  const fetchAcademyTokenUsage = useCallback(async (month?: number, year?: number) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.analytics.academyToken(month, year) });
  }, [queryClient]);

  const fetchCurrentBillingCycle = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.billing.currentCycle });
  }, [queryClient]);

  // fetchAllData is now a no-op — React Query handles lazy loading via enabled flags.
  // Kept for backward compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchAllData = useCallback(async (_userRole: UserRole, _selectedOrgId?: string) => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // --- Create/Update/Delete Logic (mutations) ---

  // Academies
  const addAcademy = async (name: string) => handleApiCall(() => apiService.createAcademy(name), () => fetchAcademies(), 'Failed to add academy.');
  const updateAcademy = async (id: string, name: string) => {
      const updated = await handleApiCall(() => apiService.updateAcademy(id, name), () => fetchAcademies(), 'Failed to update academy.');
      return !!updated;
  };
  const deleteAcademy = async (id: string) => {
    const success = await handleApiCall(() => apiService.deleteAcademy(id), () => fetchAcademies(), 'Failed to delete academy.');
    return success === null;
  };
  const addAcademyAdmin = async (academyId: string, email: string) => {
    const result = await handleApiCall(() => apiService.addAcademyAdmin(academyId, email), () => fetchUsers(), 'Failed to add academy admin.');
    return result;
  };
  const removeAcademyAdmin = async (academyId: string, userId: string) => {
    const result = await handleApiCall(() => apiService.removeAcademyAdmin(academyId, userId), () => fetchUsers(), 'Failed to remove admin.');
    return result;
  };

  // Organizations
  const addOrganization = async (name: string, academyId: string, planId?: string) => handleApiCall(() => apiService.addOrganizationToBackend(name, academyId, planId), () => fetchOrganizations(), 'Failed to add organization.');
  const updateOrganization = async (id: string, data: { name?: string, planId?: string, subscriptionProvider?: string, isPersonal?: boolean }) => {
    const updated = await handleApiCall(() => apiService.updateOrganizationOnBackend(id, data), () => fetchOrganizations(), 'Failed to update organization.');
    return !!updated;
  };
  const deleteOrganization = async (id: string, force = false): Promise<{ isConflict: boolean, dependencies?: any }> => {
    try {
        await apiService.deleteOrganizationFromBackend(id, force);
        await fetchOrganizations();
        return { isConflict: false };
    } catch (error: any) {
        if (error.isConflict) {
            return { isConflict: true, dependencies: error.dependencies };
        }
        setDataError(error.message || 'An error occurred while archiving the organization.');
        return { isConflict: false };
    }
  };
  const confirmArchiveOrganization = async (id: string): Promise<boolean> => {
    const success = await handleApiCall(() => apiService.deleteOrganizationFromBackend(id, true), () => fetchOrganizations(), 'Failed to archive organization.');
    return success === null;
  };
  const restoreOrganization = async (id: string) => {
    const success = await handleApiCall(() => apiService.restoreOrganization(id), undefined, 'Failed to restore organization.');
    if (success) {
      await fetchOrganizations();
      await fetchArchivedOrganizations();
    }
    return !!success;
  };
  const addOrganizationManager = async (organizationId: string, email: string) => {
    const result = await handleApiCall(() => apiService.addOrganizationManager(organizationId, email), () => fetchUsers(), 'Failed to add manager.');
    return result;
  };
  const removeOrganizationManager = async (organizationId: string, userId: string) => {
    const result = await handleApiCall(() => apiService.removeOrganizationManager(organizationId, userId), () => fetchUsers(), 'Failed to remove manager.');
    return result;
  };
  const removeUserFromOrganization = async (organizationId: string, userId: string): Promise<boolean> => {
    const result = await handleApiCall(() => apiService.removeUserFromOrganization(organizationId, userId), () => fetchUsers(), 'Failed to remove user from organization.');
    return result === null;
  };

  // Plans
  const addPlan = async (planData: Partial<Plan>) => handleApiCall(() => apiService.createPlan(planData), () => fetchPlans(), 'Failed to add plan.');
  const updatePlan = async (id: string, planData: Partial<Plan>) => {
    const updated = await handleApiCall(() => apiService.updatePlan(id, planData), () => fetchPlans(), 'Failed to update plan.');
    return !!updated;
  };
  const deletePlan = async (id: string, force = false): Promise<{ isConflict: boolean, dependencies?: any }> => {
    try {
        await apiService.deletePlan(id, force);
        await fetchPlans();
        return { isConflict: false };
    } catch (error: any) {
        if (error.isConflict) {
            return { isConflict: true, dependencies: error.dependencies };
        }
        setDataError(error.message || 'An unknown error occurred while archiving the plan.');
        return { isConflict: false };
    }
  };
  const confirmArchivePlan = async (id: string): Promise<boolean> => {
    const success = await handleApiCall(() => apiService.deletePlan(id, true), () => fetchPlans(), 'Failed to archive plan.');
    return success === null;
  };
  const restorePlan = async (id: string) => {
    const success = await handleApiCall(() => apiService.restorePlan(id), undefined, 'Failed to restore plan.');
    if (success) {
      await fetchPlans();
      await fetchArchivedPlans();
    }
    return !!success;
  };

  // Users
  const deleteUser = async (userId: string, deletionType: 'soft' | 'hard') => {
    const success = await handleApiCall(
      () => apiService.deleteUserAccount(userId, deletionType),
      () => {
        queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) =>
          old ? old.filter(u => u.id !== userId) : []
        );
      },
      'Failed to delete user.'
    );
    return success === null;
  }
  const cancelUserSubscriptionByAdmin = async (userId: string) => {
    return handleApiCall(() => apiService.cancelUserSubscriptionByAdmin(userId), undefined, 'Failed to cancel subscription.');
  };
  const preApproveUsersInBulk = async (emails: string[], organizationId: string) => {
    const result = await handleApiCall(() => apiService.preApproveUsersInBulk(emails, organizationId), () => fetchPreApprovedUsers(), 'Failed to pre-approve users.');
    return result;
  };
  const revokePreApprovedUser = async (preApprovedUserId: string) => {
    const success = await handleApiCall(
      () => apiService.deletePreApprovedUserFromBackend(preApprovedUserId),
      () => {
        queryClient.setQueryData(queryKeys.users.preApproved, (old: PreApprovedUser[] | undefined) =>
          old ? old.filter(pa => pa.id !== preApprovedUserId) : []
        );
      },
      'Failed to revoke pre-approval.'
    );
    return success === null;
  };

  // Conversations
  const saveConversation = async (conversationData: { messages: Message[], extractedFactors: ExtractedFactors, personaId: string, personaName: string, isPrivate?: boolean }) => handleApiCall(
    () => apiService.saveConversationToBackend(conversationData),
    (newConv) => {
      queryClient.setQueryData(queryKeys.conversations.all, (old: Conversation[] | undefined) =>
        [{...newConv, date: new Date(newConv.date)}, ...(old ?? [])]
      );
    },
    'Failed to save conversation.'
  );
  const deleteConversationMessages = async (conversationId: string) => {
      return await handleApiCall(() => apiService.deleteConversationMessagesFromBackend(conversationId), (updatedConv) => {
          if (updatedConv) {
              queryClient.setQueryData(queryKeys.conversations.all, (old: Conversation[] | undefined) =>
                old ? old.map(c => c.id === conversationId ? updatedConv : c) : []
              );
          }
      }, 'Failed to delete conversation history.');
  };

  // Chat Personas
  const addChatPersona = async (personaData: Partial<ChatPersona>) => {
    const result = await handleApiCall(() => apiService.createChatPersona(personaData), () => fetchChatPersonas(), 'Failed to add chat persona.');
    if (result) await fetchAccessiblePersonas();
    return result;
  };
  const updateChatPersona = async (id: string, personaData: Partial<ChatPersona>) => {
    const result = await handleApiCall(() => apiService.updateChatPersona(id, personaData), () => fetchChatPersonas(), 'Failed to update chat persona.');
    if (result) await fetchAccessiblePersonas();
    return result;
  };
  const deleteChatPersona = async (id: string, force = false): Promise<{ isConflict: boolean, dependencies?: any }> => {
    try {
        await apiService.deleteChatPersona(id, force);
        await Promise.all([fetchChatPersonas(), fetchAccessiblePersonas()]);
        return { isConflict: false };
    } catch (error: any) {
        if (error.isConflict) { return { isConflict: true, dependencies: error.dependencies }; }
        setDataError(error.message || 'An error occurred.');
        return { isConflict: false };
    }
  };
  const confirmArchiveChatPersona = async (id: string): Promise<boolean> => {
    const success = await handleApiCall(
      () => apiService.deleteChatPersona(id, true),
      () => { fetchChatPersonas(); fetchAccessiblePersonas(); },
      'Failed to archive chat persona.'
    );
    return success === null;
  };
  const restoreChatPersona = async (id: string) => {
    const success = await handleApiCall(() => apiService.restoreChatPersona(id), undefined, 'Failed to restore chat persona.');
    if (success) {
      await Promise.all([fetchChatPersonas(), fetchArchivedChatPersonas(), fetchAccessiblePersonas()]);
    }
    return !!success;
  };

  // Questionnaires
  const deleteQuestionnaire = async (id: string, force = false): Promise<{ isConflict: boolean, dependencies?: any }> => {
    try {
        await apiService.deleteQuestionnaire(id, force);
        await Promise.all([fetchQuestionnaires(), fetchPublishedQuestionnaires()]);
        return { isConflict: false };
    } catch (error: any) {
        if (error.isConflict) { return { isConflict: true, dependencies: error.dependencies }; }
        setDataError(error.message || 'An error occurred.');
        return { isConflict: false };
    }
  };
  const confirmArchiveQuestionnaire = async (id: string): Promise<boolean> => {
    const success = await handleApiCall(
      () => apiService.deleteQuestionnaire(id, true),
      () => { fetchQuestionnaires(); fetchPublishedQuestionnaires(); },
      'Failed to archive questionnaire.'
    );
    return success === null;
  };
  const restoreQuestionnaire = async (id: string) => {
    const success = await handleApiCall(() => apiService.restoreQuestionnaire(id), undefined, 'Failed to restore questionnaire.');
    if (success) {
      await Promise.all([fetchQuestionnaires(), fetchArchivedQuestionnaires(), fetchPublishedQuestionnaires()]);
    }
    return !!success;
  };

  // Questionnaire Results
  const saveQuestionnaireResult = async (questionnaireId: string, resultData: Partial<Pick<UserQuestionnaireResult, 'categoryScores' | 'topCategories' | 'source'>> & Record<string, any>) => {
     return await handleApiCall(() => apiService.saveUserQuestionnaireResultToBackend(questionnaireId, resultData), (newResult) => {
        if(newResult) {
            queryClient.setQueryData(queryKeys.questionnaires.myResults, (old: UserQuestionnaireResult[] | undefined) => {
                const prev = old ?? [];
                const resultSource = newResult.source || 'standalone';
                const existingIndex = prev.findIndex(r => r.questionnaireId === questionnaireId && (r.source || 'standalone') === resultSource);
                const resultWithDate = { ...newResult, completedAt: new Date(newResult.completedAt) };
                if (existingIndex > -1) {
                    const updatedResults = [...prev];
                    updatedResults[existingIndex] = resultWithDate;
                    return updatedResults;
                }
                return [...prev, resultWithDate];
            });
        }
     }, 'Failed to save questionnaire results.');
  };

  const savePersonalInsight = async (payload: { key: string; label: string; value: any }) => {
    return await handleApiCall(() => apiService.savePersonalInsightToBackend(payload), (newInsight: PersonalInsight) => {
      if (newInsight) {
        queryClient.setQueryData(queryKeys.insights.personal, (old: PersonalInsight[] | undefined) => {
          const prev = old ?? [];
          const index = prev.findIndex(i => i.id === newInsight.id);
          const insightWithDate = { ...newInsight, updatedAt: new Date(newInsight.updatedAt) };
          if (index > -1) {
            const newInsights = [...prev];
            newInsights[index] = insightWithDate;
            return newInsights;
          }
          return [insightWithDate, ...prev].sort((a,b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        });
      }
    }, 'Failed to save personal insight.');
  };

  const archivePersonalInsight = async (id: string): Promise<void> => {
    await handleApiCall(() => apiService.archivePersonalInsightOnBackend(id), () => {
      queryClient.setQueryData(queryKeys.insights.personal, (old: PersonalInsight[] | undefined) =>
        old ? old.filter(i => i.id !== id) : []
      );
    }, 'Failed to archive insight.');
  };

  const archiveConversationInsight = async (id: string): Promise<void> => {
    await handleApiCall(() => apiService.archiveConversationInsightOnBackend(id), () => {
      queryClient.setQueryData(queryKeys.conversations.all, (old: Conversation[] | undefined) =>
        old ? old.map(c => c.id === id ? { ...c, isInsightArchivedByUser: true } : c) : []
      );
    }, 'Failed to archive conversation insight.');
  };

  const archiveQuestionnaireResult = async (id: string): Promise<void> => {
    await handleApiCall(() => apiService.archiveQuestionnaireResultOnBackend(id), () => {
      queryClient.setQueryData(queryKeys.questionnaires.myResults, (old: UserQuestionnaireResult[] | undefined) =>
        old ? old.filter(r => r.id !== id) : []
      );
    }, 'Failed to archive result.');
  };

  const restorePersonalInsight = async (id: string): Promise<boolean> => {
    const result = await handleApiCall(() => apiService.restorePersonalInsightOnBackend(id), (restoredInsight: PersonalInsight) => {
      const insight = { ...restoredInsight, updatedAt: new Date(restoredInsight.updatedAt) };
      queryClient.setQueryData(queryKeys.insights.personal, (old: PersonalInsight[] | undefined) =>
        [...(old ?? []), insight].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      );
    }, 'Failed to restore insight.');
    return result !== null;
  };

  const restoreConversationInsight = async (id: string): Promise<boolean> => {
    const result = await handleApiCall(() => apiService.restoreConversationInsightOnBackend(id), () => {
      queryClient.setQueryData(queryKeys.conversations.all, (old: Conversation[] | undefined) =>
        old ? old.map(c => c.id === id ? { ...c, isInsightArchivedByUser: false } : c) : []
      );
    }, 'Failed to restore conversation insight.');
    return result !== null;
  };

  const restoreQuestionnaireResult = async (id: string): Promise<boolean> => {
    const result = await handleApiCall(() => apiService.restoreQuestionnaireResultOnBackend(id), (restoredResult: UserQuestionnaireResult) => {
      const resultWithDate = { ...restoredResult, completedAt: new Date(restoredResult.completedAt) };
      queryClient.setQueryData(queryKeys.questionnaires.myResults, (old: UserQuestionnaireResult[] | undefined) =>
        [...(old ?? []), resultWithDate]
      );
    }, 'Failed to restore result.');
    return result !== null;
  };

  // Academy Settings
  const updateAcademySettings = async (settings: Partial<AcademySettings> & { logoUpload?: string; }) => {
      const result = await handleApiCall(() => apiService.updateThemeSettingsOnBackend(settings), undefined, 'Failed to update academy settings.');
      if (result) {
        await fetchAcademySettings();
      }
      return result;
  };

  const setAcademySettingsLocal = (settings: AcademySettings | null) => {
      queryClient.setQueryData(queryKeys.settings.academy, settings);
  };

  const regenerateApiKey = async () => {
    return await handleApiCall(() => apiService.regenerateApiKey(), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.academy, (prev: AcademySettings | null | undefined) =>
          ({ ...(prev as AcademySettings), ...updatedSettings })
        );
    }, 'Failed to regenerate API key.');
  };

  const enableBridge = async () => {
    return await handleApiCall(() => apiService.enableBridge(), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.academy, (prev: AcademySettings | null | undefined) =>
          ({ ...(prev as AcademySettings), ...updatedSettings })
        );
    }, 'Failed to enable bridge.');
  };

  const disableBridge = async () => {
    return await handleApiCall(() => apiService.disableBridge(), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.academy, (prev: AcademySettings | null | undefined) =>
          ({ ...(prev as AcademySettings), ...updatedSettings })
        );
    }, 'Failed to disable bridge.');
  };

  const regenerateBridgeKey = async () => {
    return await handleApiCall(() => apiService.regenerateBridgeKey(), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.academy, (prev: AcademySettings | null | undefined) =>
          ({ ...(prev as AcademySettings), ...updatedSettings })
        );
    }, 'Failed to regenerate bridge key.');
  };

  // System Settings (System Admin)
  const updateSystemSettings = async (settings: SystemSettings) => {
      const updated = await handleApiCall(() => apiService.updateTokenLimits(settings), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.system, updatedSettings);
      }, 'Failed to update system settings.');
      return !!updated;
  };

  const updateTutorialSettings = async (settings: TutorialSettings) => {
      const updated = await handleApiCall(() => apiService.updateTutorialSettings(settings), (updatedSettings) => {
        queryClient.setQueryData(queryKeys.settings.tutorial, updatedSettings);
      }, 'Failed to update tutorial settings.');
      return !!updated;
  };

  // Courses
  const deleteCourse = async (id: string, force = false): Promise<{ isConflict: boolean, dependencies?: any }> => {
    try {
        await apiService.deleteCourse(id, force);
        await fetchCourses();
        return { isConflict: false };
    } catch (error: any) {
        if (error.isConflict) { return { isConflict: true, dependencies: error.dependencies }; }
        setDataError(error.message || 'An error occurred.');
        return { isConflict: false };
    }
  };
  const confirmArchiveCourse = async (id: string): Promise<boolean> => {
    const success = await handleApiCall(() => apiService.deleteCourse(id, true), () => fetchCourses(), 'Failed to archive course.');
    return success === null;
  };
  const restoreCourse = async (id: string) => {
    const success = await handleApiCall(() => apiService.restoreCourse(id), undefined, 'Failed to restore course.');
    if (success) {
      await fetchCourses();
      await fetchArchivedCourses();
    }
    return !!success;
  };

  // Progress
  const markLessonComplete = async (courseId: string, lessonId: string) => {
      const updatedProgress = await handleApiCall(() => apiService.markLessonAsComplete(courseId, lessonId), undefined, 'Failed to mark lesson complete.');
      if (updatedProgress) {
          queryClient.setQueryData(queryKeys.progress.my, (old: UserCourseProgress[] | undefined) => {
              const prev = old ?? [];
              const existingIndex = prev.findIndex(p => p.courseId === courseId);
              if (existingIndex > -1) {
                  return prev.map((p, index) => index === existingIndex ? updatedProgress : p);
              }
              return [...prev, updatedProgress];
          });
          return true;
      }
      return false;
  };

  // Billing
  const topUpUsage = async (additionalUsers: number) => {
    return await handleApiCall(() => apiService.topUpUsage(additionalUsers), (updatedCycle) => {
        queryClient.setQueryData(queryKeys.billing.currentCycle, updatedCycle);
    }, 'Failed to process top-up.');
  };

  return (
    <DataContext.Provider value={{
      academies, fetchAcademies, addAcademy, updateAcademy, deleteAcademy, addAcademyAdmin, removeAcademyAdmin,
      organizations, archivedOrganizations, fetchOrganizations, fetchArchivedOrganizations, addOrganization, updateOrganization, deleteOrganization, confirmArchiveOrganization, restoreOrganization, addOrganizationManager, removeOrganizationManager, removeUserFromOrganization,
      plans, archivedPlans, fetchPlans, fetchArchivedPlans, addPlan, updatePlan, deletePlan, confirmArchivePlan, restorePlan,
      conversations, fetchUserConversations, saveConversation, deleteConversationMessages,
      users, fetchUsers, deleteUser, cancelUserSubscriptionByAdmin,
      preApprovedUsers, preApproveUsersInBulk, revokePreApprovedUser,
      accessiblePersonas, fetchAccessiblePersonas,
      chatPersonas, archivedChatPersonas, fetchChatPersonas, fetchArchivedChatPersonas, addChatPersona, updateChatPersona, deleteChatPersona, confirmArchiveChatPersona, restoreChatPersona,
      publishedQuestionnaires,
      questionnaires, archivedQuestionnaires, fetchQuestionnaires, fetchPublishedQuestionnaires, fetchArchivedQuestionnaires, deleteQuestionnaire, confirmArchiveQuestionnaire, restoreQuestionnaire,
      myQuestionnaireResults, fetchMyLatestResults, saveQuestionnaireResult,
      personalInsights, savePersonalInsight, archivePersonalInsight, archiveConversationInsight, archiveQuestionnaireResult, restorePersonalInsight, restoreConversationInsight, restoreQuestionnaireResult,
      academySettings, updateAcademySettings, setAcademySettingsLocal, regenerateApiKey, enableBridge, disableBridge, regenerateBridgeKey,
      systemSettings, fetchSystemSettings, updateSystemSettings,
      tutorialSettings, fetchTutorialSettings, updateTutorialSettings,
      courses, archivedCourses, fetchCourses, fetchArchivedCourses, fetchCourseWithLessons, deleteCourse, confirmArchiveCourse, restoreCourse,
      myProgress, organizationProgress, fetchProgress, markLessonComplete,
      userTokenUsage, orgTokenUsage, academyTokenUsage, fetchUserTokenUsage, fetchOrgTokenUsage, fetchAcademyTokenUsage, isAnalyticsLoading,
      currentBillingCycle, fetchCurrentBillingCycle, topUpUsage,
      isLoading, dataError, clearDataError, fetchAllData
    }}>
      {children}
    </DataContext.Provider>
  );
};
