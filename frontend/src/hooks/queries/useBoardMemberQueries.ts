import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wms from '@/services/workManagementService';
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
