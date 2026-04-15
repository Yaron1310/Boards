import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useAcademiesQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.organizations.all,
    queryFn: () => apiService.getAcademies(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAcademySettingsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.settings.organization,
    queryFn: () => apiService.getThemeSettingsFromBackend(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
