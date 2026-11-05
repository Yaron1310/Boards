import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';
import type { UserGroupInput } from '@/types';

export const useUserGroupsQuery = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.userGroups.all,
    queryFn: apiService.getUserGroups,
    enabled,
  });

export const useCreateUserGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserGroupInput) => apiService.createUserGroup(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all }),
  });
};

export const useUpdateUserGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string; input: UserGroupInput }) => apiService.updateUserGroup(groupId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all }),
  });
};

export const useDeleteUserGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiService.deleteUserGroup(groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all }),
  });
};

export const useReorderUserGroups = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => apiService.reorderUserGroups(orderedIds),
    onSuccess: (groups) => queryClient.setQueryData(queryKeys.userGroups.all, groups),
    onError: () => queryClient.invalidateQueries({ queryKey: queryKeys.userGroups.all }),
  });
};
