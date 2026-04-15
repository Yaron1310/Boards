export const queryKeys = {
  academies: {
    all: ['academies'] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    filtered: (filterType?: string) => ['organizations', { filterType }] as const,
    archived: ['organizations', 'archived'] as const,
  },
  users: {
    all: ['users'] as const,
    preApproved: ['users', 'preApproved'] as const,
  },
  settings: {
    academy: ['settings', 'academy'] as const,
    system: ['settings', 'system'] as const,
    tutorial: ['settings', 'tutorial'] as const,
  },
};
