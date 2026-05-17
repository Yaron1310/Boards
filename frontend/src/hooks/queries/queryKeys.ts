import type { ListItemsParams, DashboardPaginationParams } from '@/services/workManagementService';
import type { DashboardParams } from '@/types';

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
    archived: (boardId: string) => ['groups', boardId, 'archived'] as const,
  },
  items: {
    list: (params: ListItemsParams) => ['items', params] as const,
    one: (id: string) => ['items', id] as const,
    group: (groupId: string, cursor: string | undefined, limit: number) =>
      ['items', 'group', groupId, cursor ?? '', limit] as const,
  },
  columns: {
    board: (boardId: string) => ['columns', { boardId }] as const,
    one: (boardId: string, id: string) => ['columns', { boardId }, id] as const,
  },
  dashboard: {
    summary: (params: DashboardParams) => ['dashboard', 'summary', params] as const,
    overdue: (params: DashboardParams & DashboardPaginationParams) => ['dashboard', 'overdue', params] as const,
  },
  boardMembers: {
    all: (boardId: string) => ['boardMembers', boardId] as const,
  },
  customDashboards: {
    all: ['customDashboards'] as const,
    data: (id: string) => ['customDashboards', id, 'data'] as const,
  },
  chat: {
    messages: (itemId: string) => ['chat', itemId, 'messages'] as const,
  },
};
