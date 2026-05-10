import { useQuery } from '@tanstack/react-query';
import { getDashboardSummary, getDashboardOverdue } from '@/services/workManagementService';
import type { DashboardPaginationParams } from '@/services/workManagementService';
import type { DashboardParams } from '@/types';
import { queryKeys } from './queryKeys';

export const useDashboardSummary = (params: DashboardParams = {}) =>
  useQuery({
    queryKey: queryKeys.dashboard.summary(params),
    queryFn: () => getDashboardSummary(params),
    staleTime: Infinity, // useOrgSnapshot invalidates this via onSnapshot on boardVersions
  });

export const useDashboardOverdue = (params: DashboardParams & DashboardPaginationParams = {}) =>
  useQuery({
    queryKey: queryKeys.dashboard.overdue(params),
    queryFn: () => getDashboardOverdue(params),
  });
