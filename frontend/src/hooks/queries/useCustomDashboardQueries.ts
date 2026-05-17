import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as wm from '@/services/workManagementService';
import type { CreateCustomDashboardData, UpdateCustomDashboardData } from '@/services/workManagementService';

export const useCustomDashboards = () =>
  useQuery({
    queryKey: queryKeys.customDashboards.all,
    queryFn: wm.listCustomDashboards,
    staleTime: Infinity,
  });

export const useCustomDashboardData = (id: string) =>
  useQuery({
    queryKey: queryKeys.customDashboards.data(id),
    queryFn: () => wm.getCustomDashboardData(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
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
