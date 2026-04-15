import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const usePlansQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.plans.all,
    queryFn: () => apiService.getPlans(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedPlansQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.plans.archived,
    queryFn: () => apiService.getArchivedPlans(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
