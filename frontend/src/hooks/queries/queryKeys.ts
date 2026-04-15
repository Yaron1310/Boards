export const queryKeys = {
  organizations: {
    all: ['organizations'] as const,
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
    organization: ['settings', 'organization'] as const,
    system: ['settings', 'system'] as const,
    tutorial: ['settings', 'tutorial'] as const,
  },
};
