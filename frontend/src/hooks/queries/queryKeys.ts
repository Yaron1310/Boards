export const queryKeys = {
  academies: {
    all: ['academies'] as const,
  },
  organizations: {
    all: ['organizations'] as const,
    filtered: (filterType?: string) => ['organizations', { filterType }] as const,
    archived: ['organizations', 'archived'] as const,
  },
  plans: {
    all: ['plans'] as const,
    archived: ['plans', 'archived'] as const,
  },
  users: {
    all: ['users'] as const,
    preApproved: ['users', 'preApproved'] as const,
  },
  conversations: {
    all: ['conversations'] as const,
  },
  personas: {
    accessible: ['personas', 'accessible'] as const,
    admin: ['personas', 'admin'] as const,
    archived: ['personas', 'archived'] as const,
  },
  courses: {
    all: ['courses'] as const,
    archived: ['courses', 'archived'] as const,
    detail: (id: string) => ['courses', id] as const,
  },
  progress: {
    my: ['progress', 'my'] as const,
    organization: ['progress', 'organization'] as const,
  },
  questionnaires: {
    published: ['questionnaires', 'published'] as const,
    admin: ['questionnaires', 'admin'] as const,
    archived: ['questionnaires', 'archived'] as const,
    myResults: ['questionnaires', 'myResults'] as const,
  },
  insights: {
    personal: ['insights', 'personal'] as const,
  },
  settings: {
    academy: ['settings', 'academy'] as const,
    system: ['settings', 'system'] as const,
    tutorial: ['settings', 'tutorial'] as const,
  },
  analytics: {
    userToken: (month?: number, year?: number) => ['analytics', 'userToken', { month, year }] as const,
    orgToken: (month?: number, year?: number) => ['analytics', 'orgToken', { month, year }] as const,
    academyToken: (month?: number, year?: number) => ['analytics', 'academyToken', { month, year }] as const,
  },
  billing: {
    currentCycle: ['billing', 'currentCycle'] as const,
  },
};
