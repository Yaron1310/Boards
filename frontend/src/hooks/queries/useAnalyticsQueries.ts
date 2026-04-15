import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useUserTokenUsageQuery = (month?: number, year?: number, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.analytics.userToken(month, year),
    queryFn: () => apiService.getUserTokenUsage(month, year),
    enabled,
  });
};

export const useOrgTokenUsageQuery = (month?: number, year?: number, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.analytics.orgToken(month, year),
    queryFn: () => apiService.getOrgTokenUsage(month, year),
    enabled,
  });
};

export const useAcademyTokenUsageQuery = (month?: number, year?: number, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.analytics.academyToken(month, year),
    queryFn: () => apiService.getAcademyTokenUsage(month, year),
    enabled,
  });
};
