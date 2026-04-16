import type { ListItemsParams } from '@/services/workManagementService';

export const queryKeys = {
  workspaces: {
    all: ['workspaces'] as const,
    filtered: (filterType?: string) => ['workspaces', { filterType }] as const,
    archived: ['workspaces', 'archived'] as const,
  },
  users: {
    all: ['users'] as const,
    preApproved: ['users', 'preApproved'] as const,
  },
  settings: {
    workspace: ['settings', 'workspace'] as const,
    system: ['settings', 'system'] as const,
    tutorial: ['settings', 'tutorial'] as const,
  },
  boards: {
    all: (workspaceId?: string, includeArchived = false) =>
      ['boards', { workspaceId, includeArchived }] as const,
    one: (id: string) => ['boards', id] as const,
  },
  groups: {
    all: (boardId: string) => ['groups', boardId] as const,
  },
  items: {
    list: (params: ListItemsParams) => ['items', params] as const,
    one: (id: string) => ['items', id] as const,
  },
  columns: {
    all: ['columns'] as const,
    one: (id: string) => ['columns', id] as const,
  },
};
