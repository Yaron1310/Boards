import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useUsersQuery = (params?: { limit?: number; cursor?: string; search?: string }, enabled = true) => {
  return useQuery({
    queryKey: params ? [...queryKeys.users.all, params] : queryKeys.users.all,
    queryFn: async () => {
      const res = await apiService.getUsers(params || { limit: 200 });
      return res.data;
    },
    enabled,
  });
};

export const useUsersInfiniteQuery = (params?: { limit?: number; search?: string; organizationId?: string; role?: string }, enabled = true) => {
  return useInfiniteQuery({
    queryKey: [...queryKeys.users.all, 'infinite', params],
    queryFn: ({ pageParam }) => apiService.getUsers({ ...params, cursor: pageParam as string }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled,
  });
};

export const usePreApprovedUsersQuery = (enabled = true) => {
// ... existing ...
  return useQuery({
    queryKey: queryKeys.users.preApproved,
    queryFn: async () => {
      const res = await apiService.getPreApprovedUsersFromBackend({ limit: 200 });
      return res.data;
    },
    enabled,
  });
};
