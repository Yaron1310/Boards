import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useConversationsQuery = (params?: { limit?: number; cursor?: string; search?: string }, enabled = true) => {
  return useQuery({
    queryKey: params ? [...queryKeys.conversations.all, params] : queryKeys.conversations.all,
    queryFn: async () => {
      const res = await apiService.getUserConversationsFromBackend(params || { limit: 200 });
      return res.data.map(c => ({ ...c, date: new Date(c.date) }));
    },
    enabled,
    staleTime: 1 * 60 * 1000,
  });
};

export const useConversationsInfiniteQuery = (params?: { limit?: number; search?: string; personaId?: string }, enabled = true) => {
  return useInfiniteQuery({
    queryKey: [...queryKeys.conversations.all, 'infinite', params],
    queryFn: async ({ pageParam }) => {
      const res = await apiService.getUserConversationsFromBackend({ ...params, cursor: pageParam as string });
      return {
        ...res,
        data: res.data.map(c => ({ ...c, date: new Date(c.date) }))
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled,
    staleTime: 1 * 60 * 1000,
  });
};

export const useAccessiblePersonasQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.personas.accessible,
    queryFn: () => apiService.getAccessibleChatPersonas(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useChatPersonasQuery = (enabled = true) => {
  return useQuery({
    queryKey: queryKeys.personas.admin,
    queryFn: () => apiService.getChatPersonas(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedChatPersonasQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.personas.archived,
    queryFn: () => apiService.getArchivedChatPersonas(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
