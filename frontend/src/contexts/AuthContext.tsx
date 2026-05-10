
import React, { createContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import type { User, Workspace, UserRole } from '../types';
import { BACKEND_API_URL } from '../constants';
import * as apiService from '../services/geminiService';
import { Capacitor } from '@capacitor/core';
import i18n from '../i18n';
import { signInWithCustomToken } from 'firebase/auth';
import { firebaseAuth } from '../firebase';

interface AuthContextType {
  user: User | null;
  token: string | null;
  selectedWorkspace: (Workspace & { hasChatAccess?: boolean, hasMindPatternsAccess?: boolean }) | null;
  isOrgSubscriptionActive: boolean;

  // New state for multi-context flow, replacing the old multi-org flow
  contextSelectionMode: 'login' | 'switch' | null;
  userForContextSelection: (Omit<User, 'role'> & { workspaces: Workspace[], allAcademies?: Workspace[] }) | null;
  availableContexts: { groupName: string, contexts: { label: string; value: string; role: UserRole }[] }[];


  login: (email: string, password: string, recaptchaToken?: string | null) => Promise<void>;
  completeLoginWithContext: (workspaceId: string, role: UserRole) => Promise<void>;
  switchContext: (workspaceId: string, role: UserRole) => Promise<void>;
  startContextSwitch: () => void;
  cancelContextSelection: () => void;
  finalizeLoginSession: (loginData: any) => void;


  register: (userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string; planId?: string }, recaptchaToken?: string | null) => Promise<{ success: boolean; message: string; }>;
  initiateCheckoutRegistration: (formData: any, recaptchaToken?: string | null) => Promise<{ success: boolean; message?: string }>;
  registerOrganizationAdmin: (userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string }, planId: string, recaptchaToken?: string | null) => Promise<{ success: boolean; user?: User }>;
  logout: () => void;
  updateUserDetails: (details: { name?: string; email?: string; conversationSavingEnabled?: boolean; preferredLanguage?: string }) => Promise<boolean>;
  updateUserPassword: (passwords: { currentPassword?: string; newPassword: string }) => Promise<boolean>;
  updateUserProfileImage: (imageData: string | Blob) => Promise<boolean>;
  setAuthenticatedUserFromGoogle: (token: string) => Promise<boolean>;
  setAuthenticatedUserFromToken: (token: string) => Promise<boolean>;

  // New native Auth methods
  nativeGoogleLogin: () => Promise<void>;
  nativeMicrosoftLogin: () => Promise<void>;

  showLanguageModal: boolean;
  dismissLanguageModal: () => void;

  updateAuthUser: (updatedUser: User) => void;
  refreshAuthUser: () => Promise<void>;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token is now stored in httpOnly cookies (managed by the backend).
// Only user/org data is cached in localStorage for faster initial renders.
function applyDarkContrast(enabled: boolean) {
  document.documentElement.classList.toggle('dark-contrast', enabled);
}

const storeUser = (userData: User) => localStorage.setItem('authUser', JSON.stringify(userData));
const getStoredUser = (): User | null => {
    const userString = localStorage.getItem('authUser');
    return userString ? JSON.parse(userString) : null;
};
const storeSelectedOrg = (org: Workspace) => localStorage.setItem('authSelectedOrg', JSON.stringify(org));
const getSelectedOrg = (): WorkHub | null => {
    const orgString = localStorage.getItem('authSelectedOrg');
    return orgString ? JSON.parse(orgString) : null;
};

const PARTIAL_TOKEN_KEY = 'pendingPartialToken';

// Defined alongside AUTH_TOKEN_STORAGE_KEY in geminiService — keep in sync
const AUTH_TOKEN_STORAGE_KEY = 'authJwt';

const removeAuthData = () => {
  console.log('[AUTH] removeAuthData called. Clearing localStorage.');
  localStorage.removeItem('authUser');
  localStorage.removeItem('authSelectedOrg');
  localStorage.removeItem('userForContextSelection');
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(PARTIAL_TOKEN_KEY);
  // httpOnly cookies are cleared by the backend via POST /api/auth/logout
};


export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(() => {
    // Only enter loading state if there is an existing session to validate.
    // Fresh unauthenticated visitors have nothing to validate, so starting
    // with loading=true would needlessly disable UI on public pages.
    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const storedUser = localStorage.getItem('authUser');
    const storedUserForContext = localStorage.getItem('userForContextSelection');
    return !!(storedToken || storedUser || storedUserForContext);
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const [contextSelectionMode, setContextSelectionMode] = useState<'login' | 'switch' | null>(null);
  const [userForContextSelection, setUserForContextSelection] = useState<(Omit<User, 'role'> & { workspaces: Workspace[], allAcademies?: Workspace[] }) | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Apply dark-contrast CSS class whenever the user's preference changes
  useEffect(() => {
    applyDarkContrast(user?.preferences?.darkContrast ?? false);
  }, [user?.preferences?.darkContrast]);

  useEffect(() => {
    // Initialize Auth Plugins
    // Native social login initialization removed — mobile app not yet supported

    const validateSession = async () => {
      const storedUserForContext = localStorage.getItem('userForContextSelection');

      console.log('%c[AUTH_INIT] Starting session validation...', 'color: blue; font-weight: bold;');

      if(storedUserForContext) {
          console.log('[AUTH_INIT] Found stored context selection data. Restoring context selection flow.');
          setContextSelectionMode('login');
          setUserForContextSelection(JSON.parse(storedUserForContext));
          setLoading(false);
          return;
      }

      // On mobile the JWT is in localStorage; on web it's in the __session httpOnly
      // cookie (unreadable from JS). Use stored user data as a proxy on web —
      // if there's no cached user there's definitely no active session.
      const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      const storedUser = getStoredUser();
      const storedOrg = getSelectedOrg();
      if (!storedToken && !storedUser) {
          setLoading(false);
          return;
      }

      // Optimistic: set cached data for faster initial render while validating
      if (storedUser && storedOrg) {
          setUser(storedUser);
          setSelectedWorkspace(storedOrg);
      }

      // Retry logic for newly created accounts where Firestore might be eventually consistent
      const maxRetries = 3;
      const delay = 1000;
      let success = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            // This API call is the single source of truth for the user's session.
            // The httpOnly cookie is sent automatically by the browser.
            const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();
            console.log('%c[AUTH_INIT] Backend validation successful.', 'color: green; font-weight: bold;', { user: freshUser, org: freshOrg });

            if (!freshUser) {
                console.error(`[AUTH_INIT] Attempt ${attempt}: No user data from backend.`);
                throw new Error("No user data received from backend.");
            }

            console.log('[AUTH_STATE_UPDATE] Setting application state from validated session.', { user: freshUser, org: freshOrg });
            setToken('cookie'); // Token is in httpOnly cookie; use sentinel value for truthy checks
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
            // Auth errors (401/403) are definitive — retrying won't help.
            // Only retry transient errors (network, 5xx) which can occur for
            // newly created accounts where Firestore may be eventually consistent.
            if (error?.status === 401 || error?.status === 403) {
                break;
            }
            if (attempt < maxRetries) {
                console.log(`[AUTH_INIT] Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
            }
          }
      }

      if (!success) {
          console.log('[AUTH_INIT] Session validation failed (no valid cookie or expired). User is logged out.');
          removeAuthData();
          setUser(null);
          setToken(null);
          setSelectedWorkspace(null);
      }
      setLoading(false);
    };

    validateSession();
  }, []);

  // Re-validate the session when the user returns to the tab after a long absence.
  // Declared here so it is available to the useEffect below (after refreshAuthUser is defined).
  const lastHiddenTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (authError) {
      const timer = setTimeout(() => {
        setAuthError(null);
      }, 5000);
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

    // On mobile (Capacitor) cookies are unreliable, so store the token in localStorage
    // and send it as a Bearer header. On web the __session httpOnly cookie is used
    // instead — storing the token in localStorage would re-introduce an XSS exposure.
    if (Capacitor.isNativePlatform()) {
        localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.accessToken);
    } else {
        localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    setUser(data.user);
    setToken(data.accessToken);
    setSelectedWorkspace(data.selectedWorkspace);

    if (data.firebaseToken) {
      signInWithCustomToken(firebaseAuth, data.firebaseToken).catch(() => {
        // Non-critical: real-time sync falls back gracefully if Firebase Auth fails
      });
    }

    storeUser(data.user);
    storeSelectedOrg(data.selectedWorkspace);
    setContextSelectionMode(null);
    setUserForContextSelection(null);
    localStorage.removeItem('userForContextSelection');
    applyUserLanguage(data.user);

    // Show the language selection modal on first login (no preferred language set yet)
    if (!data.user.preferredLanguage) {
      setShowLanguageModal(true);
    }
  }, []);

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
             // Payment flow user with no WorkHubs yet
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
      console.error("Login error:", error);
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
        console.error("Context Selection error:", error);
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
        window.location.reload(); // Reload to ensure all contexts and data are re-fetched cleanly
    } catch (error: any) {
        console.error("Switch Context error:", error);
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

  const logout = useCallback(async () => {
    console.log('%c[AUTH_STATE_UPDATE] Logging out user and clearing all auth data.', 'color: red; font-weight: bold;');
    // Clear local state FIRST so the UI reacts instantly and any in-progress
    // navigation (e.g. navigate('/login') called right after logout()) always
    // finds user === null. Without this ordering, the async backend call below
    // kept user non-null long enough for App.tsx's /login route to see
    // `user !== null` and redirect to /dashboard before the state cleared.
    setUser(null);
    setToken(null);
    setSelectedWorkspace(null);
    setContextSelectionMode(null);
    setUserForContextSelection(null);
    removeAuthData();
    // Async cleanup — fire-and-forget; the user is already logged out in the UI.
    try {
        // Clear httpOnly cookies on the backend
        await apiService.logoutFromBackend();
    } catch (e) {
        console.warn('Backend logout call failed (cookies may already be expired)', e);
    }
    // Native social logout removed — mobile app not yet supported
  }, []);

  const cancelContextSelection = useCallback(() => {
    if (contextSelectionMode === 'login') {
      logout();
    }
    setContextSelectionMode(null);
  }, [contextSelectionMode, logout]);

  const finalizeLoginSession = useCallback((loginData: any) => {
    console.log('[CheckoutSuccess] Calling finalizeLoginSession...');
    handleSuccessfulLogin(loginData);
  }, [handleSuccessfulLogin]);

  const register = useCallback(async (userData: Omit<User, 'id'| 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string; planId?: string }, recaptchaToken?: string | null): Promise<{ success: boolean; message: string; }> => {
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

  const registerOrganizationAdmin = useCallback(async (userData: Omit<User, 'id' | 'role' | 'workspaceIds' | 'workspaces' | 'profileImageUrl' | 'status' | 'dbRoles'> & { password: string }, planId: string, recaptchaToken?: string | null): Promise<{ success: boolean; user?: User }> => {
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

  const setAuthenticatedUserFromGoogle = useCallback(async (receivedToken: string): Promise<boolean> => {
    setLoading(true);
    setAuthError(null);
    console.log('[AUTH_FLOW] Completing Google Sign-In...');
    try {
      const data = await apiService.getGoogleLoginFinalization(receivedToken);
      if (data.multiContext) {
        if (!data.user.workspaces || data.user.workspaces.length === 0) {
             console.log('[AUTH_FLOW] New Google user (checkout flow). Setting partial user state without context selection.');
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
        // Token is now in httpOnly cookie (set by the backend during the redirect).
        // We just need to fetch user details — the cookie is sent automatically.
        const maxRetries = 5;
        const delay = 1500;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();

                if (!freshUser || !freshOrg) {
                    throw new Error("Incomplete user data received after authentication.");
                }

                const loginData = { accessToken: 'cookie', user: freshUser, selectedWorkspace: freshOrg };
                handleSuccessfulLogin(loginData);
                return true;

            } catch (error: any) {
                if (attempt === maxRetries) {
                    console.error(`[AUTH_FAILURE] All ${maxRetries} attempts to fetch user details failed. Final error:`, error);
                    throw error;
                }
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

  // --- NATIVE AUTH LOGINS ---
  const nativeGoogleLogin = useCallback(async () => {
    // Native social login not yet supported — mobile app is not available
    setAuthError('Native Google Sign-In is not available on this platform.');
  }, []);

  const nativeMicrosoftLogin = useCallback(async () => {
    // Native social login not yet supported — mobile app is not available
    setAuthError('Native Microsoft Sign-In is not available on this platform.');
  }, []);

  const updateAuthUser = useCallback((updatedUserData: User) => {
    console.log('[AUTH_STATE_UPDATE] Updating authenticated user data locally. New data:', updatedUserData);
    setUser(currentUser => {
      if (currentUser && currentUser.id === updatedUserData.id) {
        const safeUserData = {
            ...updatedUserData,
            // SECURITY: Forcefully preserve the current session role and WorkHub context.
            // Even if the backend calculates a "better" role based on DB state,
            // the active session must not change role without a full login/switch event.
            role: currentUser.role,
            workspaces: currentUser.workspaces,
            dbRoles: currentUser.dbRoles
        };
        storeUser(safeUserData);
        return safeUserData;
      }
      console.warn('[AUTH_STATE_UPDATE] updateAuthUser called but current user did not match. No update performed. Current:', currentUser, 'Update for:', updatedUserData);
      return currentUser;
    });
  }, []);

  const refreshAuthUser = useCallback(async () => {
    console.log('[AUTH_FLOW] Refreshing user data from backend...');
    try {
        const { user: freshUser, selectedWorkspace: freshOrg } = await apiService.getMyUserDetails();
        console.log('[AUTH_STATE_UPDATE] Refresh successful. Setting new user and org data.', { freshUser, freshOrg });
        updateAuthUser(freshUser);
        setSelectedWorkspace(freshOrg);
        storeSelectedOrg(freshOrg);
    } catch (error: any) {
        console.error("Failed to refresh auth user:", error);
        if (error.message.includes('expired') || error.message.includes('401')) {
            logout();
        }
    }
  }, [updateAuthUser, logout]);

  // Must be placed after refreshAuthUser is declared to avoid TDZ (const used before initialization).
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

  const updateUserDetails = useCallback(async (details: { name?: string; email?: string; conversationSavingEnabled?: boolean; preferredLanguage?: string }): Promise<boolean> => {
    try {
        const updatedUser = await apiService.updateMyUserDetails(details);
        updateAuthUser(updatedUser);
        return true;
    } catch (error: any) {
        setAuthError(error.message || 'Failed to update details');
        return false;
    }
  }, [updateAuthUser]);

  const updateUserPassword = useCallback(async (passwords: { currentPassword?: string; newPassword: string }): Promise<boolean> => {
    try {
        await apiService.updateMyPassword(passwords);
        await refreshAuthUser(); // Refresh user state to get new hasPassword flag
        return true;
    } catch (error: any) {
        setAuthError(error.message || 'Failed to update password');
        return false;
    }
  }, [refreshAuthUser]);

  const dismissLanguageModal = useCallback(() => setShowLanguageModal(false), []);

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

  const isOrgSubscriptionActive = useMemo(() => {
    const status = selectedWorkspace?.subscriptionStatus;
    // Default to active for backwards compatibility (orgs without explicit status)
    return !status || status === 'active' || status === 'trialing';
  }, [selectedWorkspace]);

  const availableContexts = useMemo(() => {
    const userForContexts = contextSelectionMode === 'login' ? userForContextSelection : user;
    if (!userForContexts?.workspaces || !userForContexts?.dbRoles) return [];

    const contexts: { label: string; value: string; role: UserRole; organizationName: string; }[] = [];
    const addedContexts = new Set<string>();

    const { systemAdmin, organizationAdmin: assignedOrganizationAdmins = [], workspaceAdmin: assignedOrgAdmins = [] } = userForContexts.dbRoles;

    // 1. System Admin role
    if (systemAdmin) {
        const defaultOrg = userForContexts.workspaces.find(o => o.name === 'Default Workspace') || userForContexts.workspaces[0];
        if (defaultOrg) {
            const contextValue = JSON.stringify({ role: 'system_admin', workspaceId: defaultOrg.id });
            if (!addedContexts.has(contextValue)) {
                contexts.push({ label: 'System Administrator', value: contextValue, role: 'system_admin', organizationName: 'System-Wide' });
                addedContexts.add(contextValue);
            }
        }
    }

    // 2. WorkHub Admin roles
    const academiesForAdminRole = systemAdmin
        ? (userForContexts.allAcademies || [])
        : assignedOrganizationAdmins.map(orgId => {
            const orgForName = userForContexts.workspaces.find(o => o.orgId === orgId);
            return { id: orgId, name: orgForName?.organizationName || 'Unknown Workspace' };
        });

    const organizationAdminOrganizationIds = new Set(academiesForAdminRole.map(a => a.id));

    academiesForAdminRole.forEach(workspace => {
        const orgInOrganization = userForContexts.workspaces.find(o => o.orgId === workspace.id);
        if (orgInOrganization) {
            const contextValue = JSON.stringify({ role: 'org_admin', workspaceId: orgInOrganization.id });
            if (!addedContexts.has(contextValue)) {
                contexts.push({ label: `${workspace.name} Admin`, value: contextValue, role: 'org_admin', organizationName: workspace.name });
                addedContexts.add(contextValue);
            }
        }
    });

    // 3. WorkHub Admin roles
    assignedOrgAdmins.forEach(orgId => {
      const org = userForContexts.workspaces.find(o => o.id === orgId);
      // Only hide if it's a personal WorkHub in an WorkHub they manage
      const isManagedPersonalOrg = org?.isPersonal && organizationAdminOrganizationIds.has(org.orgId);
      if (org && !isManagedPersonalOrg && !organizationAdminOrganizationIds.has(org.orgId)) {
        const contextValue = JSON.stringify({ role: 'workspace_admin', workspaceId: org.id });
        if (!addedContexts.has(contextValue)) {
            contexts.push({ label: `${org.name} Manager`, value: contextValue, role: 'workspace_admin', organizationName: org.organizationName || 'Unknown Workspace' });
            addedContexts.add(contextValue);
        }
      }
    });

    // 4. Regular User roles
    userForContexts.workspaces.forEach(org => {
      // Only hide if it's a personal WorkHub in an WorkHub they manage
      const isManagedPersonalOrg = org.isPersonal && organizationAdminOrganizationIds.has(org.orgId);
      if (org.name === 'Default Workspace' || isManagedPersonalOrg || systemAdmin) return;

      if (!organizationAdminOrganizationIds.has(org.orgId) && !assignedOrgAdmins.includes(org.id)) {
        const contextValue = JSON.stringify({ role: 'regular_user', workspaceId: org.id });
        if (!addedContexts.has(contextValue)) {
            contexts.push({ label: `${org.name} User`, value: contextValue, role: 'regular_user', organizationName: org.organizationName || 'Unknown Workspace' });
            addedContexts.add(contextValue);
        }
      }
    });

    const grouped = contexts.reduce((acc, ctx) => {
        const groupName = ctx.organizationName === 'System-Wide' ? 'System Administration' : `Workspace: ${ctx.organizationName}`;
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(ctx);
        return acc;
    }, {} as Record<string, typeof contexts>);

    Object.values(grouped).forEach(group => group.sort((a, b) => {
        const roleOrder = { 'system_admin': -1, 'org_admin': 0, 'workspace_admin': 1, 'regular_user': 2 } as Record<UserRole, number>;
        return roleOrder[a.role] - roleOrder[b.role];
    }));

    const sortedGroupKeys = Object.keys(grouped).sort((a, b) => a === 'System Administration' ? -1 : b === 'System Administration' ? 1 : a.localeCompare(b));

    return sortedGroupKeys.map(key => ({ groupName: key, contexts: grouped[key] }));
  }, [user, userForContextSelection, contextSelectionMode]);


  return (
    <AuthContext.Provider value={{
        user,
        token,
        selectedWorkspace,
        isOrgSubscriptionActive,
        contextSelectionMode,
        userForContextSelection,
        availableContexts,
        login,
        completeLoginWithContext,
        switchContext,
        startContextSwitch,
        cancelContextSelection,
        finalizeLoginSession,
        register,
        initiateCheckoutRegistration,
        registerOrganizationAdmin,
        logout,
        loading,
        authError,
        clearAuthError,
        updateUserDetails,
        updateUserPassword,
        updateUserProfileImage,
        setAuthenticatedUserFromGoogle,
        setAuthenticatedUserFromToken,
        nativeGoogleLogin,
        nativeMicrosoftLogin,
        showLanguageModal,
        dismissLanguageModal,
        updateAuthUser,
        refreshAuthUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
