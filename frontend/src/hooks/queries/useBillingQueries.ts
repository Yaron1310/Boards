import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useBillingCycleQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.billing.currentCycle,
    queryFn: () => apiService.getCurrentBillingCycle(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
