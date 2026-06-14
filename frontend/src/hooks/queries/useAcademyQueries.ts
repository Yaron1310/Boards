import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useAcademiesQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: () => apiService.getAcademies(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useOrganizationSettingsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.settings.workspace,
    queryFn: () => apiService.getThemeSettingsFromBackend(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
