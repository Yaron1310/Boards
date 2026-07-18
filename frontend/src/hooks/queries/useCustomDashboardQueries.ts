import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateCustomDashboardData, UpdateCustomDashboardData } from '@/services/workManagementService';
import type { CustomDashboard } from '@/types';

/** Dashboards that surface on a given board's dashboard view (a widget references this board). */
export const selectBoardDashboards = (dashboards: CustomDashboard[] | undefined, boardId: string): CustomDashboard[] => {
  if (!Array.isArray(dashboards)) return [];
  return dashboards.filter((d) => {
    if (d.config.type === 'metric') return (d.config.metrics ?? []).some((m) => m.boardId === boardId);
    if (d.config.type === 'timeseries') {
      const cfg = d.config;
      return cfg.boardId === boardId || (cfg.series ?? []).some((s) => s.boardId === boardId);
    }
    return (d.config as { boardId: string }).boardId === boardId;
  });
};

export const useCustomDashboards = (includeArchived = false, ownerUserId?: string) =>
  useQuery({
    queryKey: [...queryKeys.customDashboards.all, { includeArchived, ownerUserId: ownerUserId ?? null }],
    queryFn: () => wm.listCustomDashboards(includeArchived, ownerUserId),
    staleTime: 0,
  });

export const useCustomDashboardData = (id: string, dateFrom?: string, dateTo?: string) =>
  useQuery({
    queryKey: queryKeys.customDashboards.data(id, dateFrom, dateTo),
    queryFn: () => wm.getCustomDashboardData(id, dateFrom, dateTo),
    enabled: !!id,
    staleTime: 0,
  });

export const useCreateCustomDashboard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCustomDashboardData) => wm.createCustomDashboard(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.all });
    },
  });
};

export const useUpdateCustomDashboard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCustomDashboardData }) =>
      wm.updateCustomDashboard(id, patch),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.all });
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.data(updated.id) });
    },
  });
};

export const useDeleteCustomDashboard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.deleteCustomDashboard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.all });
    },
  });
};

export const useArchiveCustomDashboard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.archiveCustomDashboard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.all });
    },
  });
};

export const useRestoreCustomDashboard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => wm.restoreCustomDashboard(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customDashboards.all });
    },
  });
};
