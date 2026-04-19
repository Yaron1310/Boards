import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateColumnData, UpdateColumnData, ReorderColumnItem } from '@/services/workManagementService';

export const useColumns = (boardId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.columns.board(boardId),
    queryFn: () => wm.listColumns(boardId),
    enabled: enabled && !!boardId,
    staleTime: 5 * 60 * 1000,
  });

export const useColumn = (boardId: string, id: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.columns.one(boardId, id),
    queryFn: () => wm.getColumn(boardId, id),
    enabled: enabled && !!boardId && !!id,
    staleTime: 5 * 60 * 1000,
  });

export const useCreateColumn = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateColumnData) => wm.createColumn(boardId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.columns.board(boardId) });
    },
  });
};

export const useUpdateColumn = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateColumnData }) =>
      wm.updateColumn(boardId, id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.columns.one(boardId, updated.id), updated);
      void qc.invalidateQueries({ queryKey: queryKeys.columns.board(boardId) });
    },
  });
};

export const useReorderColumns = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: ReorderColumnItem[]) => wm.reorderColumns(boardId, order),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.columns.board(boardId) });
    },
  });
};

export const useDeleteColumn = (boardId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteColumn(boardId, id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.columns.one(boardId, id) });
      void qc.invalidateQueries({ queryKey: queryKeys.columns.board(boardId) });
    },
  });
};
