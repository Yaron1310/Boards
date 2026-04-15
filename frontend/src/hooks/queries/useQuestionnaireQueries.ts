import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const usePublishedQuestionnairesQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.questionnaires.published,
    queryFn: async () => {
      const res = await apiService.getPublishedQuestionnaires({ limit: 200 });
      return res.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useQuestionnairesAdminQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.questionnaires.admin,
    queryFn: async () => {
      const res = await apiService.getQuestionnairesForAdmin({ limit: 200 });
      return res.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedQuestionnairesQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.questionnaires.archived,
    queryFn: () => apiService.getArchivedQuestionnaires(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useMyQuestionnaireResultsQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.questionnaires.myResults,
    queryFn: async () => {
      const data = await apiService.getMyLatestQuestionnaireResultsFromBackend();
      return data ? data.map(r => ({ ...r, completedAt: new Date(r.completedAt) })) : [];
    },
    enabled,
  });
};
