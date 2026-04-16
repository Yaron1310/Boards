import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateColumnData, UpdateColumnData, ReorderColumnItem } from '@/services/workManagementService';

export const useColumns = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.columns.all,
    queryFn: () => wm.listColumns(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

export const useColumn = (id: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.columns.one(id),
    queryFn: () => wm.getColumn(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  });

export const useCreateColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateColumnData) => wm.createColumn(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.columns.all });
    },
  });
};

export const useUpdateColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateColumnData }) => wm.updateColumn(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.columns.one(updated.id), updated);
      void qc.invalidateQueries({ queryKey: queryKeys.columns.all });
    },
  });
};

export const useReorderColumns = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: ReorderColumnItem[]) => wm.reorderColumns(order),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.columns.all });
    },
  });
};

export const useDeleteColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteColumn(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.columns.one(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.columns.all });
    },
  });
};
