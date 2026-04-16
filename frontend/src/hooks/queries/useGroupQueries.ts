import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateGroupData, UpdateGroupData, ReorderGroupItem } from '@/services/workManagementService';

export const useGroups = (boardId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.groups.all(boardId),
    queryFn: () => wm.listGroups(boardId),
    enabled: enabled && !!boardId,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, data }: { boardId: string; data: CreateGroupData }) =>
      wm.createGroup(boardId, data),
    onSuccess: (_group, { boardId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.groups.all(boardId) });
    },
  });
};

export const useUpdateGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, groupId, patch }: { boardId: string; groupId: string; patch: UpdateGroupData }) =>
      wm.updateGroup(boardId, groupId, patch),
    onSuccess: (_group, { boardId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.groups.all(boardId) });
    },
  });
};

export const useDeleteGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, groupId }: { boardId: string; groupId: string }) =>
      wm.deleteGroup(boardId, groupId),
    onSuccess: (_data, { boardId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.groups.all(boardId) });
    },
  });
};

export const useReorderGroups = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, order }: { boardId: string; order: ReorderGroupItem[] }) =>
      wm.reorderGroups(boardId, order),
    onSuccess: (_data, { boardId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.groups.all(boardId) });
    },
  });
};
