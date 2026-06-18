import type { User, Workspace, PreApprovedUser, OrganizationSettings, UserRole, SystemSettings, TutorialSettings, PaginatedResponse } from '../types';
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
    ...callerHeaders,
  };

  // If the body is FormData, the browser will set the Content-Type automatically (including boundary).
  // If we set it to 'application/json' or anything else, it will break.
  // If the user DID NOT provide a Content-Type, and it's NOT FormData, we default to application/json.
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
  }

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
      if (errorData.orgId) {
          error.orgId = errorData.orgId;
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

// --- Auth ---
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

export const registerOrganizationAdmin = async (userData: any, planId: string, recaptchaToken?: string | null): Promise<{ success: boolean; message: string; }> => {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/register-workspace-admin`, {
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

export const selectContextOnBackend = async (partialToken: string, workspaceId: string, role: UserRole) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/select-context', { method: 'POST', body: JSON.stringify({ workspaceId, role }), headers: authHeader });
};
export const switchContextOnBackend = async (workspaceId: string, role: UserRole) => fetchWithAuth('/api/auth/switch-context', { method: 'PUT', body: JSON.stringify({ workspaceId, role }) });
export const getGoogleLoginFinalization = async (partialToken: string) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/google/finalize', { headers: authHeader });
};

export const finalizeOrganizationSetup = async (partialToken: string) => {
    const authHeader = partialToken ? { 'Authorization': `Bearer ${partialToken}` } : {};
    return fetchWithAuth('/api/auth/workspace/finalize', { headers: authHeader });
};

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

export const logoutFromBackend = async (): Promise<void> => {
    await fetch(`${BACKEND_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
    });
};

// --- WorkHub Setup ---
export const setupOrganization = async (organizationName: string): Promise<{ message: string }> => {
    return fetchWithAuth('/api/workspaces/setup', {
        method: 'POST',
        body: JSON.stringify({ organizationName }),
    });
};

export const activateOrganizationSubscription = async (): Promise<{ user: User, selectedWorkspace: Workspace, accessToken: string }> => {
    return fetchWithAuth('/api/workspaces/activate-subscription', {
        method: 'POST',
    });
};

export const checkOrganizationNameUniqueness = async (name: string): Promise<{ isUnique: boolean }> => {
    return fetchWithAuth(`/api/workspaces/check-name?name=${encodeURIComponent(name)}`);
};


// --- Academy (Organization) Management (System Admin + Org Admin management) ---
export const getAcademies = async (): Promise<Workspace[]> => fetchWithAuth('/api/organizations');
export const createOrganization = async (name: string): Promise<Workspace> => fetchWithAuth('/api/organizations', { method: 'POST', body: JSON.stringify({ name }) });
export const updateOrganization = async (id: string, name: string): Promise<Workspace> => fetchWithAuth(`/api/organizations/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
export const deleteOrganization = async (id: string): Promise<null> => fetchWithAuth(`/api/organizations/${id}`, { method: 'DELETE' });
export const addOrganizationAdmin = async (orgId: string, email: string): Promise<{message: string}> => fetchWithAuth(`/api/organizations/${orgId}/admins`, { method: 'POST', body: JSON.stringify({ email }) });
export const removeOrganizationAdmin = async (orgId: string, userId: string): Promise<{message: string}> => fetchWithAuth(`/api/organizations/${orgId}/admins/${userId}`, { method: 'DELETE' });
export const removeUserFromOrg = async (orgId: string, userId: string): Promise<null> => fetchWithAuth(`/api/organizations/${orgId}/users/${userId}`, { method: 'DELETE' });


// --- WorkHubs ---
export const getWorkspaces = async (filterType?: 'corporate' | 'individual' | 'all'): Promise<Workspace[]> => {
    let url = '/api/workspaces';
    if (filterType && filterType !== 'all') {
        url += `?type=${filterType}`;
    }
    return fetchWithAuth(url);
};
export const getArchivedWorkspaces = async (): Promise<Workspace[]> => fetchWithAuth('/api/workspaces/archived');
export const restoreWorkspace = async (id: string): Promise<Workspace> => fetchWithAuth(`/api/workspaces/${id}/restore`, { method: 'PUT' });
export const addWorkspaceToBackend = async (name: string, orgId: string, planId?: string, color?: string): Promise<Workspace> => fetchWithAuth('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, orgId, planId, color }) });
export const updateWorkspaceOnBackend = async (id: string, data: { name?: string, planId?: string, subscriptionProvider?: string, color?: string }): Promise<Workspace> => fetchWithAuth(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteWorkspaceFromBackend = async (id: string, force = false): Promise<null> => {
    return fetchWithAuth(`/api/workspaces/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
};
export const confirmArchiveWorkspace = async (id: string): Promise<null> => fetchWithAuth(`/api/workspaces/${id}/archive`, { method: 'PUT' });
export const addWorkspaceManager = async (workspaceId: string, email: string): Promise<{message: string}> => fetchWithAuth(`/api/workspaces/${workspaceId}/admins`, { method: 'POST', body: JSON.stringify({ email }) });
export const removeWorkspaceManager = async (workspaceId: string, userId: string): Promise<{message: string}> => fetchWithAuth(`/api/workspaces/${workspaceId}/admins/${userId}`, { method: 'DELETE' });
export const removeUserFromWorkspace = async (workspaceId: string, userId: string): Promise<null> => fetchWithAuth(`/api/workspaces/${workspaceId}/users/${userId}`, { method: 'DELETE' });


// --- Users ---
export const getUsers = async (params?: { limit?: number; cursor?: string; search?: string; workspaceId?: string; role?: string }): Promise<PaginatedResponse<User>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    if (params?.workspaceId) query.append('workspaceId', params.workspaceId);
    if (params?.role) query.append('role', params.role);
    const qs = query.toString();
    return fetchWithAuth(`/api/users${qs ? `?${qs}` : ''}`);
};
export const getUserByIdFromBackend = async (userId: string): Promise<User> => fetchWithAuth(`/api/users/${userId}`);
export const deleteUserAccount = async (userId: string, deletionType: 'soft' | 'hard'): Promise<null> => fetchWithAuth(`/api/users/${userId}`, { method: 'DELETE', body: JSON.stringify({ deletionType }) });
export const preApproveUsersInBulk = async (emails: string[], workspaceId: string, permissions: 'edit' | 'read_only' = 'edit'): Promise<{successCount: number; message: string;}> =>
  fetchWithAuth('/api/users/pre-approve-bulk', { method: 'POST', body: JSON.stringify({ emails, workspaceId, permissions }) });

export const inviteUsersToOrg = async (orgId: string, email: string, workspaceIds: string[] | 'all', permissions: 'edit' | 'read_only' = 'edit'): Promise<{successCount: number; message: string;}> =>
  fetchWithAuth(`/api/organizations/${orgId}/invite-users`, { method: 'POST', body: JSON.stringify({ email, workspaceIds, permissions }) });

export const inviteUsersToOrgBulk = async (orgId: string, emails: string[], workspaceIds: string[] | 'all', permissions: 'edit' | 'read_only' = 'edit'): Promise<{successCount: number; message: string;}> =>
  fetchWithAuth(`/api/organizations/${orgId}/invite-users`, { method: 'POST', body: JSON.stringify({ emails, workspaceIds, permissions }) });

export const getPreApprovedUsersFromBackend = async (params?: { limit?: number; cursor?: string; search?: string }): Promise<PaginatedResponse<PreApprovedUser>> => {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.search) query.append('search', params.search);
    const qs = query.toString();
    return fetchWithAuth(`/api/users/pre-approved${qs ? `?${qs}` : ''}`);
};
export const deletePreApprovedUserFromBackend = async (preApprovedUserId: string): Promise<null> => fetchWithAuth(`/api/users/pre-approved/${preApprovedUserId}`, { method: 'DELETE' });

// User's own profile updates
export const getMyUserDetails = async (): Promise<{ user: User, selectedWorkspace: WorkHub }> => fetchWithAuth('/api/users/me/details');
export const updateMyUserDetails = async (details: { name?: string; email?: string; preferredLanguage?: string; preferences?: { darkContrast?: boolean }; notificationPreference?: 'all' | 'mentions_only' | 'none' }): Promise<User> => fetchWithAuth('/api/users/me/details', { method: 'PUT', body: JSON.stringify(details) });
export const markChatSeen = async (itemId: string): Promise<void> => fetchWithAuth(`/api/items/${itemId}/chat/seen`, { method: 'POST' });
export const updateMyPassword = async (passwords: { currentPassword?: string; newPassword: string }): Promise<{ message: string }> => fetchWithAuth('/api/users/me/password', { method: 'PUT', body: JSON.stringify(passwords) });
const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

export const updateMyProfileImage = async (imageData: string | Blob): Promise<User> => {
    if (imageData instanceof Blob) {
        const imageBase64 = await blobToBase64(imageData);
        return fetchWithAuth('/api/users/me/profile-image', { method: 'PUT', body: JSON.stringify({ imageBase64 }) });
    }
    return fetchWithAuth('/api/users/me/profile-image', { method: 'PUT', body: JSON.stringify({ imageUrl: imageData }) });
};

// --- WorkHub Settings / Theme ---
export const getThemeSettingsFromBackend = async (): Promise<OrganizationSettings> => fetchWithAuth('/api/app-config/theme');
export const updateThemeSettingsOnBackend = async (settings: Partial<OrganizationSettings> & { logoUpload?: Blob | string; }): Promise<OrganizationSettings> => {
    if (settings.logoUpload) {
        const logoBase64 = settings.logoUpload instanceof Blob
            ? await blobToBase64(settings.logoUpload)
            : settings.logoUpload;
        const { logoUpload: _removed, ...rest } = settings;
        return fetchWithAuth('/api/app-config/theme', { method: 'PUT', body: JSON.stringify({ ...rest, logoBase64 }) });
    }
    return fetchWithAuth('/api/app-config/theme', { method: 'PUT', body: JSON.stringify(settings) });
};
export const regenerateApiKey = async (): Promise<OrganizationSettings> => fetchWithAuth('/api/app-config/api-key/regenerate', { method: 'POST' });

// --- System-wide Settings (System Admin only) ---
export const getTokenLimits = async (): Promise<SystemSettings> => fetchWithAuth('/api/system-settings/settings');
export const updateTokenLimits = async (settings: SystemSettings): Promise<SystemSettings> => fetchWithAuth('/api/system-settings/settings', { method: 'PUT', body: JSON.stringify(settings) });

// --- Tutorial Settings ---
export const getTutorialSettings = async (): Promise<TutorialSettings> => fetchWithAuth('/api/system-settings/tutorials');
export const updateTutorialSettings = async (settings: TutorialSettings): Promise<TutorialSettings> => fetchWithAuth('/api/system-settings/tutorials', { method: 'PUT', body: JSON.stringify(settings) });

// --- Public Access ---
export const getPublicOrganizationDetails = async (organizationName: string): Promise<any> => {
    const response = await fetch(`${BACKEND_API_URL}/api/public/workspace/${encodeURIComponent(organizationName)}`);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch public details' }));
        throw new Error(errorData.message || 'Failed to fetch public details');
    }
    return response.json();
};

// --- Email Templates (System Admin) ---
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

export const inviteUserToBoard = async (
    boardId: string,
    email: string,
    permissions: 'edit' | 'read_only'
): Promise<{ message: string }> =>
    fetchWithAuth(`/api/boards/${boardId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email, permissions }),
    });

export const getUserBoardPermissions = async (
    userId: string
): Promise<{ workspaces: import('../types').BoardPermissionsWorkspace[] }> =>
    fetchWithAuth(`/api/users/${userId}/board-permissions`);

export const updateUserBoardPermissions = async (
    userId: string,
    boards: Array<{ boardId: string; role: import('../types').BoardRole }>,
    workspaceIds: string[],
    workspacePermissions: Record<string, 'edit' | 'read_only' | 'admin'>
): Promise<{ message: string }> =>
    fetchWithAuth(`/api/users/${userId}/board-permissions`, {
        method: 'PUT',
        body: JSON.stringify({ boards, workspaceIds, workspacePermissions }),
    });
