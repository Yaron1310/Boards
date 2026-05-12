import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateItemData, UpdateItemData, ListItemsParams, ReorderItemUpdate } from '@/services/workManagementService';
import type { Item, PaginatedResponse } from '@/types';

function mergeItemPatch(item: Item, patch: UpdateItemData): Item {
  return {
    ...item,
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
    ...(patch.assignees !== undefined && { assignees: patch.assignees }),
    ...(patch.dependencies !== undefined && { dependencies: patch.dependencies }),
    ...(patch.values !== undefined && { values: { ...item.values, ...patch.values } }),
  };
}

export const useItems = <TSelected = PaginatedResponse<Item>>(
  params: ListItemsParams = {},
  enabled = true,
  select?: (data: PaginatedResponse<Item>) => TSelected,
) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.items.list(params),
    queryFn: async () => {
      const result = await wm.listItems(params);
      result.data.forEach((item) => {
        qc.setQueryData(queryKeys.items.one(item.id), item);
      });
      return result;
    },
    enabled,
    staleTime: 60 * 1000,
    select,
  });
};

export const useGroupItems = (
  groupId: string,
  cursor: string | undefined,
  limit: number,
  enabled = true,
) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.items.group(groupId, cursor, limit),
    queryFn: async () => {
      const result = await wm.listItems({ groupId, cursor, limit });
      result.data.forEach((item) => {
        qc.setQueryData(queryKeys.items.one(item.id), item);
      });
      return result;
    },
    enabled: enabled && !!groupId,
    staleTime: 60 * 1000,
  });
};

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
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['items', 'group', variables.groupId] });
    },
  });
};

export const useUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemData }) => wm.updateItem(id, patch),

    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['items'] });

      type CacheEntry = { key: readonly unknown[]; value: unknown };
      const snapshots: CacheEntry[] = [];

      for (const [key, value] of qc.getQueriesData<PaginatedResponse<Item> | Item>({ queryKey: ['items'] })) {
        if (!value) continue;
        snapshots.push({ key, value });

        if ('data' in value && Array.isArray((value as PaginatedResponse<Item>).data)) {
          const list = value as PaginatedResponse<Item>;
          qc.setQueryData(key, {
            ...list,
            data: list.data.map((item) => item.id === id ? mergeItemPatch(item, patch) : item),
          });
        } else if ((value as Item).id === id) {
          qc.setQueryData(key, mergeItemPatch(value as Item, patch));
        }
      }

      return { snapshots };
    },

    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(({ key, value }) => qc.setQueryData(key, value));
    },

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
