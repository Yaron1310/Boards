// ... existing imports ...
import type { Message, ExtractedFactors, User, Content, Organization, Conversation, TriggerPhrase, UserQuestionnaireResult, PreApprovedUser, Course, Lesson, UserCourseProgress, AcademySettings, TokenUsageData, Academy, UserRole, ChatPersona, Questionnaire, Category, Question, Plan, SystemSettings, PersonalInsight, TutorialSettings, AcademyPayoutData, AcademyBillingCycle, PaginatedResponse, NewsletterCampaign, NewsletterEdition } from '../types';
import { BACKEND_API_URL } from '../constants';

const handleAuthError = () => {
    if (!(window as any).isLoggingOut) {
        window.dispatchEvent(new CustomEvent('session-expired'));
    }
};

export const AUTH_TOKEN_STORAGE_KEY = 'authJwt';

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const callerHeaders = (options.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...callerHeaders,
  };
  // Add stored token as Bearer if no explicit Authorization header was provided by the caller
  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  
  if (response.status === 401) {
      const errorData = await response.json().catch(() => ({ message: '' }));
      const serverMessage = errorData.message || '';
      // Only trigger session expiration for actual auth/token issues,
      // not for business-logic 401s like "Incorrect current password"
      const isSessionError = !serverMessage || /token|session|expired|unauthorized/i.test(serverMessage);
      if (isSessionError) {
          handleAuthError();
      }
      const err: any = new Error(isSessionError ? "Your session has expired. Please log in again." : serverMessage);
      err.status = 401;
      throw err;
  }
  if (response.status === 403) {
      const errorData = await response.json().catch(() => ({ message: 'You do not have permission to perform this action.' }));
      const error: any = new Error(errorData.message);
      error.status = 403;
      if (errorData.code) {
          error.code = errorData.code;
      }
      if (errorData.academyId) {
          error.academyId = errorData.academyId;
      }
      throw error;
  }


  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: `HTTP error! status: ${response.status}` };
    }

    if (response.status === 409 && errorData.dependencies) {
        const conflictError: any = new Error(errorData.message || 'Conflict with existing resources.');
        conflictError.isConflict = true;
        conflictError.dependencies = errorData.dependencies;
        throw conflictError;
    }

    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  if (response.status === 204) {
    return null; 
  }
  return response.json();
};

// ... existing streamMessageFromBackend ...
export const streamMessageFromBackend = async (
  messageText: string,
  history: Message[],
  personaId: string,
  onChunk: (chunkText: string) => void,
  onError: (errorMessage: string) => void,
  onEnd: () => void
): Promise<void> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };

  const backendHistory: Content[] = history.map(msg => ({
    role: msg.sender === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));


  try {
    const payload = JSON.stringify({ message: messageText, history: backendHistory, personaId });

    const response = await fetch(`${BACKEND_API_URL}/api/chat/send-message`, {
      method: 'POST',
      headers,
      body: payload,
      credentials: 'include',
    });

    if (response.status === 401) {
        handleAuthError();
        throw new Error("Your session has expired. Please log in again.");
    }
    if (response.status === 403) {
        const errorData = await response.json().catch(() => ({ message: 'You do not have permission for this action.'}));
        throw new Error(errorData.message);
    }


    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch(e){
            errorData = { message: `Streaming failed: ${response.statusText}` };
        }
      throw new Error(errorData.message || `Streaming failed: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let streamDone = false;
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) {
        streamDone = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const eventString = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 2);
        
        if (eventString.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(eventString.substring(6)); 
            if (jsonData.event === 'end') {
              onEnd();
              return;
            }
            if (jsonData.event === 'error' || jsonData.error) {
              onError(jsonData.error || jsonData.details || 'Unknown streaming error');
              onEnd();
              return;
            }
            if (jsonData.text) {
              onChunk(jsonData.text);
            }
          } catch (e) {
            console.error('Error parsing SSE data chunk:', e, "Raw data:", eventString);
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred while streaming.";
    console.error("Error streaming message from backend:", error);
    onError(errorMessage);
  } finally {
    onEnd();
  }
};

export const extractFactorsFromBackend = async (conversationMessages: Message[], personaId: string): Promise<ExtractedFactors> => {
    // ... implementation ...
      try {
    const data = await fetchWithAuth('/api/chat/extract-insights', {
      method: 'POST',
      body: JSON.stringify({ conversationMessages, personaId }), 
    });
    return data as ExtractedFactors;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to extract insights via backend.";
    console.error("Error extracting factors from backend:", error);
    throw new Error(errorMessage);
  }
};

// ... existing Auth functions ...
export const initiateCheckoutRegistration = async (formData: any): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/initiate-checkout-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }
    return data;
};

export const registerAcademyAdmin = async (userData: any, planId: string, recaptchaToken?: string | null): Promise<{ success: boolean; message: string; }> => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/register-academy-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, planId, ...(recaptchaToken ? { recaptchaToken } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Registration failed');
    return data;
};

export const requestPasswordReset = async (email: string, recaptchaToken?: string | null): Promise<{ message: string }> => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...(recaptchaToken ? { recaptchaToken } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send reset email.');
    return data;
};

export const resetPassword = async (token: string, newPassword: string): Promise<{ message: string }> => {
     const response = await fetch(`${BACKEND_API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to reset password.');
    return data;
};

export const selectContextOnBackend = async (partialToken: string, organizationId: string, role: UserRole) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/select-context', { method: 'POST', body: JSON.stringify({ organizationId, role }), headers: authHeader });
};
export const switchContextOnBackend = async (organizationId: string, role: UserRole) => fetchWithAuth('/api/auth/switch-context', { method: 'PUT', body: JSON.stringify({ organizationId, role }) });
export const getGoogleLoginFinalization = async (partialToken: string) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/google/finalize', { headers: authHeader });
};

export const finalizeAcademySetup = async (partialToken: string) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/academy/finalize', { headers: authHeader });
};

// New function to finalize payment-based login
export const finalizePaymentSession = async (sessionId: string) => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/finalize-payment-session?session_id=${sessionId}`, {
        credentials: 'include',
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Session finalization failed.' }));
        throw new Error(errorData.message || 'Session finalization failed.');
    }
    return response.json();
};

// New Native Auth
export const verifyNativeGoogleToken = async (idToken: string) => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/google/native`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Native Google Auth failed.');
    return data;
};

export const verifyNativeMicrosoftToken = async (idToken: string) => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/microsoft/native`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Native Microsoft Auth failed.');
    return data;
};

// --- Academy Setup ---
export const setupAcademy = async (academyName: string): Promise<{ message: string }> => {
    return fetchWithAuth('/api/academies/setup', {
        method: 'POST',
        body: JSON.stringify({ academyName }),
    });
};

export const activateAcademySubscription = async (): Promise<{ user: User, selectedOrganization: Organization, accessToken: string }> => {
    return fetchWithAuth('/api/academies/activate-subscription', {
        method: 'POST',
    });
};

export const checkAcademyNameUniqueness = async (name: string): Promise<{ isUnique: boolean }> => {
    return fetchWithAuth(`/api/academies/check-name?name=${encodeURIComponent(name)}`);
};


// --- Academies ---
export const getAcademies = async (): Promise<Academy[]> => fetchWithAuth('/api/academies');
export const createAcademy = async (name: string): Promise<Academy> => fetchWithAuth('/api/academies', { method: 'POST', body: JSON.stringify({ name }) });
export const updateAcademy = async (id: string, name: string): Promise<Academy> => fetchWithAuth(`/api/academies/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteAcademy = async (id: string): Promise<null> => fetchWithAuth(`/api/academies/${id}`, { method: 'DELETE' });
export const addAcademyAdmin = async (academyId: string, email: string): Promise<{message: string}> => fetchWithAuth(`/api/academies/${academyId}/admins`, { method: 'POST', body: JSON.stringify({ email }) });
export const removeAcademyAdmin = async (academyId: string, userId: string): Promise<{message: string}> => fetchWithAuth(`/api/academies/${academyId}/admins/${userId}`, { method: 'DELETE' });


// --- Organizations ---
export const getOrganizations = async (filterType?: 'corporate' | 'individual' | 'all'): Promise<Organization[]> => {
    let url = '/api/organizations';
    if (filterType && filterType !== 'all') {
        url += `?type=${filterType}`;
    }
    return fetchWithAuth(url);
};
export const getArchivedOrganizations = async (): Promise<Organization[]> => fetchWithAuth('/api/organizations/archived');
export const restoreOrganization = async (id: string): Promise<Organization> => fetchWithAuth(`/api/organizations/${id}/restore`, { method: 'PUT' });
export const addOrganizationToBackend = async (name: string, academyId: string, planId?: string): Promise<Organization> => fetchWithAuth('/api/organizations', { method: 'POST', body: JSON.stringify({ name, academyId, planId }) });
export const updateOrganizationOnBackend = async (id: string, data: { name?: string, planId?: string, subscriptionProvider?: string }): Promise<Organization> => fetchWithAuth(`/api/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteOrganizationFromBackend = async (id: string, force = false): Promise<null> => {
    return fetchWithAuth(`/api/organizations/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
};
export const addOrganizationManager = async (organizationId: string, email: string): Promise<{message: string}> => fetchWithAuth(`/api/organizations/${organizationId}/admins`, { method: 'POST', body: JSON.stringify({ email }) });
export const removeOrganizationManager = async (organizationId: string, userId: string): Promise<{message: string}> => fetchWithAuth(`/api/organizations/${organizationId}/admins/${userId}`, { method: 'DELETE' });
export const removeUserFromOrganization = async (organizationId: string, userId: string): Promise<null> => fetchWithAuth(`/api/organizations/${organizationId}/users/${userId}`, { method: 'DELETE' });


// --- Users ---
export const getUsers = async (params?: { limit?: number; cursor?: string; search?: string; organizationId?: string; role?: string }): Promise<PaginatedResponse<User>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    if (params?.organizationId) query.append('organizationId', params.organizationId);
    if (params?.role) query.append('role', params.role);
    const qs = query.toString();
    return fetchWithAuth(`/api/users${qs ? `?${qs}` : ''}`);
};
export const getUserByIdFromBackend = async (userId: string): Promise<User> => fetchWithAuth(`/api/users/${userId}`);
export const deleteUserAccount = async (userId: string, deletionType: 'soft' | 'hard'): Promise<null> => fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE', body: JSON.stringify({ deletionType }) });
export const preApproveUsersInBulk = async (emails: string[], organizationId: string): Promise<{successCount: number; message: string;}> => fetchWithAuth('/api/users/pre-approve-bulk', { method: 'POST', body: JSON.stringify({ emails, organizationId }) });

export const getPreApprovedUsersFromBackend = async (params?: { limit?: number; cursor?: string; search?: string }): Promise<PaginatedResponse<PreApprovedUser>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchWithAuth(`/api/users/pre-approved${qs ? `?${qs}` : ''}`);
};
export const deletePreApprovedUserFromBackend = async (preApprovedUserId: string): Promise<null> => fetchWithAuth(`/api/users/pre-approved/${preApprovedUserId}`, { method: 'DELETE' });


export const getUserConversationsFromBackend = async (params?: { limit?: number; cursor?: string; search?: string; personaId?: string }): Promise<PaginatedResponse<Conversation>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    if (params?.personaId) query.append('personaId', params.personaId);
    const qs = query.toString();
    return fetchWithAuth(`/api/conversations${qs ? `?${qs}` : ''}`);
};
export const saveConversationToBackend = async (conversationData: { messages: Message[], extractedFactors: ExtractedFactors, personaId: string, personaName: string, isPrivate?: boolean }): Promise<Conversation> => fetchWithAuth('/api/conversations', { method: 'POST', body: JSON.stringify(conversationData) });
export const getConversationMessagesFromBackend = async (conversationId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Message>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    const qs = query.toString();
    return fetchWithAuth(`/api/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
};
export const deleteConversationMessagesFromBackend = async (conversationId: string): Promise<Conversation> =>
  fetchWithAuth(`/api/conversations/${conversationId}/messages`, { method: 'DELETE' });

export const getTriggerPhrasesFromBackend = async (): Promise<TriggerPhrase[]> => fetchWithAuth('/api/trigger-phrases');
export const addTriggerPhraseToBackend = async (language: string, phrase: string): Promise<TriggerPhrase> => fetchWithAuth('/api/trigger-phrases', { method: 'POST', body: JSON.stringify({ language, phrase }) });
export const updateTriggerPhraseToBackend = async (id: string, language: string, phrase: string): Promise<TriggerPhrase> => fetchWithAuth(`/api/trigger-phrases/${id}`, { method: 'PUT', body: JSON.stringify({ language, phrase }) });
export const deleteTriggerPhraseFromBackend = async (id: string): Promise<null> => fetchWithAuth(`/api/trigger-phrases/${id}`, { method: 'DELETE' });

// --- Chat Personas ---
export const getChatPersonas = async (): Promise<ChatPersona[]> => fetchWithAuth('/api/chat-personas');
export const getArchivedChatPersonas = async (): Promise<ChatPersona[]> => fetchWithAuth('/api/chat-personas/archived');
export const restoreChatPersona = async (id: string): Promise<ChatPersona> => fetchWithAuth(`/api/chat-personas/${id}/restore`, { method: 'PUT' });
export const getAccessibleChatPersonas = async (): Promise<ChatPersona[]> => fetchWithAuth('/api/chat-personas/accessible');
export const createChatPersona = async (data: Partial<ChatPersona>): Promise<ChatPersona> => fetchWithAuth('/api/chat-personas', { method: 'POST', body: JSON.stringify(data) });
export const updateChatPersona = async (id: string, data: Partial<ChatPersona>): Promise<ChatPersona> => fetchWithAuth(`/api/chat-personas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteChatPersona = async (id: string, force = false): Promise<null> => fetchWithAuth(`/api/chat-personas/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });

// --- Plans ---
export const getPlans = async (): Promise<Plan[]> => fetchWithAuth('/api/plans');
export const getArchivedPlans = async (): Promise<Plan[]> => fetchWithAuth('/api/plans/archived');
export const restorePlan = async (id: string): Promise<Plan> => fetchWithAuth(`/api/plans/${id}/restore`, { method: 'PUT' });
export const createPlan = async (data: Partial<Plan>): Promise<Plan> => fetchWithAuth('/api/plans', { method: 'POST', body: JSON.stringify(data) });
export const updatePlan = async (id: string, data: Partial<Plan>): Promise<Plan> => fetchWithAuth(`/api/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePlan = async (id: string, force = false): Promise<null> => fetchWithAuth(`/api/plans/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });

// --- Public Single-User Plans ---
export const getPublicSingleUserPlans = async (academyId: string): Promise<Plan[]> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/academy/${academyId}/single-user-plans`, {
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        return [];
    }
    return response.json();
};

// --- Self-Subscribe (existing user) ---
export const selfSubscribe = async (payload: {
    planId: string;
    company: string;
    address: string;
    city: string;
    zip: string;
    country: string;
}): Promise<{ iframeUrl: string }> => fetchWithAuth('/api/payments/self-subscribe', { method: 'POST', body: JSON.stringify(payload) });


// User's own profile updates
export const getMyUserDetails = async (): Promise<{ user: User, selectedOrganization: Organization }> => fetchWithAuth('/api/users/me/details');
export const updateMyUserDetails = async (details: { name?: string; email?: string; conversationSavingEnabled?: boolean; preferredLanguage?: string }): Promise<User> => fetchWithAuth('/api/users/me/details', { method: 'PUT', body: JSON.stringify(details) });
export const updateMyPassword = async (passwords: { currentPassword?: string; newPassword: string }): Promise<{ message: string }> => fetchWithAuth('/api/users/me/password', { method: 'PUT', body: JSON.stringify(passwords) });
export const updateMyProfileImage = async (imageUrl: string): Promise<User> => fetchWithAuth('/api/users/me/profile-image', { method: 'PUT', body: JSON.stringify({ imageUrl }) });
export const markChatNoticeAsSeen = async (): Promise<User> => fetchWithAuth('/api/users/me/seen-chat-notice', { method: 'PUT' });
export const cancelMySubscription = async (): Promise<{ message: string }> => fetchWithAuth('/api/users/me/cancel-subscription', { method: 'POST' });
export const restoreMySubscription = async (): Promise<{ message: string }> => fetchWithAuth('/api/users/me/restore-subscription', { method: 'POST' });
export const cancelUserSubscriptionByAdmin = async (userId: string): Promise<{ message: string }> => fetchWithAuth(`/api/users/${userId}/cancel-subscription`, { method: 'POST' });

// --- Custom Personal Insights from Lessons ---
export const savePersonalInsightToBackend = async (payload: { key: string; label: string; value: any }): Promise<PersonalInsight> => fetchWithAuth(`/api/users/me/insights`, { method: 'PUT', body: JSON.stringify(payload) });
export const getMyPersonalInsightsFromBackend = async (): Promise<PersonalInsight[]> => fetchWithAuth('/api/users/me/insights');
export const archivePersonalInsightOnBackend = async (id: string): Promise<null> => fetchWithAuth(`/api/users/me/insights/${id}`, { method: 'DELETE' });
export const archiveConversationInsightOnBackend = async (id: string): Promise<null> => fetchWithAuth(`/api/conversations/${id}/archive-insight`, { method: 'PUT' });
export const archiveQuestionnaireResultOnBackend = async (id: string): Promise<null> => fetchWithAuth(`/api/questionnaire-results/${id}/archive`, { method: 'PUT' });
export const getArchivedPersonalInsights = async (): Promise<PersonalInsight[]> => fetchWithAuth('/api/users/me/insights/archived');
export const restorePersonalInsightOnBackend = async (id: string): Promise<PersonalInsight> => fetchWithAuth(`/api/users/me/insights/${id}/restore`, { method: 'PUT' });
export const restoreConversationInsightOnBackend = async (id: string): Promise<Conversation> => fetchWithAuth(`/api/conversations/${id}/restore-insight`, { method: 'PUT' });
export const getMyArchivedResults = async (): Promise<UserQuestionnaireResult[]> => fetchWithAuth('/api/questionnaire-results/my-archived');
export const restoreQuestionnaireResultOnBackend = async (id: string): Promise<UserQuestionnaireResult> => fetchWithAuth(`/api/questionnaire-results/${id}/restore`, { method: 'PUT' });


// --- Questionnaires (User-Facing) ---
export const getPublishedQuestionnaires = async (params?: { limit?: number; cursor?: string; search?: string }): Promise<PaginatedResponse<Questionnaire>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchWithAuth(`/api/questionnaires${qs ? `?${qs}` : ''}`);
};
export const getQuestionnaireForUser = async (questionnaireId: string): Promise<Questionnaire> => fetchWithAuth(`/api/questionnaires/${questionnaireId}`);
export const saveUserQuestionnaireResultToBackend = async (questionnaireId: string, resultData: Partial<Pick<UserQuestionnaireResult, 'categoryScores' | 'topCategories' | 'source'>> & Record<string, any>): Promise<UserQuestionnaireResult> => fetchWithAuth(`/api/questionnaires/${questionnaireId}/results`, { method: 'POST', body: JSON.stringify(resultData) });
export const getMyLatestQuestionnaireResultsFromBackend = async (): Promise<UserQuestionnaireResult[]> => fetchWithAuth('/api/questionnaire-results/my-latest');
export const getLatestQuestionnaireResults = async (questionnaireId: string, source?: 'standalone' | 'assignment'): Promise<UserQuestionnaireResult | null> => fetchWithAuth(`/api/questionnaires/${questionnaireId}/results/latest${source ? `?source=${source}` : ''}`);

// --- Questionnaires (Admin) ---
export const getQuestionnairesForAdmin = async (params?: { limit?: number; cursor?: string; search?: string }): Promise<PaginatedResponse<Questionnaire>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchWithAuth(`/api/admin/questionnaires${qs ? `?${qs}` : ''}`);
};
export const getArchivedQuestionnaires = async (): Promise<Questionnaire[]> => fetchWithAuth('/api/admin/questionnaires/archived');
export const restoreQuestionnaire = async (id: string): Promise<Questionnaire> => fetchWithAuth(`/api/admin/questionnaires/${id}/restore`, { method: 'PUT' });
export const createQuestionnaire = async (data: Partial<Omit<Questionnaire, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Questionnaire> => fetchWithAuth('/api/admin/questionnaires', { method: 'POST', body: JSON.stringify(data) });
export const updateQuestionnaire = async (id: string, data: Partial<Omit<Questionnaire, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Questionnaire> => fetchWithAuth(`/api/admin/questionnaires/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteQuestionnaire = async (id: string, force = false): Promise<null> => fetchWithAuth(`/api/admin/questionnaires/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });

export const getCategoriesForAdmin = async (qId: string): Promise<Category[]> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories`);
export const createCategory = async (qId: string, data: Partial<Omit<Category, 'id' | 'questionnaireId'>>): Promise<Category> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories`, { method: 'POST', body: JSON.stringify(data) });
export const updateCategory = async (qId: string, cId: string, data: Partial<Omit<Category, 'id' | 'questionnaireId'>>): Promise<Category> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCategory = async (qId: string, cId: string): Promise<null> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}`, { method: 'DELETE' });

export const getQuestionsForAdmin = async (qId: string, cId: string): Promise<Question[]> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}/questions`);
export const createQuestion = async (qId: string, cId: string, data: Partial<Omit<Question, 'id' | 'categoryId'>>): Promise<Question> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}/questions`, { method: 'POST', body: JSON.stringify(data) });
export const updateQuestion = async (qId: string, cId: string, quId: string, data: Partial<Omit<Question, 'id' | 'categoryId'>>): Promise<Question> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}/questions/${quId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteQuestion = async (qId: string, cId: string, quId: string): Promise<null> => fetchWithAuth(`/api/admin/questionnaires/${qId}/categories/${cId}/questions/${quId}`, { method: 'DELETE' });


// --- Analytics ---
export const getUserTokenUsage = async (month?: number, year?: number): Promise<TokenUsageData> => {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (month) params.append('month', String(month));
  return fetchWithAuth(`/api/analytics/users?${params.toString()}`);
};

export const getOrgTokenUsage = async (month?: number, year?: number): Promise<TokenUsageData> => {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (month) params.append('month', String(month));
  return fetchWithAuth(`/api/analytics/organizations?${params.toString()}`);
};

export const getAcademyTokenUsage = async (month?: number, year?: number): Promise<TokenUsageData> => {
  const params = new URLSearchParams();
  if (year) params.append('year', String(year));
  if (month) params.append('month', String(month));
  return fetchWithAuth(`/api/analytics/academies?${params.toString()}`);
};

// --- Payments ---
export const getAcademyPayouts = async (): Promise<AcademyPayoutData[]> => fetchWithAuth('/api/payments/payouts');

// New: Initiate Payment Simulator
export const initiatePaymentSimulator = async (payload: {
    planId: string;
    name: string;
    email: string;
    password?: string;
    company: string;
    address: string;
    city: string;
    zip: string;
    country: string;
    checkoutSessionId?: string | null;
    organizationId?: string | null;
}): Promise<{ iframeUrl: string }> => {
    const response = await fetch(`${BACKEND_API_URL}/api/payments/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to initiate payment.');
    return data;
};

export const logoutFromBackend = async (): Promise<void> => {
    await fetch(`${BACKEND_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
    });
};

// ... existing Billing ...
export const getCurrentBillingCycle = async (): Promise<AcademyBillingCycle> => fetchWithAuth('/api/billing/current-cycle');
export const topUpUsage = async (additionalUsers: number): Promise<AcademyBillingCycle> => fetchWithAuth('/api/billing/top-up', { method: 'POST', body: JSON.stringify({ additionalUsers }) });
export const createBillingCycles = async (): Promise<{ message: string }> => fetchWithAuth('/api/billing/create-cycles', { method: 'POST' });


// --- Digital Courses ---
export const getCourses = async (params?: { limit?: number; cursor?: string; search?: string }): Promise<PaginatedResponse<Course>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchWithAuth(`/api/courses${qs ? `?${qs}` : ''}`);
};
export const getArchivedCourses = async (): Promise<Course[]> => fetchWithAuth('/api/courses/archived');
export const restoreCourse = async (id: string): Promise<Course> => fetchWithAuth(`/api/courses/${id}/restore`, { method: 'PUT' });
export const getCourseWithLessons = async (courseId: string): Promise<Course> => fetchWithAuth(`/api/courses/${courseId}`);
export const createCourse = async (data: { name: string, description: string, coverImage?: string }): Promise<Course> => fetchWithAuth('/api/courses', { method: 'POST', body: JSON.stringify(data) });
export const updateCourse = async (courseId: string, data: { name: string, description: string, coverImage?: string }): Promise<Course> => fetchWithAuth(`/api/courses/${courseId}`, { method: 'PUT', body: JSON.stringify(data) });
export const generateCourseCoverImage = async (customInstructions: string, imageStyle: 'realistic' | 'illustration'): Promise<{ imageData: string }> => fetchWithAuth('/api/courses/generate-cover-image', { method: 'POST', body: JSON.stringify({ customInstructions, imageStyle }) });
export const recalculateAllCourseDurations = async (): Promise<{ message: string; updated: number }> => fetchWithAuth('/api/courses/recalculate-durations', { method: 'POST' });
export const deleteCourse = async (courseId: string, force = false): Promise<null> => fetchWithAuth(`/api/courses/${courseId}${force ? '?force=true' : ''}`, { method: 'DELETE' });

export const createLesson = async (courseId: string, data: Omit<Lesson, 'id' | 'courseId' | 'createdAt' | 'updatedAt'>): Promise<Lesson> => {
    try {
        const result = await fetchWithAuth(`/api/courses/${courseId}/lessons`, { method: 'POST', body: JSON.stringify(data) });
        return result;
    } catch (error) {
        throw error;
    }
};
export const updateLesson = async (courseId: string, lessonId: string, data: Partial<Omit<Lesson, 'id' | 'courseId' | 'createdAt' | 'updatedAt'>>): Promise<Lesson> => fetchWithAuth(`/api/courses/${courseId}/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteLesson = async (courseId: string, lessonId: string): Promise<null> => fetchWithAuth(`/api/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE' });
export const generateQuizQuestionFromTranscript = async (transcript: string, existingQuestions: string[]): Promise<{ questionText: string; answers: string[]; correctAnswerIndex: number; }> => fetchWithAuth('/api/courses/generate-question', { method: 'POST', body: JSON.stringify({ transcript, existingQuestions }) });
export const transcribeMediaFile = async (base64Data: string, mimeType: string): Promise<{ transcript: string }> => fetchWithAuth('/api/courses/transcribe', { method: 'POST', body: JSON.stringify({ mediaData: base64Data, mimeType }) });

// --- Progress Tracking ---
export const markLessonAsComplete = async (courseId: string, lessonId: string): Promise<UserCourseProgress> => fetchWithAuth(`/api/courses/${courseId}/lessons/${lessonId}/complete`, { method: 'POST' });
export const getMyProgress = async (): Promise<UserCourseProgress[]> => fetchWithAuth('/api/courses/progress/me');
export const getOrganizationProgress = async (): Promise<UserCourseProgress[]> => fetchWithAuth('/api/courses/progress/organization');

// --- Lesson Chat ---
export const streamLessonChatMessage = async (
    payload: { courseId: string; lessonId: string; message: string; history: Message[] },
    onChunk: (chunkText: string) => void,
    onError: (errorMessage: string) => void,
    onEnd: () => void
): Promise<void> => {
    const headers: HeadersInit = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };

    const backendHistory: Content[] = payload.history.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));

    try {
        const response = await fetch(`${BACKEND_API_URL}/api/courses/lessons/chat`, {
            method: 'POST', headers,
            body: JSON.stringify({ ...payload, history: backendHistory }),
            credentials: 'include',
        });
        
        if (response.status === 401 || response.status === 403) {
            handleAuthError();
            throw new Error("Your session has expired. Please log in again.");
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `Streaming failed: ${response.statusText}` }));
            throw new Error(errorData.message);
        }
        if (!response.body) throw new Error('Response body is null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let streamDone = false;
        while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) { streamDone = true; break; }
            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                const eventString = buffer.substring(0, boundary);
                buffer = buffer.substring(boundary + 2);
                if (eventString.startsWith('data: ')) {
                    try {
                        const jsonData = JSON.parse(eventString.substring(6));
                        if (jsonData.event === 'end') { onEnd(); return; }
                        if (jsonData.event === 'error' || jsonData.error) { onError(jsonData.error || 'Unknown streaming error'); onEnd(); return; }
                        if (jsonData.text) onChunk(jsonData.text);
                    } catch (e) { console.error('Error parsing SSE data chunk:', e, "Raw data:", eventString); }
                }
                boundary = buffer.indexOf('\n\n');
            }
        }
    } catch (error: any) {
        onError(error.message || "An unexpected error occurred while streaming.");
    } finally {
        onEnd();
    }
};

// --- System Prompts & Theme (Academy Settings) ---
export const getThemeSettingsFromBackend = async (): Promise<AcademySettings> => fetchWithAuth('/api/app-config/theme');
export const updateThemeSettingsOnBackend = async (settings: Partial<AcademySettings> & { logoUpload?: string; }): Promise<AcademySettings> => fetchWithAuth('/api/app-config/theme', { method: 'PUT', body: JSON.stringify(settings) });
export const regenerateApiKey = async (): Promise<AcademySettings> => fetchWithAuth('/api/app-config/api-key/regenerate', { method: 'POST' });

// --- Bridge (Self-Hosted Video) ---
export const enableBridge = async (): Promise<AcademySettings> => fetchWithAuth('/api/app-config/bridge/enable', { method: 'POST' });
export const disableBridge = async (): Promise<AcademySettings> => fetchWithAuth('/api/app-config/bridge/disable', { method: 'POST' });
export const regenerateBridgeKey = async (): Promise<AcademySettings> => fetchWithAuth('/api/app-config/bridge/regenerate-key', { method: 'POST' });
export const getBridgeToken = async (courseId: string, lessonId: string): Promise<{ playbackUrl: string }> => fetchWithAuth(`/api/courses/${courseId}/lessons/${lessonId}/bridge-token`);

// --- System-wide Settings (System Admin only) ---
export const getTokenLimits = async (): Promise<SystemSettings> => fetchWithAuth('/api/system-settings/token-limits');
export const updateTokenLimits = async (settings: SystemSettings): Promise<SystemSettings> => fetchWithAuth('/api/system-settings/token-limits', { method: 'PUT', body: JSON.stringify(settings) });

// --- Tutorial Settings ---
export const getTutorialSettings = async (): Promise<TutorialSettings> => fetchWithAuth('/api/system-settings/tutorials');
export const updateTutorialSettings = async (settings: TutorialSettings): Promise<TutorialSettings> => fetchWithAuth('/api/system-settings/tutorials', { method: 'PUT', body: JSON.stringify(settings) });

// --- Public Access ---
export const getPublicAcademyDetails = async (academyName: string): Promise<any> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/academy/${encodeURIComponent(academyName)}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch public details' }));
        throw new Error(errorData.message || 'Failed to fetch public details');
    }
    return response.json();
};

export const getPublicSinglePlanPage = async (academyName: string, planId: string): Promise<any> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/academy/${encodeURIComponent(academyName)}/plan/${planId}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch plan page' }));
        throw new Error(errorData.message || 'Failed to fetch plan page');
    }
    return response.json();
};

export const getPublicPlanDetails = async (planId: string): Promise<any> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/plan/${planId}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch plan details' }));
        throw new Error(errorData.message || 'Failed to fetch plan details');
    }
    return response.json();
};

export const getCheckoutSessionData = async (sessionId: string): Promise<any> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/checkout-session/${sessionId}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch checkout session data' }));
        throw new Error(errorData.message || 'Failed to fetch checkout session data');
    }
    return response.json();
};

export const mentorWizard = async (
  conversationHistory: Message[],
  currentPersona: Partial<ChatPersona>,
  userMessage: string
): Promise<{ updatedPersona: Partial<ChatPersona>, aiResponse: string }> => {
  const backendHistory = conversationHistory.map(msg => ({
    role: msg.sender === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  return fetchWithAuth('/api/ai/mentor-wizard', {
    method: 'POST',
    body: JSON.stringify({ conversationHistory: backendHistory, currentPersona, userMessage }),
  });
};


// --- Marketing / Newsletter Campaigns ---

export const fetchCampaigns = async (status?: string): Promise<NewsletterCampaign[]> => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fetchWithAuth(`/api/marketing/campaigns${query}`);
};

export const createCampaign = async (data: Omit<NewsletterCampaign, 'id' | 'academyId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'status'>): Promise<NewsletterCampaign> =>
    fetchWithAuth('/api/marketing/campaigns', { method: 'POST', body: JSON.stringify(data) });

export const updateCampaign = async (id: string, data: Partial<NewsletterCampaign>): Promise<NewsletterCampaign> =>
    fetchWithAuth(`/api/marketing/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const updateCampaignStatus = async (id: string, status: NewsletterCampaign['status']): Promise<{ id: string; status: string }> =>
    fetchWithAuth(`/api/marketing/campaigns/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });

export const deleteCampaign = async (id: string): Promise<null> =>
    fetchWithAuth(`/api/marketing/campaigns/${id}`, { method: 'DELETE' });

// --- Marketing / Newsletter Editions ---

export const fetchEditions = async (campaignId: string): Promise<NewsletterEdition[]> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions`);

export const createEdition = async (campaignId: string, data: Partial<Pick<NewsletterEdition, 'subject' | 'htmlContent' | 'title' | 'subtitle' | 'mainText'>> & { scheduledFor?: string }): Promise<NewsletterEdition> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions`, { method: 'POST', body: JSON.stringify(data) });

export const updateEdition = async (campaignId: string, id: string, data: Partial<Pick<NewsletterEdition, 'subject' | 'htmlContent' | 'title' | 'subtitle' | 'mainText' | 'showLogoInHeader'> & { scheduledFor?: string; status?: string }>): Promise<NewsletterEdition> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteEdition = async (campaignId: string, id: string): Promise<null> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}`, { method: 'DELETE' });

export const duplicateEdition = async (campaignId: string, id: string, data?: { scheduledFor?: string }): Promise<NewsletterEdition> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}/duplicate`, { method: 'POST', body: data ? JSON.stringify(data) : undefined });

export const testSendEdition = async (campaignId: string, id: string): Promise<{ message: string }> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}/test-send`, { method: 'POST' });

export const sendEditionNow = async (campaignId: string, id: string): Promise<{ totalRecipients: number; successCount: number; failCount: number }> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}/send`, { method: 'POST' });

export const reorderEdition = async (campaignId: string, id: string, direction: 'up' | 'down'): Promise<NewsletterEdition[]> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/${id}/reorder`, { method: 'PUT', body: JSON.stringify({ direction }) });

export const aiGenerateEdition = async (
    campaignId: string,
    body: {
        conversationHistory: { role: 'user' | 'model'; text: string }[];
        currentEdition: { title: string; subtitle: string; mainText: string };
        userMessage: string;
    }
): Promise<{ updatedEdition: { title: string; subtitle: string; mainText: string }; aiResponse: string }> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/ai-generate`, {
        method: 'POST',
        body: JSON.stringify(body),
    });

export const previewEditionHtml = async (
    campaignId: string,
    data: { title: string; subtitle: string; mainText: string; showLogoInHeader?: boolean }
): Promise<{ html: string }> =>
    fetchWithAuth(`/api/marketing/campaigns/${campaignId}/editions/preview-html`, {
        method: 'POST',
        body: JSON.stringify(data),
    });

// ---------------------------------------------------------------------------
// Course Assignment HTML AI Generation
// ---------------------------------------------------------------------------

export const aiGenerateAssignmentHtml = async (body: {
    conversationHistory: { role: 'user' | 'model'; text: string }[];
    currentHtml: string;
    currentCss: string;
    currentJs: string;
    userMessage: string;
}): Promise<{ html?: string; css?: string; js?: string; aiResponse: string }> =>
    fetchWithAuth('/api/courses/assignments/ai-generate-html', {
        method: 'POST',
        body: JSON.stringify(body),
    });

// ---------------------------------------------------------------------------
// Email Templates (System Admin)
// ---------------------------------------------------------------------------

export const getEmailTemplates = (): Promise<import('../types').EmailTemplate[]> =>
    fetchWithAuth('/api/email-templates');

export const updateEmailTemplate = (
    templateId: string,
    data: { subject: string; html: string }
): Promise<import('../types').EmailTemplate> =>
    fetchWithAuth(`/api/email-templates/${templateId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const resetEmailTemplate = (
    templateId: string
): Promise<import('../types').EmailTemplate> =>
    fetchWithAuth(`/api/email-templates/${templateId}/reset`, { method: 'POST' });

export const sendTestEmail = (
    templateId: string,
    toEmail: string
): Promise<{ message: string }> =>
    fetchWithAuth(`/api/email-templates/${templateId}/test`, {
        method: 'POST',
        body: JSON.stringify({ toEmail }),
    });

export type { ExtractedFactors };
