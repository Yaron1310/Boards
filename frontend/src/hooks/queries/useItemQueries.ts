import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateItemData, UpdateItemData, ListItemsParams, ReorderItemUpdate } from '@/services/workManagementService';

export const useItems = (params: ListItemsParams = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.items.list(params),
    queryFn: () => wm.listItems(params),
    enabled,
    staleTime: 60 * 1000,
  });

export const useItem = (id: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.items.one(id),
    queryFn: () => wm.getItem(id),
    enabled: enabled && !!id,
    staleTime: 60 * 1000,
  });

export const useCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateItemData) => wm.createItem(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemData }) => wm.updateItem(id, patch),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.items.one(updated.id), updated);
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useReorderItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: ReorderItemUpdate[]) => wm.reorderItems(updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useArchiveItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.archiveItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useRestoreItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.restoreItem(id),
    onSuccess: (restored) => {
      qc.setQueryData(queryKeys.items.one(restored.id), restored);
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteItem(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: queryKeys.items.one(id) });
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
};
