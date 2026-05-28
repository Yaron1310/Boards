import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wms from '@/services/workManagementService';
import * as api from '@/services/geminiService';
import type { BoardRole } from '@/types';

export const useBoardMembers = (boardId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.boardMembers.all(boardId),
    queryFn: () => wms.getBoardMembers(boardId),
    enabled: enabled && !!boardId,
  });

export const useAddBoardMember = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
      wms.addBoardMember(boardId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.boardMembers.all(boardId) }),
  });
};

export const useRemoveBoardMember = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => wms.removeBoardMember(boardId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.boardMembers.all(boardId) }),
  });
};

export const useInviteUserToBoard = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, permissions }: { email: string; permissions: 'edit' | 'read_only' }) =>
      api.inviteUserToBoard(boardId, email, permissions),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.boardMembers.all(boardId) }),
  });
};

export const useUserBoardPermissions = (userId: string, enabled = true) =>
  useQuery({
    queryKey: ['userBoardPermissions', userId],
    queryFn: () => api.getUserBoardPermissions(userId),
    enabled: enabled && !!userId,
  });

export const useUpdateUserBoardPermissions = (userId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boards: Array<{ boardId: string; role: BoardRole }>) =>
      api.updateUserBoardPermissions(userId, boards),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['userBoardPermissions', userId] }),
  });
};
