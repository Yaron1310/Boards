export const queryKeys = {
  workspaces: {
    all: ['workspaces'] as const,
  },
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
};
