
import React, { createContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import type { User, Workspace } from '../types';
import { UserRole } from '../types';
import { BACKEND_API_URL } from '../constants';
import * as apiService from '../services/geminiService';
import { Capacitor } from '@capacitor/core';
import i18n from '../i18n';
import { signInWithCustomToken } from 'firebase/auth';
import { firebaseAuth } from '../firebase';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queries/queryKeys';

// ---------------------------------------------------------------------------
// Session context — stable identity data, changes only on login / logout
// ---------------------------------------------------------------------------

export interface AuthSessionContextType {
  user: User | null;
  token: string | null;
  selectedWorkspace: (Workspace & { hasChatAccess?: boolean; hasMindPatternsAccess?: boolean }) | null;
  isOrgSubscriptionActive: boolean;

  logout: () => void;
  updateAuthUser: (updatedUser: User) => void;
  refreshAuthUser: () => Promise<void>;
  updateUserDetails: (details: { name?: string; email?: string; conversationSavingEnabled?: boolean; preferredLanguage?: string; notificationPreference?: 'all' | 'mentions_only' | 'none' }) => Promise<boolean>;
  updateUserPassword: (passwords: { currentPassword?: string; newPassword: string }) => Promise<boolean>;
  updateUserProfileImage: (imageData: string | Blob) => Promise<boolean>;
  setAuthenticatedUserFromGoogle: (token: string) => Promise<boolean>;
  setAuthenticatedUserFromToken: (token: string) => Promise<boolean>;
  nativeGoogleLogin: () => Promise<void>;
  nativeMicrosoftLogin: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// UI context — transient flow state, changes during auth operations
// ---------------------------------------------------------------------------

export interface AuthUIContextType {
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;

  contextSelectionMode: 'login' | 'switch' | null;
  userForContextSelection: (Omit<User, 'role'> & { workspaces: Workspace[]; allAcademies?: Workspace[] }) | null;
  availableContexts: { groupName: string; contexts: { label: string; value: string; role: UserRole }[] }[];

  showLanguageModal: boolean;
  dismissLanguageModal: () => void;

  login: (email: string, password: string, recaptchaToken?: string | null) => Promise<void>;
  completeLoginWithContext: (workspaceId: string, role: UserRole) => Promise<void>;
  switchContext: (workspaceId: string, role: UserRole) => Promise<void>;
  startContextSwitch: () => void;
  cancelContextSelection: () => void;
  finalizeLoginSession: (loginData: any) => void;

  register: (userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string; planId?: string }, recaptchaToken?: string | null) => Promise<{ success: boolean; message: string; requiresVerification?: boolean }>;
  initiateCheckoutRegistration: (formData: any, recaptchaToken?: string | null) => Promise<{ success: boolean; message?: string }>;
  registerOrganizationAdmin: (userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string }, planId: string, recaptchaToken?: string | null) => Promise<{ success: boolean; user?: User }>;
}

export const AuthSessionContext = createContext<AuthSessionContextType | undefined>(undefined);
export const AuthUIContext = createContext<AuthUIContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function applyDarkContrast(enabled: boolean) {
  document.documentElement.classList.toggle('dark-contrast', enabled);
}

const storeUser = (userData: User) => localStorage.setItem('authUser', JSON.stringify(userData));
const getStoredUser = (): User | null => {
  const userString = localStorage.getItem('authUser');
  return userString ? JSON.parse(userString) : null;
};
const storeSelectedOrg = (org: Workspace) => {
  if (!org) { localStorage.removeItem('authSelectedOrg'); return; }
  localStorage.setItem('authSelectedOrg', JSON.stringify(org));
};
const getSelectedOrg = (): any | null => {
  const orgString = localStorage.getItem('authSelectedOrg');
  if (!orgString || orgString === 'undefined' || orgString === 'null') return null;
  try { return JSON.parse(orgString); } catch { return null; }
};

const PARTIAL_TOKEN_KEY = 'pendingPartialToken';
const AUTH_TOKEN_STORAGE_KEY = 'authJwt';

const removeAuthData = () => {
  console.log('[AUTH] removeAuthData called. Clearing localStorage.');
  localStorage.removeItem('authUser');
  localStorage.removeItem('authSelectedOrg');
  localStorage.removeItem('userForContextSelection');
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(PARTIAL_TOKEN_KEY);
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(() => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const storedUser = localStorage.getItem('authUser');
    const storedUserForContext = localStorage.getItem('userForContextSelection');
    return !!(storedToken || storedUser || storedUserForContext);
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [contextSelectionMode, setContextSelectionMode] = useState<'login' | 'switch' | null>(null);
  const [userForContextSelection, setUserForContextSelection] = useState<(Omit<User, 'role'> & { workspaces: Workspace[]; allAcademies?: Workspace[] }) | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  useEffect(() => {
    applyDarkContrast(user?.preferences?.darkContrast ?? false);
  }, [user?.preferences?.darkContrast]);

  useEffect(() => {
    const validateSession = async () => {
      const storedUserForContext = localStorage.getItem('userForContextSelection');

      console.log('%c[AUTH_INIT] Starting session validation...', 'color: blue; font-weight: bold;');

      if (storedUserForContext) {
        console.log('[AUTH_INIT] Found stored context selection data. Restoring context selection flow.');
        setContextSelectionMode('login');
        setUserForContextSelection(JSON.parse(storedUserForContext));
        setLoading(false);
        return;
      }

      const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      const storedUser = getStoredUser();
      const storedOrg = getSelectedOrg();
      if (!storedToken && !storedUser) {
        setLoading(false);
        return;
      }

      if (storedUser && storedOrg) {
        setUser(storedUser);
        setSelectedWorkspace(storedOrg);
      }

      const maxRetries = 3;
      const delay = 1000;
      let success = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();
          console.log('%c[AUTH_INIT] Backend validation successful.', 'color: green; font-weight: bold;', { user: freshUser, org: freshOrg });

          if (!freshUser) {
            console.error(`[AUTH_INIT] Attempt ${attempt}: No user data from backend.`);
            throw new Error('No user data received from backend.');
          }

          setToken('cookie');
          setUser(freshUser);
          setSelectedWorkspace(freshOrg);
          storeUser(freshUser);
          if (freshOrg) {
            storeSelectedOrg(freshOrg);
          } else {
            localStorage.removeItem('authSelectedOrg');
          }
          applyUserLanguage(freshUser);
          success = true;
          break;
        } catch (error: any) {
          console.warn(`[AUTH_INIT] Attempt ${attempt} failed:`, error);
          if (error?.status === 401 || error?.status === 403) break;
          if (attempt < maxRetries) {
            console.log(`[AUTH_INIT] Retrying in ${delay}ms...`);
            await new Promise(res => setTimeout(res, delay));
          }
        }
      }

      if (!success) {
        console.log('[AUTH_INIT] Session validation failed. User is logged out.');
        removeAuthData();
        setUser(null);
        setToken(null);
        setSelectedWorkspace(null);
      }
      setLoading(false);
    };

    validateSession();
  }, []);

  const lastHiddenTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (authError) {
      const timer = setTimeout(() => setAuthError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [authError]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const applyUserLanguage = useCallback((userData: User) => {
    if (userData.preferredLanguage) {
      i18n.changeLanguage(userData.preferredLanguage);
    }
  }, []);

  const handleSuccessfulLogin = useCallback((data: any) => {
    console.log('[AUTH_STATE_UPDATE] Handling successful login. Data received:', data);

    if (!data || !data.accessToken) {
      console.error('[AUTH_STATE_UPDATE] CRITICAL: handleSuccessfulLogin called with invalid data or missing accessToken.', data);
      setAuthError('Login failed due to incomplete session data.');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.accessToken);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    setUser(data.user);
    setToken(data.accessToken);
    setSelectedWorkspace(data.selectedWorkspace);

    if (data.firebaseToken) {
      console.log('[Firebase] Calling signInWithCustomToken...');
      signInWithCustomToken(firebaseAuth, data.firebaseToken)
        .then((cred) => console.log('[Firebase] signInWithCustomToken OK, uid:', cred.user.uid))
        .catch((err) => console.error('[Firebase] signInWithCustomToken FAILED:', err.code, err.message));
    } else {
      console.warn('[Firebase] No firebaseToken in login response — real-time sync disabled');
    }

    storeUser(data.user);
    storeSelectedOrg(data.selectedWorkspace);
    setContextSelectionMode(null);
    setUserForContextSelection(null);
    localStorage.removeItem('userForContextSelection');
    applyUserLanguage(data.user);

    if (!data.user.preferredLanguage) {
      i18n.changeLanguage('en');
      apiService.updateMyUserDetails({ preferredLanguage: 'en' }).catch(() => {});
    }
  }, [applyUserLanguage]);

  // ── Session methods ────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    console.log('%c[AUTH_STATE_UPDATE] Logging out user and clearing all auth data.', 'color: red; font-weight: bold;');
    setUser(null);
    setToken(null);
    setSelectedWorkspace(null);
    setContextSelectionMode(null);
    setUserForContextSelection(null);
    removeAuthData();
    try {
      await apiService.logoutFromBackend();
    } catch (e) {
      console.warn('Backend logout call failed (cookies may already be expired)', e);
    }
  }, []);

  const updateAuthUser = useCallback((updatedUserData: User) => {
    console.log('[AUTH_STATE_UPDATE] Updating authenticated user data locally.', updatedUserData);
    setUser(currentUser => {
      if (currentUser && currentUser.id === updatedUserData.id) {
        const safeUserData = {
          ...updatedUserData,
          role: currentUser.role,
          workspaces: currentUser.workspaces,
          dbRoles: currentUser.dbRoles,
        };
        storeUser(safeUserData);
        return safeUserData;
      }
      console.warn('[AUTH_STATE_UPDATE] updateAuthUser called but current user did not match.', currentUser, updatedUserData);
      return currentUser;
    });
  }, []);

  const refreshAuthUser = useCallback(async () => {
    console.log('[AUTH_FLOW] Refreshing user data from backend...');
    try {
      const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();
      updateAuthUser(freshUser);
      setSelectedWorkspace(freshOrg);
      storeSelectedOrg(freshOrg);
    } catch (error: any) {
      console.error('Failed to refresh auth user:', error);
      if (error.message.includes('expired') || error.message.includes('401')) {
        logout();
      }
    }
  }, [updateAuthUser, logout]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible' && user) {
        const hiddenMs = lastHiddenTimeRef.current ? Date.now() - lastHiddenTimeRef.current : 0;
        if (hiddenMs > 5 * 60 * 1000) {
          console.log('[AUTH] Tab visible after long absence — re-validating session...');
          await refreshAuthUser();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, refreshAuthUser]);

  const updateUserDetails = useCallback(async (details: { name?: string; email?: string; conversationSavingEnabled?: boolean; preferredLanguage?: string; notificationPreference?: 'all' | 'mentions_only' | 'none' }): Promise<boolean> => {
    try {
      const updatedUser = await apiService.updateMyUserDetails(details);
      updateAuthUser(updatedUser);
      queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) =>
        old ? old.map(u => u.id === updatedUser.id ? { ...u, ...details } : u) : old
      );
      return true;
    } catch (error: any) {
      setAuthError(error.message || 'Failed to update details');
      return false;
    }
  }, [updateAuthUser, queryClient]);

  const updateUserPassword = useCallback(async (passwords: { currentPassword?: string; newPassword: string }): Promise<boolean> => {
    try {
      await apiService.updateMyPassword(passwords);
      await refreshAuthUser();
      return true;
    } catch (error: any) {
      setAuthError(error.message || 'Failed to update password');
      return false;
    }
  }, [refreshAuthUser]);

  const updateUserProfileImage = useCallback(async (imageData: string | Blob): Promise<boolean> => {
    try {
      const updatedUser = await apiService.updateMyProfileImage(imageData);
      updateAuthUser(updatedUser);
      return true;
    } catch (error: any) {
      setAuthError(error.message || 'Failed to update profile image');
      return false;
    }
  }, [updateAuthUser]);

  const setAuthenticatedUserFromGoogle = useCallback(async (receivedToken: string): Promise<boolean> => {
    setLoading(true);
    setAuthError(null);
    console.log('[AUTH_FLOW] Completing Google Sign-In...');
    try {
      const data = await apiService.getGoogleLoginFinalization(receivedToken);
      if (data.multiContext) {
        if (!data.user.workspaces || data.user.workspaces.length === 0) {
          console.log('[AUTH_FLOW] New Google user (checkout flow). Setting partial user state.');
          setUser(data.user);
        } else {
          console.log('[AUTH_FLOW] Google user is multi-context. Requiring context selection.');
          setContextSelectionMode('login');
          setUserForContextSelection(data.user);
          if (data.partialToken) sessionStorage.setItem(PARTIAL_TOKEN_KEY, data.partialToken);
          localStorage.setItem('userForContextSelection', JSON.stringify(data.user));
        }
      } else {
        handleSuccessfulLogin(data);
      }
      return true;
    } catch (error: any) {
      setAuthError(error.message || 'Failed to complete Google Sign-In.');
      removeAuthData();
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleSuccessfulLogin]);

  const setAuthenticatedUserFromToken = useCallback(async (_token: string): Promise<boolean> => {
    setLoading(true);
    setAuthError(null);
    try {
      const maxRetries = 5;
      const delay = 1500;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();
          if (!freshUser || !freshOrg) throw new Error('Incomplete user data received after authentication.');
          handleSuccessfulLogin({ accessToken: 'cookie', user: freshUser, selectedWorkspace: freshOrg });
          return true;
        } catch (error: any) {
          if (attempt === maxRetries) throw error;
          console.warn(`[AUTH_RETRY] Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
          await new Promise(res => setTimeout(res, delay));
        }
      }
      return false;
    } catch (error: any) {
      setAuthError(error.message || 'Failed to complete sign-in from token.');
      removeAuthData();
      return false;
    } finally {
      setLoading(false);
    }
  }, [handleSuccessfulLogin]);

  const nativeGoogleLogin = useCallback(async () => {
    setAuthError('Native Google Sign-In is not available on this platform.');
  }, []);

  const nativeMicrosoftLogin = useCallback(async () => {
    setAuthError('Native Microsoft Sign-In is not available on this platform.');
  }, []);

  // ── UI / flow methods ──────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string, recaptchaToken?: string | null) => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(recaptchaToken ? { recaptchaToken } : {}) }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');

      if (data.multiContext) {
        if (!data.user.workspaces || data.user.workspaces.length === 0) {
          console.log('[AUTH_FLOW] Payment flow user logged in (no orgs). Setting partial state.');
          setUser(data.user);
        } else {
          console.log('[AUTH_FLOW] Multi-context user detected. Requiring context selection.');
          setContextSelectionMode('login');
          setUserForContextSelection(data.user);
          if (data.partialToken) sessionStorage.setItem(PARTIAL_TOKEN_KEY, data.partialToken);
          localStorage.setItem('userForContextSelection', JSON.stringify(data.user));
        }
      } else {
        handleSuccessfulLogin(data);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setAuthError(error.message || 'An unexpected error occurred during login.');
      removeAuthData();
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleSuccessfulLogin]);

  const completeLoginWithContext = useCallback(async (workspaceId: string, role: UserRole) => {
    setLoading(true);
    setAuthError(null);
    try {
      const storedPartialToken = sessionStorage.getItem(PARTIAL_TOKEN_KEY) || '';
      const data = await apiService.selectContextOnBackend(storedPartialToken, workspaceId, role);
      sessionStorage.removeItem(PARTIAL_TOKEN_KEY);
      handleSuccessfulLogin(data);
    } catch (error: any) {
      console.error('Context Selection error:', error);
      setAuthError(error.message || 'An unexpected error occurred.');
      removeAuthData();
      setContextSelectionMode(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleSuccessfulLogin]);

  const switchContext = useCallback(async (workspaceId: string, role: UserRole) => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await apiService.switchContextOnBackend(workspaceId, role);
      handleSuccessfulLogin(data);
      window.location.reload();
    } catch (error: any) {
      console.error('Switch Context error:', error);
      setAuthError(error.message || 'Failed to switch context.');
      setContextSelectionMode(null);
    } finally {
      setLoading(false);
    }
  }, [handleSuccessfulLogin]);

  const startContextSwitch = useCallback(() => {
    clearAuthError();
    setContextSelectionMode('switch');
  }, [clearAuthError]);

  const cancelContextSelection = useCallback(() => {
    if (contextSelectionMode === 'login') logout();
    setContextSelectionMode(null);
  }, [contextSelectionMode, logout]);

  const finalizeLoginSession = useCallback((loginData: any) => {
    console.log('[CheckoutSuccess] Calling finalizeLoginSession...');
    handleSuccessfulLogin(loginData);
  }, [handleSuccessfulLogin]);

  const register = useCallback(async (
    userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string; planId?: string },
    recaptchaToken?: string | null,
  ): Promise<{ success: boolean; message: string }> => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, ...(recaptchaToken ? { recaptchaToken } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed');
      return data;
    } catch (error: any) {
      setAuthError(error.message);
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const registerOrganizationAdmin = useCallback(async (
    userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string },
    planId: string,
    recaptchaToken?: string | null,
  ): Promise<{ success: boolean; user?: User }> => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await apiService.registerOrganizationAdmin(userData, planId, recaptchaToken);
      console.log('[AUTH_FLOW] WorkHub admin registered. Handling partial login.');
      setUser(data.user);
      setToken('cookie');
      storeUser(data.user);
      setSelectedWorkspace(null);
      localStorage.removeItem('authSelectedOrg');
      return { success: true, user: data.user };
    } catch (error: any) {
      setAuthError(error.message);
      return { success: false, user: undefined };
    } finally {
      setLoading(false);
    }
  }, []);

  const initiateCheckoutRegistration = useCallback(async (formData: any, recaptchaToken?: string | null): Promise<{ success: boolean; message?: string }> => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await apiService.initiateCheckoutRegistration({ ...formData, ...(recaptchaToken ? { recaptchaToken } : {}) });
      return { success: true, message: data.message };
    } catch (error: any) {
      setAuthError(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissLanguageModal = useCallback(() => setShowLanguageModal(false), []);

  // ── Derived / memoized values ──────────────────────────────────────────────

  const isOrgSubscriptionActive = useMemo(() => {
    const status = selectedWorkspace?.subscriptionStatus;
    return !status || status === 'active' || status === 'trialing';
  }, [selectedWorkspace]);

  const availableContexts = useMemo(() => {
    const userForContexts = contextSelectionMode === 'login' ? userForContextSelection : user;
    if (!userForContexts?.workspaces || !userForContexts?.dbRoles) {
      console.debug('[availableContexts] no user/workspaces/dbRoles — returning []');
      return [];
    }

    const contexts: { label: string; value: string; role: UserRole; organizationName: string }[] = [];

    const { systemAdmin, organizationAdmin: assignedOrganizationAdmins = [], workspaceAdmin: assignedOrgAdmins = [], orgEditor: assignedOrgEditors = [] } = userForContexts.dbRoles;

    console.debug('[availableContexts] dbRoles:', {
      systemAdmin,
      organizationAdmin: assignedOrganizationAdmins,
      workspaceAdmin: assignedOrgAdmins,
      orgEditor: assignedOrgEditors,
    });
    console.debug('[availableContexts] all workspaces:', userForContexts.workspaces);

    // System admin: single global entry
    if (systemAdmin) {
      const defaultOrg = userForContexts.workspaces.find((o: any) => o.name === 'Default Workspace') || userForContexts.workspaces[0];
      if (defaultOrg) {
        contexts.push({ label: 'System Administrator', value: JSON.stringify({ role: 'system_admin', workspaceId: defaultOrg.id }), role: 'system_admin', organizationName: 'System-Wide' });
      }
      return [{ groupName: 'System Administration', contexts }];
    }

    // One entry per org. Determine the highest role the user holds in each org,
    // then pick the first eligible workspace as the login workspaceId.
    const roleOrder: Record<string, number> = { org_admin: 0, workspace_admin: 1, org_editor: 2, regular_user: 3 };

    // Collect all orgs the user has any access to (non-personal, non-default)
    const eligibleWorkspaces = userForContexts.workspaces.filter((o: any) => !o.isPersonal && o.name !== 'Default Workspace');
    console.debug('[availableContexts] eligibleWorkspaces (non-personal, non-default):', eligibleWorkspaces);

    // Group workspaces by orgId
    const byOrg = new Map<string, { orgName: string; workspaces: any[] }>();
    eligibleWorkspaces.forEach((ws: any) => {
      if (!byOrg.has(ws.orgId)) byOrg.set(ws.orgId, { orgName: ws.organizationName || ws.orgId, workspaces: [] });
      byOrg.get(ws.orgId)!.workspaces.push(ws);
    });
    console.debug('[availableContexts] byOrg keys (orgIds with eligible workspaces):', [...byOrg.keys()]);

    // org_editor: their membership entityId is the orgId — no workspace docs, build context directly
    (assignedOrgEditors as string[]).forEach((orgId: string) => {
      if (byOrg.has(orgId)) return; // already covered via workspace membership
      const orgName = (userForContexts.orgEditorOrgs as any[])?.find((o: any) => o.id === orgId)?.name || orgId;
      contexts.push({ label: `${orgName} — Editor`, value: JSON.stringify({ role: UserRole.ORG_EDITOR, workspaceId: orgId }), role: UserRole.ORG_EDITOR, organizationName: orgName });
    });

    const addedOrgIds = new Set<string>();
    byOrg.forEach(({ orgName, workspaces }, orgId) => {
      if (addedOrgIds.has(orgId)) return;
      addedOrgIds.add(orgId);

      const isOrgAdmin = assignedOrganizationAdmins.includes(orgId);
      const wsAdminWorkspace = workspaces.find((ws: any) => assignedOrgAdmins.includes(ws.id));
      const isWsAdmin = !!wsAdminWorkspace;
      const isOrgEditor = (assignedOrgEditors as string[]).includes(orgId);

      let role: UserRole;
      let workspaceId: string;
      let label: string;

      if (isOrgAdmin) {
        role = UserRole.ORGANIZATION_ADMIN;
        workspaceId = workspaces[0].id;
        label = `${orgName} — Admin`;
      } else if (isWsAdmin) {
        role = UserRole.WORKSPACE_ADMIN;
        workspaceId = wsAdminWorkspace.id;
        label = `${orgName} — Manager`;
      } else if (isOrgEditor) {
        role = UserRole.ORG_EDITOR;
        workspaceId = orgId;
        label = `${orgName} — Editor`;
      } else {
        role = UserRole.REGULAR_USER;
        workspaceId = workspaces[0].id;
        label = `${orgName} — User`;
      }

      contexts.push({ label, value: JSON.stringify({ role, workspaceId }), role, organizationName: orgName });
    });

    contexts.sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4) || a.organizationName.localeCompare(b.organizationName));

    console.debug('[availableContexts] final contexts count:', contexts.length, contexts.map(c => c.label));
    return [{ groupName: 'Select Organization', contexts }];
  }, [user, userForContextSelection, contextSelectionMode]);

  // ── Context values — memoized so consumers only re-render on relevant changes

  const sessionValue = useMemo<AuthSessionContextType>(() => ({
    user,
    token,
    selectedWorkspace,
    isOrgSubscriptionActive,
    logout,
    updateAuthUser,
    refreshAuthUser,
    updateUserDetails,
    updateUserPassword,
    updateUserProfileImage,
    setAuthenticatedUserFromGoogle,
    setAuthenticatedUserFromToken,
    nativeGoogleLogin,
    nativeMicrosoftLogin,
  }), [
    user, token, selectedWorkspace, isOrgSubscriptionActive,
    logout, updateAuthUser, refreshAuthUser, updateUserDetails,
    updateUserPassword, updateUserProfileImage,
    setAuthenticatedUserFromGoogle, setAuthenticatedUserFromToken,
    nativeGoogleLogin, nativeMicrosoftLogin,
  ]);

  const uiValue = useMemo<AuthUIContextType>(() => ({
    loading,
    authError,
    clearAuthError,
    contextSelectionMode,
    userForContextSelection,
    availableContexts,
    showLanguageModal,
    dismissLanguageModal,
    login,
    completeLoginWithContext,
    switchContext,
    startContextSwitch,
    cancelContextSelection,
    finalizeLoginSession,
    register,
    initiateCheckoutRegistration,
    registerOrganizationAdmin,
  }), [
    loading, authError, clearAuthError,
    contextSelectionMode, userForContextSelection, availableContexts,
    showLanguageModal, dismissLanguageModal,
    login, completeLoginWithContext, switchContext, startContextSwitch,
    cancelContextSelection, finalizeLoginSession,
    register, initiateCheckoutRegistration, registerOrganizationAdmin,
  ]);

  return (
    <AuthSessionContext.Provider value={sessionValue}>
      <AuthUIContext.Provider value={uiValue}>
        {children}
      </AuthUIContext.Provider>
    </AuthSessionContext.Provider>
  );
};
