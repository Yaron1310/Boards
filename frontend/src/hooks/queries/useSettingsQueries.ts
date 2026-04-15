import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useSystemSettingsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.settings.system,
    queryFn: () => apiService.getTokenLimits(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useTutorialSettingsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.settings.tutorial,
    queryFn: () => apiService.getTutorialSettings(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
