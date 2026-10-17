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

// Every write hook below optionally takes the target hub's owner userId (construction-time,
// not per-call) — undefined means "my own hub". An org/system admin editing another user's
// Personal Hub passes that user's id so columns/values are created/updated under their
// account instead of the admin's own, matching the backend's admin-aware write endpoints.

export const useCreatePersonalColumn = (userId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePersonalColumnData) => ph.createPersonalColumn(data, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useUpdatePersonalColumn = (userId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePersonalColumnData }) => ph.updatePersonalColumn(id, patch, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useReorderPersonalColumns = (userId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: ReorderPersonalColumnItem[]) => ph.reorderPersonalColumns(order, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.columnsRoot });
    },
  });
};

export const useDeletePersonalColumn = (userId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ph.deletePersonalColumn(id, userId),
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

export const useUpdatePersonalItemValue = (userId?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, columnId, value }: { itemId: string; columnId: string; value: unknown }) =>
      ph.updatePersonalItemValue(itemId, columnId, value, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.personalHub.itemValuesRoot });
    },
  });
};

// ─── "Today" list ─────────────────────────────────────────────────────────────

export const usePersonalToday = (userId?: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.personalHub.today(userId),
    queryFn: () => ph.getPersonalToday(userId),
    enabled,
    staleTime: 60 * 1000,
    select: (res) => res.items,
  });

/**
 * Adds/removes an item on the hub owner's Today list. Optimistic — the ☀ and the Done checkbox
 * respond instantly; on failure the list is rolled back to what it was.
 */
export const useToggleToday = (userId?: string) => {
  const qc = useQueryClient();
  const key = queryKeys.personalHub.today(userId);
  return useMutation({
    mutationFn: ({ itemId, add }: { itemId: string; boardId: string; add: boolean }) =>
      add ? ph.addPersonalToday(itemId, userId) : ph.removePersonalToday(itemId, userId),
    onMutate: async ({ itemId, boardId, add }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ items: ph.PersonalTodayEntry[] }>(key);
      const items = previous?.items ?? [];
      const next = add
        ? (items.some((e) => e.itemId === itemId) ? items : [...items, { itemId, boardId, addedAt: new Date().toISOString() }])
        : items.filter((e) => e.itemId !== itemId);
      qc.setQueryData(key, { items: next });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (res) => qc.setQueryData(key, res),
  });
};
