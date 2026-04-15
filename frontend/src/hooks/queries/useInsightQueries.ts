import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';
import type { PersonalInsight } from '@/types';

export const usePersonalInsightsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.insights.personal,
    queryFn: async () => {
      const data = await apiService.getMyPersonalInsightsFromBackend();
      return data.map((i: PersonalInsight) => ({ ...i, updatedAt: new Date(i.updatedAt) }));
    },
    enabled,
  });
};
