import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import * as apiService from '@/services/geminiService';

export const useOrganizationsQuery = (filterType?: 'corporate' | 'individual' | 'all', enabled = true) => {
  return useQuery({
    queryKey: queryKeys.workspaces.filtered(filterType),
    queryFn: () => apiService.getOrganizations(filterType),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};

export const useArchivedOrganizationsQuery = (enabled = false) => {
  return useQuery({
    queryKey: queryKeys.workspaces.archived,
    queryFn: () => apiService.getArchivedOrganizations(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
