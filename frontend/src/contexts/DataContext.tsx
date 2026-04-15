import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace, User, PreApprovedUser, AcademySettings, Organization, SystemSettings, TutorialSettings } from '../types';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { queryKeys } from '../hooks/queries/queryKeys';
import { useAcademiesQuery, useAcademySettingsQuery } from '../hooks/queries/useAcademyQueries';
import { useOrganizationsQuery, useArchivedOrganizationsQuery } from '../hooks/queries/useOrganizationQueries';
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
  academies: Organization[];
  fetchAcademies: () => Promise<void>;
  addAcademy: (name: string) => Promise<Organization | null>;
  updateAcademy: (id: string, name: string) => Promise<boolean>;
  deleteAcademy: (id: string) => Promise<boolean>;
  addAcademyAdmin: (academyId: string, email: string) => Promise<{message: string} | null>;
  removeAcademyAdmin: (academyId: string, userId: string) => Promise<{message: string} | null>;

  organizations: Workspace[];
  archivedOrganizations: Workspace[];
  fetchOrganizations: (filterType?: 'corporate' | 'individual' | 'all') => Promise<void>;
  fetchArchivedOrganizations: () => Promise<void>;
  addOrganization: (name: string, academyId: string, planId?: string) => Promise<Workspace | null>;
  updateOrganization: (id: string, data: { name?: string; planId?: string }) => Promise<boolean>;
  deleteOrganization: (id: string, force?: boolean) => Promise<{ isConflict: boolean; dependencies?: any }>;
  confirmArchiveOrganization: (id: string) => Promise<boolean>;
  restoreOrganization: (id: string) => Promise<boolean>;
  addOrganizationManager: (organizationId: string, email: string) => Promise<{message: string} | null>;
  removeOrganizationManager: (organizationId: string, userId: string) => Promise<{message: string} | null>;
  removeUserFromOrganization: (organizationId: string, userId: string) => Promise<boolean>;

  users: User[];
  fetchUsers: () => Promise<void>;
  deleteUser: (userId: string, deletionType: 'soft' | 'hard') => Promise<boolean>;

  preApprovedUsers: PreApprovedUser[];
  preApproveUsersInBulk: (emails: string[], organizationId: string) => Promise<{successCount: number} | null>;
  revokePreApprovedUser: (preApprovedUserId: string) => Promise<boolean>;

  academySettings: AcademySettings | null;
  updateAcademySettings: (settings: Partial<AcademySettings> & { logoUpload?: string }) => Promise<AcademySettings | null>;
  setAcademySettingsLocal: (settings: AcademySettings | null) => void;
  regenerateApiKey: () => Promise<AcademySettings | null>;

  systemSettings: SystemSettings | null;
  fetchSystemSettings: () => Promise<void>;
  updateSystemSettings: (settings: SystemSettings) => Promise<boolean>;

  tutorialSettings: TutorialSettings | null;
  fetchTutorialSettings: () => Promise<void>;
  updateTutorialSettings: (settings: TutorialSettings) => Promise<boolean>;

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
  const usersQuery = useUsersQuery(undefined, isLoggedIn && isAdminRole);
  const preApprovedUsersQuery = usePreApprovedUsersQuery(isLoggedIn && (isAcademyAdmin || isOrgAdmin));
  const academySettingsQuery = useAcademySettingsQuery(isLoggedIn && isNonSystemUser);
  const systemSettingsQuery = useSystemSettingsQuery(isLoggedIn && (isSystemAdmin || isAcademyAdmin));
  const tutorialSettingsQuery = useTutorialSettingsQuery(isLoggedIn && (isSystemAdmin || isAcademyAdmin));

  // --- Derived state from React Query ---
  const academies = academiesQuery.data ?? [];
  const organizations = organizationsQuery.data ?? [];
  const archivedOrganizations = archivedOrganizationsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const preApprovedUsers = preApprovedUsersQuery.data ?? [];
  const academySettings = academySettingsQuery.data ?? null;
  const systemSettings = systemSettingsQuery.data ?? null;
  const tutorialSettings = tutorialSettingsQuery.data ?? null;

  // --- General state ---
  const [dataError, setDataError] = useState<string | null>(null);

  // Composite loading: true while any role-enabled query is loading for the first time
  const isLoading = [
    academiesQuery, organizationsQuery, usersQuery,
    academySettingsQuery, systemSettingsQuery, tutorialSettingsQuery,
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
      } else {
        setDataError(errorMessage || error.message || 'An unknown error occurred.');
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
    const { getArchivedOrganizations } = await api();
    await queryClient.fetchQuery({ queryKey: queryKeys.organizations.archived, queryFn: () => getArchivedOrganizations() });
  }, [queryClient]);

  const fetchUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  }, [queryClient]);

  const fetchPreApprovedUsers = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.users.preApproved });
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

  // fetchAllData is now a no-op — React Query handles lazy loading via enabled flags.
  // Kept for backward compatibility.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchAllData = useCallback(async (_userRole: UserRole, _selectedOrgId?: string) => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // --- Create/Update/Delete Logic (mutations) ---

  // Academies
  const addAcademy = async (name: string) => {
    const { createAcademy } = await api();
    return handleApiCall(() => createAcademy(name), () => fetchAcademies(), 'Failed to add academy.');
  };
  const updateAcademy = async (id: string, name: string) => {
    const { updateAcademy: updateAcademyApi } = await api();
    const updated = await handleApiCall(() => updateAcademyApi(id, name), () => fetchAcademies(), 'Failed to update academy.');
    return !!updated;
  };
  const deleteAcademy = async (id: string) => {
    const { deleteAcademy: deleteAcademyApi } = await api();
    const success = await handleApiCall(() => deleteAcademyApi(id), () => fetchAcademies(), 'Failed to delete academy.');
    return success === null;
  };
  const addAcademyAdmin = async (academyId: string, email: string) => {
    const { addAcademyAdmin: addAcademyAdminApi } = await api();
    return handleApiCall(() => addAcademyAdminApi(academyId, email), () => fetchUsers(), 'Failed to add academy admin.');
  };
  const removeAcademyAdmin = async (academyId: string, userId: string) => {
    const { removeAcademyAdmin: removeAcademyAdminApi } = await api();
    return handleApiCall(() => removeAcademyAdminApi(academyId, userId), () => fetchUsers(), 'Failed to remove admin.');
  };

  // Organizations
  const addOrganization = async (name: string, academyId: string, planId?: string) => {
    const { addOrganizationToBackend } = await api();
    return handleApiCall(() => addOrganizationToBackend(name, academyId, planId), () => fetchOrganizations(), 'Failed to add organization.');
  };
  const updateOrganization = async (id: string, data: { name?: string; planId?: string; subscriptionProvider?: string; isPersonal?: boolean }) => {
    const { updateOrganizationOnBackend } = await api();
    const updated = await handleApiCall(() => updateOrganizationOnBackend(id, data), () => fetchOrganizations(), 'Failed to update organization.');
    return !!updated;
  };
  const deleteOrganization = async (id: string, force = false): Promise<{ isConflict: boolean; dependencies?: any }> => {
    try {
      const { deleteOrganizationFromBackend } = await api();
      await deleteOrganizationFromBackend(id, force);
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
    const { deleteOrganizationFromBackend } = await api();
    const success = await handleApiCall(() => deleteOrganizationFromBackend(id, true), () => fetchOrganizations(), 'Failed to archive organization.');
    return success === null;
  };
  const restoreOrganization = async (id: string) => {
    const { restoreOrganization: restoreOrganizationApi } = await api();
    const success = await handleApiCall(() => restoreOrganizationApi(id), undefined, 'Failed to restore organization.');
    if (success) {
      await fetchOrganizations();
      await fetchArchivedOrganizations();
    }
    return !!success;
  };
  const addOrganizationManager = async (organizationId: string, email: string) => {
    const { addOrganizationManager: addOrgManagerApi } = await api();
    return handleApiCall(() => addOrgManagerApi(organizationId, email), () => fetchUsers(), 'Failed to add manager.');
  };
  const removeOrganizationManager = async (organizationId: string, userId: string) => {
    const { removeOrganizationManager: removeOrgManagerApi } = await api();
    return handleApiCall(() => removeOrgManagerApi(organizationId, userId), () => fetchUsers(), 'Failed to remove manager.');
  };
  const removeUserFromOrganization = async (organizationId: string, userId: string): Promise<boolean> => {
    const { removeUserFromOrganization: removeUserApi } = await api();
    const result = await handleApiCall(() => removeUserApi(organizationId, userId), () => fetchUsers(), 'Failed to remove user from organization.');
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
  const preApproveUsersInBulk = async (emails: string[], organizationId: string) => {
    const { preApproveUsersInBulk: preApproveApi } = await api();
    return handleApiCall(() => preApproveApi(emails, organizationId), () => fetchPreApprovedUsers(), 'Failed to pre-approve users.');
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

  // Organization Settings
  const updateAcademySettings = async (settings: Partial<AcademySettings> & { logoUpload?: string }) => {
    const { updateThemeSettingsOnBackend } = await api();
    const result = await handleApiCall(() => updateThemeSettingsOnBackend(settings), undefined, 'Failed to update academy settings.');
    if (result) {
      await fetchAcademySettings();
    }
    return result;
  };

  const setAcademySettingsLocal = (settings: AcademySettings | null) => {
    queryClient.setQueryData(queryKeys.settings.academy, settings);
  };

  const regenerateApiKey = async () => {
    const { regenerateApiKey: regenerateApiKeyApi } = await api();
    return handleApiCall(() => regenerateApiKeyApi(), (updatedSettings) => {
      queryClient.setQueryData(queryKeys.settings.academy, (prev: AcademySettings | null | undefined) =>
        ({ ...(prev as AcademySettings), ...updatedSettings })
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
      academies, fetchAcademies, addAcademy, updateAcademy, deleteAcademy, addAcademyAdmin, removeAcademyAdmin,
      organizations, archivedOrganizations, fetchOrganizations, fetchArchivedOrganizations, addOrganization, updateOrganization, deleteOrganization, confirmArchiveOrganization, restoreOrganization, addOrganizationManager, removeOrganizationManager, removeUserFromOrganization,
      users, fetchUsers, deleteUser,
      preApprovedUsers, preApproveUsersInBulk, revokePreApprovedUser,
      academySettings, updateAcademySettings, setAcademySettingsLocal, regenerateApiKey,
      systemSettings, fetchSystemSettings, updateSystemSettings,
      tutorialSettings, fetchTutorialSettings, updateTutorialSettings,
      isLoading, dataError, clearDataError, fetchAllData,
    }}>
      {children}
    </DataContext.Provider>
  );
};
