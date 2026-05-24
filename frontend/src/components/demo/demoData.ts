import { ColumnType, UserRole } from '../../types';
import type { Board, Group, Item, Column, Workspace, User } from '../../types';

export const DEMO_ORG_ID = 'demo-org-id';
export const DEMO_USER_ID = 'demo-user-id';
export const NOW = new Date().toISOString();

export const DEMO_WORKSPACES: Workspace[] = [
  { id: 'ws-marketing', name: 'Marketing Team', orgId: DEMO_ORG_ID },
  { id: 'ws-engineering', name: 'Engineering', orgId: DEMO_ORG_ID },
];

export const DEMO_SELECTED_WORKSPACE: Workspace & { hasChatAccess?: boolean } = {
  id: 'ws-marketing',
  name: 'Marketing Team',
  orgId: DEMO_ORG_ID,
};

export const DEMO_USER: User = {
  id: DEMO_USER_ID,
  email: 'demo@logyx.app',
  name: 'Demo User',
  role: UserRole.ORGANIZATION_ADMIN,
  status: 'active',
  workspaces: DEMO_WORKSPACES.map(w => ({ id: w.id, name: w.name, orgId: w.orgId })),
  workspaceId: 'ws-marketing',
  workspaceName: 'Marketing Team',
};

export const DEMO_USERS: User[] = [
  DEMO_USER,
  { id: 'u-alice', email: 'alice@acme.com', name: 'Alice Johnson', role: UserRole.REGULAR_USER, status: 'active', workspaces: [] },
  { id: 'u-bob',   email: 'bob@acme.com',   name: 'Bob Smith',     role: UserRole.REGULAR_USER, status: 'active', workspaces: [] },
  { id: 'u-carol', email: 'carol@acme.com', name: 'Carol Lee',     role: UserRole.REGULAR_USER, status: 'active', workspaces: [] },
  { id: 'u-david', email: 'david@acme.com', name: 'David Kim',     role: UserRole.REGULAR_USER, status: 'active', workspaces: [] },
];

// ── Boards ─────────────────────────────────────────────────────────────────

export const DEMO_BOARDS: Board[] = [
  { id: 'board-campaigns', workspaceId: 'ws-marketing',   name: 'Campaign Tracker',  order: 0, createdBy: DEMO_USER_ID, createdAt: NOW, updatedAt: NOW },
  { id: 'board-content',   workspaceId: 'ws-marketing',   name: 'Content Calendar',  order: 1, createdBy: DEMO_USER_ID, createdAt: NOW, updatedAt: NOW },
  { id: 'board-bugs',      workspaceId: 'ws-engineering',  name: 'Bug Tracker',       order: 0, createdBy: DEMO_USER_ID, createdAt: NOW, updatedAt: NOW },
];

// ── Columns ────────────────────────────────────────────────────────────────

export const DEMO_COLUMNS: Column[] = [
  // Campaign Tracker
  {
    id: 'col-camp-status', boardId: 'board-campaigns', name: 'Status', type: ColumnType.STATUS, width: 140,
    settings: { options: [
      { id: 'not-started', label: 'Not Started', color: '#6b7280' },
      { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
      { id: 'done',        label: 'Done',        color: '#10b981' },
      { id: 'on-hold',     label: 'On Hold',     color: '#f59e0b' },
    ]} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-camp-owner', boardId: 'board-campaigns', name: 'Owner', type: ColumnType.TEXT, width: 150,
    settings: {} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-camp-due', boardId: 'board-campaigns', name: 'Due Date', type: ColumnType.DATE, width: 140,
    settings: { includeTime: false } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-camp-priority', boardId: 'board-campaigns', name: 'Priority', type: ColumnType.DROPDOWN, width: 120,
    settings: { options: ['High', 'Medium', 'Low'] } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-camp-budget', boardId: 'board-campaigns', name: 'Budget', type: ColumnType.NUMBER, width: 120,
    settings: { precision: 0, unit: '$', summary: 'sum' } as Column['settings'],
    summaryConfig: { calc: 'sum', unit: '$', unitAlign: 'left' as const },
    createdAt: NOW, updatedAt: NOW,
  },
  // Content Calendar
  {
    id: 'col-cont-status', boardId: 'board-content', name: 'Status', type: ColumnType.STATUS, width: 140,
    settings: { options: [
      { id: 'draft',     label: 'Draft',     color: '#6b7280' },
      { id: 'review',    label: 'Review',    color: '#8b5cf6' },
      { id: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
      { id: 'published', label: 'Published', color: '#10b981' },
    ]} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-cont-author', boardId: 'board-content', name: 'Author', type: ColumnType.TEXT, width: 150,
    settings: {} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-cont-date', boardId: 'board-content', name: 'Publish Date', type: ColumnType.DATE, width: 140,
    settings: { includeTime: false } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-cont-channel', boardId: 'board-content', name: 'Channel', type: ColumnType.DROPDOWN, width: 120,
    settings: { options: ['Blog', 'Social', 'Email', 'Video'] } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-cont-words', boardId: 'board-content', name: 'Word Count', type: ColumnType.NUMBER, width: 130,
    settings: { precision: 0, summary: 'sum' } as Column['settings'],
    summaryConfig: { calc: 'sum', unit: 'words', unitAlign: 'right' as const },
    createdAt: NOW, updatedAt: NOW,
  },
  // Bug Tracker
  {
    id: 'col-bug-status', boardId: 'board-bugs', name: 'Status', type: ColumnType.STATUS, width: 140,
    settings: { options: [
      { id: 'open',        label: 'Open',        color: '#ef4444' },
      { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
      { id: 'fixed',       label: 'Fixed',       color: '#10b981' },
      { id: 'closed',      label: 'Closed',      color: '#6b7280' },
    ]} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-bug-assignee', boardId: 'board-bugs', name: 'Assignee', type: ColumnType.TEXT, width: 150,
    settings: {} as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-bug-reported', boardId: 'board-bugs', name: 'Reported', type: ColumnType.DATE, width: 130,
    settings: { includeTime: false } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-bug-severity', boardId: 'board-bugs', name: 'Severity', type: ColumnType.DROPDOWN, width: 120,
    settings: { options: ['Critical', 'High', 'Medium', 'Low'] } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: 'col-bug-sprint', boardId: 'board-bugs', name: 'Sprint', type: ColumnType.NUMBER, width: 100,
    settings: { precision: 0 } as Column['settings'],
    createdAt: NOW, updatedAt: NOW,
  },
];

// ── Groups ─────────────────────────────────────────────────────────────────

export const DEMO_GROUPS: Group[] = [
  { id: 'camp-g1', boardId: 'board-campaigns', workspaceId: 'ws-marketing', name: 'Q1 Campaigns',  color: '#6366f1', order: 0, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'camp-g2', boardId: 'board-campaigns', workspaceId: 'ws-marketing', name: 'Q2 Campaigns',  color: '#10b981', order: 1, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'camp-g3', boardId: 'board-campaigns', workspaceId: 'ws-marketing', name: 'On Hold',       color: '#f59e0b', order: 2, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'cont-g1', boardId: 'board-content',   workspaceId: 'ws-marketing', name: 'January',       color: '#3b82f6', order: 0, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'cont-g2', boardId: 'board-content',   workspaceId: 'ws-marketing', name: 'February',      color: '#8b5cf6', order: 1, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'cont-g3', boardId: 'board-content',   workspaceId: 'ws-marketing', name: 'March',         color: '#14b8a6', order: 2, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'bug-g1',  boardId: 'board-bugs',      workspaceId: 'ws-engineering', name: 'Critical Bugs', color: '#ef4444', order: 0, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'bug-g2',  boardId: 'board-bugs',      workspaceId: 'ws-engineering', name: 'Normal Bugs',   color: '#eab308', order: 1, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
  { id: 'bug-g3',  boardId: 'board-bugs',      workspaceId: 'ws-engineering', name: 'Resolved',      color: '#10b981', order: 2, isCollapsed: false, isArchived: false, createdAt: NOW, updatedAt: NOW },
];

// ── Items ──────────────────────────────────────────────────────────────────

function item(id: string, boardId: string, groupId: string, workspaceId: string, name: string, order: number, values: Record<string, unknown>, status?: string, dueDate?: string): Item {
  return { id, boardId, groupId, workspaceId, name, order, createdBy: DEMO_USER_ID, isArchived: false, status, dueDate, assignees: [], values, chatMessageCount: 0, createdAt: NOW, updatedAt: NOW };
}

export const DEMO_ITEMS: Item[] = [
  // Campaign - Q1
  item('ci1', 'board-campaigns', 'camp-g1', 'ws-marketing', 'Email Newsletter Redesign', 0, { 'col-camp-status': 'in-progress', 'col-camp-owner': 'Alice Johnson', 'col-camp-due': '2025-03-15', 'col-camp-priority': 'High',   'col-camp-budget': 5000 }, 'in-progress', '2025-03-15'),
  item('ci2', 'board-campaigns', 'camp-g1', 'ws-marketing', 'Social Media Blitz',        1, { 'col-camp-status': 'done',        'col-camp-owner': 'Bob Smith',    'col-camp-due': '2025-03-01', 'col-camp-priority': 'Medium', 'col-camp-budget': 2000 }, 'done',        '2025-03-01'),
  item('ci3', 'board-campaigns', 'camp-g1', 'ws-marketing', 'Product Launch Video',      2, { 'col-camp-status': 'not-started', 'col-camp-owner': 'Carol Lee',    'col-camp-due': '2025-03-31', 'col-camp-priority': 'High',   'col-camp-budget': 8000 }, 'not-started', '2025-03-31'),
  // Campaign - Q2
  item('ci4', 'board-campaigns', 'camp-g2', 'ws-marketing', 'Summer Sale Campaign',      0, { 'col-camp-status': 'in-progress', 'col-camp-owner': 'Alice Johnson', 'col-camp-due': '2025-05-01', 'col-camp-priority': 'High',   'col-camp-budget': 6000 }, 'in-progress', '2025-05-01'),
  item('ci5', 'board-campaigns', 'camp-g2', 'ws-marketing', 'Brand Refresh',             1, { 'col-camp-status': 'not-started', 'col-camp-owner': 'David Kim',    'col-camp-due': '2025-06-15', 'col-camp-priority': 'Low',    'col-camp-budget': 12000 }, 'not-started', '2025-06-15'),
  item('ci6', 'board-campaigns', 'camp-g2', 'ws-marketing', 'Influencer Partnership',    2, { 'col-camp-status': 'not-started', 'col-camp-owner': 'Bob Smith',    'col-camp-due': '2025-04-30', 'col-camp-priority': 'Medium', 'col-camp-budget': 3000 }, 'not-started', '2025-04-30'),
  // Campaign - On Hold
  item('ci7', 'board-campaigns', 'camp-g3', 'ws-marketing', 'Trade Show Follow-up',      0, { 'col-camp-status': 'on-hold',     'col-camp-owner': 'Carol Lee',    'col-camp-due': '2025-02-28', 'col-camp-priority': 'Low',    'col-camp-budget': 1500 }, 'on-hold', '2025-02-28'),
  // Content - January
  item('ni1', 'board-content', 'cont-g1', 'ws-marketing', '2025 Marketing Trends',    0, { 'col-cont-status': 'published', 'col-cont-author': 'Alice Johnson', 'col-cont-date': '2025-01-10', 'col-cont-channel': 'Blog',   'col-cont-words': 1500 }, 'published', '2025-01-10'),
  item('ni2', 'board-content', 'cont-g1', 'ws-marketing', 'Product Feature Spotlight', 1, { 'col-cont-status': 'published', 'col-cont-author': 'Bob Smith',    'col-cont-date': '2025-01-15', 'col-cont-channel': 'Social', 'col-cont-words': 300 },  'published', '2025-01-15'),
  // Content - February
  item('ni3', 'board-content', 'cont-g2', 'ws-marketing', "Valentine's Campaign Post", 0, { 'col-cont-status': 'published', 'col-cont-author': 'Carol Lee',    'col-cont-date': '2025-02-14', 'col-cont-channel': 'Social', 'col-cont-words': 200 },  'published', '2025-02-14'),
  item('ni4', 'board-content', 'cont-g2', 'ws-marketing', 'Q1 Newsletter',             1, { 'col-cont-status': 'published', 'col-cont-author': 'Alice Johnson', 'col-cont-date': '2025-02-28', 'col-cont-channel': 'Email',  'col-cont-words': 800 },  'published', '2025-02-28'),
  // Content - March
  item('ni5', 'board-content', 'cont-g3', 'ws-marketing', 'Spring Collection Launch',  0, { 'col-cont-status': 'review',    'col-cont-author': 'Bob Smith',    'col-cont-date': '2025-03-05', 'col-cont-channel': 'Blog',   'col-cont-words': 1200 }, 'review',    '2025-03-05'),
  item('ni6', 'board-content', 'cont-g3', 'ws-marketing', 'Behind the Scenes Video',   1, { 'col-cont-status': 'draft',     'col-cont-author': 'David Kim',    'col-cont-date': '2025-03-20', 'col-cont-channel': 'Video',  'col-cont-words': 600 },  'draft',     '2025-03-20'),
  // Bug - Critical
  item('bi1', 'board-bugs', 'bug-g1', 'ws-engineering', 'Login page 500 error',              0, { 'col-bug-status': 'in-progress', 'col-bug-assignee': 'Alice Johnson', 'col-bug-reported': '2025-01-20', 'col-bug-severity': 'Critical', 'col-bug-sprint': 5 }, 'in-progress', '2025-01-20'),
  item('bi2', 'board-bugs', 'bug-g1', 'ws-engineering', 'Payment gateway timeout',           1, { 'col-bug-status': 'open',        'col-bug-assignee': 'Bob Smith',    'col-bug-reported': '2025-01-25', 'col-bug-severity': 'Critical', 'col-bug-sprint': 5 }, 'open',        '2025-01-25'),
  // Bug - Normal
  item('bi3', 'board-bugs', 'bug-g2', 'ws-engineering', 'Profile picture upload fails',      0, { 'col-bug-status': 'fixed',       'col-bug-assignee': 'Carol Lee',    'col-bug-reported': '2025-01-15', 'col-bug-severity': 'High',     'col-bug-sprint': 4 }, 'fixed', '2025-01-15'),
  item('bi4', 'board-bugs', 'bug-g2', 'ws-engineering', 'Search results pagination broken',  1, { 'col-bug-status': 'in-progress', 'col-bug-assignee': 'David Kim',    'col-bug-reported': '2025-01-22', 'col-bug-severity': 'Medium',   'col-bug-sprint': 5 }, 'in-progress', '2025-01-22'),
  item('bi5', 'board-bugs', 'bug-g2', 'ws-engineering', 'Email notifications delayed',       2, { 'col-bug-status': 'open',        'col-bug-assignee': 'Alice Johnson', 'col-bug-reported': '2025-01-28', 'col-bug-severity': 'Low',      'col-bug-sprint': 5 }, 'open', '2025-01-28'),
  // Bug - Resolved
  item('bi6', 'board-bugs', 'bug-g3', 'ws-engineering', 'Dashboard loading slow',            0, { 'col-bug-status': 'closed',      'col-bug-assignee': 'Bob Smith',    'col-bug-reported': '2025-01-10', 'col-bug-severity': 'High',     'col-bug-sprint': 4 }, 'closed', '2025-01-10'),
  item('bi7', 'board-bugs', 'bug-g3', 'ws-engineering', 'CSV export formatting',             1, { 'col-bug-status': 'closed',      'col-bug-assignee': 'Carol Lee',    'col-bug-reported': '2025-01-12', 'col-bug-severity': 'Medium',   'col-bug-sprint': 4 }, 'closed', '2025-01-12'),
];
