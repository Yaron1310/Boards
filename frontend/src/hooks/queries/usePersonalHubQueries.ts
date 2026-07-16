import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as ph from '@/services/personalHubService';
import type { CreatePersonalColumnData, UpdatePersonalColumnData, ReorderPersonalColumnItem } from '@/services/personalHubService';

export const usePersonalColumns = (userId?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.personalHub.columns(userId),
    queryFn: () => ph.listPersonalColumns(userId),
    enabled,
    staleTime: 60 * 1000,
  });

export const useCreatePersonalColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePersonalColumnData) => ph.createPersonalColumn(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useUpdatePersonalColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePersonalColumnData }) => ph.updatePersonalColumn(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useReorderPersonalColumns = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: ReorderPersonalColumnItem[]) => ph.reorderPersonalColumns(order),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useDeletePersonalColumn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ph.deletePersonalColumn(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.itemValuesRoot });
    },
  });
};

export const usePersonalItemValues = (itemIds: string[], userId?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.personalHub.itemValues(itemIds, userId),
    queryFn: () => ph.getPersonalItemValues(itemIds, userId),
    enabled: enabled && itemIds.length > 0,
    staleTime: 30 * 1000,
  });

export const useUpdatePersonalItemValue = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, columnId, value }: { itemId: string; columnId: string; value: unknown }) =>
      ph.updatePersonalItemValue(itemId, columnId, value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.itemValuesRoot });
    },
  });
};
