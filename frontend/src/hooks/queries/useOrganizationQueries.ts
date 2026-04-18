import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useWorkspacesQuery = (filterType?: 'corporate' | 'individual' | 'all', enabled = true) => {
  return useQuery({
    queryKey: queryKeys.workspaces.filtered(filterType),
    queryFn: () => apiService.getWorkspaces(filterType),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedWorkspacesQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.workspaces.archived,
    queryFn: () => apiService.getArchivedWorkspaces(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
