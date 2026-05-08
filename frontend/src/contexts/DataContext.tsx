import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace, User, PreApprovedUser, OrganizationSettings, SystemSettings, TutorialSettings } from '../types';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { queryKeys } from '../hooks/queries/queryKeys';
import { useAcademiesQuery, useOrganizationSettingsQuery } from '../hooks/queries/useAcademyQueries';
import { useWorkspacesQuery, useArchivedWorkspacesQuery } from '../hooks/queries/useOrganizationQueries';
import { useUsersQuery, usePreApprovedUsersQuery } from '../hooks/queries/useUserQueries';
import { useSystemSettingsQuery, useTutorialSettingsQuery } from '../hooks/queries/useSettingsQueries';

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

// Lazy-imported API service to avoid a direct import of the (potentially deleted) module path.
// All functions that need to call the backend go through this dynamic import so that the
// DataContext itself has no static dependency on geminiService.
const api = () => import('../services/geminiService');

interface DataContextType {
  organizations: Workspace[];
  fetchAcademies: () => Promise<void>;
  addOrganization: (name: string) => Promise<Workspace | null>;
  updateOrganization: (id: string, name: string) => Promise<boolean>;
  deleteOrganization: (id: string) => Promise<boolean>;
  addOrganizationAdmin: (orgId: string, email: string) => Promise<{message: string} | null>;
  removeOrganizationAdmin: (orgId: string, userId: string) => Promise<{message: string} | null>;

  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  fetchWorkspaces: (filterType?: 'corporate' | 'individual' | 'all') => Promise<void>;
  fetchArchivedWorkspaces: () => Promise<void>;
  addWorkspace: (name: string, orgId: string, planId?: string, color?: string) => Promise<Workspace | null>;
  updateWorkspace: (id: string, data: { name?: string; planId?: string; color?: string }) => Promise<boolean>;
  deleteWorkspace: (id: string, force?: boolean) => Promise<{ isConflict: boolean; dependencies?: any }>;
  confirmArchiveWorkspace: (id: string) => Promise<boolean>;
  restoreWorkspace: (id: string) => Promise<boolean>;
  addWorkspaceManager: (workspaceId: string, email: string) => Promise<{message: string} | null>;
  removeWorkspaceManager: (workspaceId: string, userId: string) => Promise<{message: string} | null>;
  removeUserFromWorkspace: (workspaceId: string, userId: string) => Promise<boolean>;

  users: User[];
  fetchUsers: () => Promise<void>;
  deleteUser: (userId: string, deletionType: 'soft' | 'hard') => Promise<boolean>;

  preApprovedUsers: PreApprovedUser[];
  preApproveUsersInBulk: (emails: string[], workspaceId: string) => Promise<{successCount: number} | null>;
  revokePreApprovedUser: (preApprovedUserId: string) => Promise<boolean>;

  organizationSettings: OrganizationSettings | null;
  updateOrganizationSettings: (settings: Partial<OrganizationSettings> & { logoUpload?: string }) => Promise<OrganizationSettings | null>;
  setOrganizationSettingsLocal: (settings: OrganizationSettings | null) => void;
  regenerateApiKey: () => Promise<OrganizationSettings | null>;

  systemSettings: SystemSettings | null;
  fetchSystemSettings: () => Promise<void>;
  updateSystemSettings: (settings: SystemSettings) => Promise<boolean>;

  tutorialSettings: TutorialSettings | null;
  fetchTutorialSettings: () => Promise<void>;
  updateTutorialSettings: (settings: TutorialSettings) => Promise<boolean>;

  orgTokenUsage: Record<string, { used: number; limit: number | null }> | null;
  organizationTokenUsage: Record<string, { used: number; limit: number | null }> | null;
  isAnalyticsLoading: boolean;
  fetchOrgTokenUsage: (month?: number, year?: number) => Promise<void>;

  isLoading: boolean;
  dataError: string | null;
  clearDataError: () => void;
  fetchAllData: (userRole: UserRole, selectedOrgId?: string) => Promise<void>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, selectedWorkspace, logout } = useAuth();
  const queryClient = useQueryClient();

  // --- Role-based query enablement ---
  const isLoggedIn = !!user && !!selectedWorkspace;
  const role = user?.role;
  const isSystemAdmin = role === UserRole.SYSTEM_ADMIN;
  const isOrganizationAdmin = role === UserRole.ORGANIZATION_ADMIN;
  const isOrgAdmin = role === UserRole.WORKSPACE_ADMIN;
  const isAdminRole = isSystemAdmin || isOrganizationAdmin || isOrgAdmin;
  const isNonSystemUser = isOrganizationAdmin || isOrgAdmin || role === UserRole.REGULAR_USER;

  // --- React Query hooks (enabled per role — data loads lazily) ---
  const academiesQuery = useAcademiesQuery(isLoggedIn && isSystemAdmin);
  const workspacesQuery = useWorkspacesQuery(undefined, isLoggedIn && (isSystemAdmin || isOrganizationAdmin));
  const archivedWorkspacesQuery = useArchivedWorkspacesQuery(false);
  const usersQuery = useUsersQuery(undefined, isLoggedIn && isAdminRole);
  const preApprovedUsersQuery = usePreApprovedUsersQuery(isLoggedIn && (isOrganizationAdmin || isOrgAdmin));
  const organizationSettingsQuery = useOrganizationSettingsQuery(isLoggedIn && isNonSystemUser);
  const systemSettingsQuery = useSystemSettingsQuery(isLoggedIn && (isSystemAdmin || isOrganizationAdmin));
  const tutorialSettingsQuery = useTutorialSettingsQuery(isLoggedIn && (isSystemAdmin || isOrganizationAdmin));

  // --- Derived state from React Query ---
  const organizations = academiesQuery.data ?? [];
  const workspaces = workspacesQuery.data ?? [];
  const archivedWorkspaces = archivedWorkspacesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const preApprovedUsers = preApprovedUsersQuery.data ?? [];
  const organizationSettings = organizationSettingsQuery.data ?? null;
  const systemSettings = systemSettingsQuery.data ?? null;
  const tutorialSettings = tutorialSettingsQuery.data ?? null;

  // --- General state ---
  const [dataError, setDataError] = useState<string | null>(null);

  // Token usage analytics stubs — backend not yet implemented
  const orgTokenUsage: Record<string, { used: number; limit: number | null }> | null = null;
  const organizationTokenUsage: Record<string, { used: number; limit: number | null }> | null = null;
  const isAnalyticsLoading = false;
  const fetchOrgTokenUsage = useCallback(async (_month?: number, _year?: number) => {}, []);

  // Composite loading: true while any role-enabled query is loading for the first time
  const isLoading = [
    academiesQuery, workspacesQuery, usersQuery,
    organizationSettingsQuery, systemSettingsQuery, tutorialSettingsQuery,
    preApprovedUsersQuery,
  ].some(q => q.isLoading && q.fetchStatus !== 'idle');

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
    if (!user || !selectedWorkspace) {
      queryClient.clear();
    }
  }, [user, selectedWorkspace, queryClient]);

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
      } else {
        setDataError(errorMessage || error.message || 'An unknown error occurred.');
      }
      return null;
    }
  }, [logout]);

  // --- Invalidation-based fetch functions (backward compat) ---
  const fetchAcademies = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  }, [queryClient]);

  const fetchWorkspaces = useCallback(async (filterType?: 'corporate' | 'individual' | 'all') => {
    if (filterType && filterType !== 'all') {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.filtered(filterType) });
    }
    // Always invalidate the main WorkHubs query (filterType: undefined) since
    // that's what DataContext uses. 'all' and undefined fetch the same unfiltered data.
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
  }, [queryClient]);

  const fetchArchivedWorkspaces = useCallback(async () => {
    const { getArchivedWorkspaces } = await api();
    await queryClient.fetchQuery({ queryKey: queryKeys.workspaces.archived, queryFn: () => getArchivedWorkspaces() });
  }, [queryClient]);

  const fetchUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  }, [queryClient]);

  const fetchPreApprovedUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.preApproved });
  }, [queryClient]);

  const fetchOrganizationSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.workspace });
  }, [queryClient]);

  const fetchSystemSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.system });
  }, [queryClient]);

  const fetchTutorialSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.settings.tutorial });
  }, [queryClient]);

  // fetchAllData is now a no-op — React Query handles lazy loading via enabled flags.
  // Kept for backward compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchAllData = useCallback(async (_userRole: UserRole, _selectedOrgId?: string) => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // --- Create/Update/Delete Logic (mutations) ---

  // Workspaces
  const addOrganization = async (name: string) => {
    const { createOrganization } = await api();
    return handleApiCall(() => createOrganization(name), () => fetchAcademies(), 'Failed to add workspace.');
  };
  const updateOrganization = async (id: string, name: string) => {
    const { updateOrganization: updateOrganizationApi } = await api();
    const updated = await handleApiCall(() => updateOrganizationApi(id, name), () => fetchAcademies(), 'Failed to update workspace.');
    return !!updated;
  };
  const deleteOrganization = async (id: string) => {
    const { deleteOrganization: deleteOrganizationApi } = await api();
    const success = await handleApiCall(() => deleteOrganizationApi(id), () => fetchAcademies(), 'Failed to delete workspace.');
    return success === null;
  };
  const addOrganizationAdmin = async (orgId: string, email: string) => {
    const { addOrganizationAdmin: addOrganizationAdminApi } = await api();
    return handleApiCall(() => addOrganizationAdminApi(orgId, email), () => fetchUsers(), 'Failed to add WorkHub admin.');
  };
  const removeOrganizationAdmin = async (orgId: string, userId: string) => {
    const { removeOrganizationAdmin: removeOrganizationAdminApi } = await api();
    return handleApiCall(() => removeOrganizationAdminApi(orgId, userId), () => fetchUsers(), 'Failed to remove admin.');
  };

  // Workspaces
  const addWorkspace = async (name: string, orgId: string, planId?: string, color?: string) => {
    const { addWorkspaceToBackend } = await api();
    return handleApiCall(() => addWorkspaceToBackend(name, orgId, planId, color), () => fetchWorkspaces(), 'Failed to add workspace.');
  };
  const updateWorkspace = async (id: string, data: { name?: string; planId?: string; subscriptionProvider?: string; isPersonal?: boolean; color?: string }) => {
    const { updateWorkspaceOnBackend } = await api();
    const updated = await handleApiCall(() => updateWorkspaceOnBackend(id, data), () => fetchWorkspaces(), 'Failed to update workspace.');
    return !!updated;
  };
  const deleteWorkspace = async (id: string, force = false): Promise<{ isConflict: boolean; dependencies?: any }> => {
    try {
      const { deleteWorkspaceFromBackend } = await api();
      await deleteWorkspaceFromBackend(id, force);
      await fetchWorkspaces();
      return { isConflict: false };
    } catch (error: any) {
      if (error.isConflict) {
        return { isConflict: true, dependencies: error.dependencies };
      }
      setDataError(error.message || 'An error occurred while archiving the workspace.');
      return { isConflict: false };
    }
  };
  const confirmArchiveWorkspace = async (id: string): Promise<boolean> => {
    const { deleteWorkspaceFromBackend } = await api();
    const success = await handleApiCall(() => deleteWorkspaceFromBackend(id, true), () => fetchWorkspaces(), 'Failed to archive workspace.');
    return success === null;
  };
  const restoreWorkspace = async (id: string) => {
    const { restoreWorkspace: restoreWorkspaceApi } = await api();
    const success = await handleApiCall(() => restoreWorkspaceApi(id), undefined, 'Failed to restore workspace.');
    if (success) {
      await fetchWorkspaces();
      await fetchArchivedWorkspaces();
    }
    return !!success;
  };
  const addWorkspaceManager = async (workspaceId: string, email: string) => {
    const { addWorkspaceManager: addOrgManagerApi } = await api();
    return handleApiCall(() => addOrgManagerApi(workspaceId, email), () => fetchUsers(), 'Failed to add manager.');
  };
  const removeWorkspaceManager = async (workspaceId: string, userId: string) => {
    const { removeWorkspaceManager: removeOrgManagerApi } = await api();
    return handleApiCall(() => removeOrgManagerApi(workspaceId, userId), () => fetchUsers(), 'Failed to remove manager.');
  };
  const removeUserFromWorkspace = async (workspaceId: string, userId: string): Promise<boolean> => {
    const { removeUserFromWorkspace: removeUserApi } = await api();
    const result = await handleApiCall(() => removeUserApi(workspaceId, userId), () => fetchUsers(), 'Failed to remove user from workspace.');
    return result === null;
  };

  // Users
  const deleteUser = async (userId: string, deletionType: 'soft' | 'hard') => {
    const { deleteUserAccount } = await api();
    const success = await handleApiCall(
      () => deleteUserAccount(userId, deletionType),
      () => {
        queryClient.setQueryData(queryKeys.users.all, (old: User[] | undefined) =>
          old ? old.filter(u => u.id !== userId) : []
        );
      },
      'Failed to delete user.'
    );
    return success === null;
  };
  const preApproveUsersInBulk = async (emails: string[], workspaceId: string) => {
    const { preApproveUsersInBulk: preApproveApi } = await api();
    return handleApiCall(() => preApproveApi(emails, workspaceId), () => fetchPreApprovedUsers(), 'Failed to pre-approve users.');
  };
  const revokePreApprovedUser = async (preApprovedUserId: string) => {
    const { deletePreApprovedUserFromBackend } = await api();
    const success = await handleApiCall(
      () => deletePreApprovedUserFromBackend(preApprovedUserId),
      () => {
        queryClient.setQueryData(queryKeys.users.preApproved, (old: PreApprovedUser[] | undefined) =>
          old ? old.filter(pa => pa.id !== preApprovedUserId) : []
        );
      },
      'Failed to revoke pre-approval.'
    );
    return success === null;
  };

  // WorkHub Settings
  const updateOrganizationSettings = async (settings: Partial<OrganizationSettings> & { logoUpload?: string }) => {
    const { updateThemeSettingsOnBackend } = await api();
    const result = await handleApiCall(() => updateThemeSettingsOnBackend(settings), undefined, 'Failed to update WorkHub settings.');
    if (result) {
      await fetchOrganizationSettings();
    }
    return result;
  };

  const setOrganizationSettingsLocal = (settings: OrganizationSettings | null) => {
    queryClient.setQueryData(queryKeys.settings.workspace, settings);
  };

  const regenerateApiKey = async () => {
    const { regenerateApiKey: regenerateApiKeyApi } = await api();
    return handleApiCall(() => regenerateApiKeyApi(), (updatedSettings) => {
      queryClient.setQueryData(queryKeys.settings.workspace, (prev: OrganizationSettings | null | undefined) =>
        ({ ...(prev as OrganizationSettings), ...updatedSettings })
      );
    }, 'Failed to regenerate API key.');
  };

  // System Settings (System Admin)
  const updateSystemSettings = async (settings: SystemSettings) => {
    const { updateTokenLimits } = await api();
    const updated = await handleApiCall(() => updateTokenLimits(settings), (updatedSettings) => {
      queryClient.setQueryData(queryKeys.settings.system, updatedSettings);
    }, 'Failed to update system settings.');
    return !!updated;
  };

  const updateTutorialSettings = async (settings: TutorialSettings) => {
    const { updateTutorialSettings: updateTutorialApi } = await api();
    const updated = await handleApiCall(() => updateTutorialApi(settings), (updatedSettings) => {
      queryClient.setQueryData(queryKeys.settings.tutorial, updatedSettings);
    }, 'Failed to update tutorial settings.');
    return !!updated;
  };

  return (
    <DataContext.Provider value={{
      organizations, fetchAcademies, addOrganization, updateOrganization, deleteOrganization, addOrganizationAdmin, removeOrganizationAdmin,
      workspaces, archivedWorkspaces, fetchWorkspaces, fetchArchivedWorkspaces, addWorkspace, updateWorkspace, deleteWorkspace, confirmArchiveWorkspace, restoreWorkspace, addWorkspaceManager, removeWorkspaceManager, removeUserFromWorkspace,
      users, fetchUsers, deleteUser,
      preApprovedUsers, preApproveUsersInBulk, revokePreApprovedUser,
      organizationSettings, updateOrganizationSettings, setOrganizationSettingsLocal, regenerateApiKey,
      systemSettings, fetchSystemSettings, updateSystemSettings,
      tutorialSettings, fetchTutorialSettings, updateTutorialSettings,
      orgTokenUsage, organizationTokenUsage, isAnalyticsLoading, fetchOrgTokenUsage,
      isLoading, dataError, clearDataError, fetchAllData,
    }}>
      {children}
    </DataContext.Provider>
  );
};
