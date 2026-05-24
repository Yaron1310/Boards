export type DemoColumnType = 'text' | 'number' | 'date' | 'status' | 'dropdown' | 'checkbox';

export interface DemoStatusOption {
  id: string;
  label: string;
  color: string;
}

export interface DemoColumn {
  id: string;
  boardId: string;
  name: string;
  type: DemoColumnType;
  width: number;
  statusOptions?: DemoStatusOption[];
  dropdownOptions?: string[];
  unit?: string;
}

export interface DemoBoard {
  id: string;
  name: string;
  workspaceId: string;
}

export interface DemoWorkspace {
  id: string;
  name: string;
}

export interface DemoGroup {
  id: string;
  boardId: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  order: number;
}

export interface DemoItem {
  id: string;
  boardId: string;
  groupId: string;
  name: string;
  order: number;
  values: Record<string, unknown>;
}

export interface DemoState {
  workspaces: DemoWorkspace[];
  boards: DemoBoard[];
  columns: DemoColumn[];
  groups: DemoGroup[];
  items: DemoItem[];
  activeBoardId: string;
  searchText: string;
  sortConfig: { columnId: string; direction: 'asc' | 'desc' } | null;
}

const WS_MARKETING = 'ws-marketing';
const WS_ENGINEERING = 'ws-engineering';
const CAMPAIGN_BOARD_ID = 'board-campaigns';
const CONTENT_BOARD_ID = 'board-content';
const BUG_BOARD_ID = 'board-bugs';

export function createInitialDemoState(): DemoState {
  return {
    workspaces: [
      { id: WS_MARKETING, name: 'Marketing Team' },
      { id: WS_ENGINEERING, name: 'Engineering' },
    ],
    boards: [
      { id: CAMPAIGN_BOARD_ID, name: 'Campaign Tracker', workspaceId: WS_MARKETING },
      { id: CONTENT_BOARD_ID, name: 'Content Calendar', workspaceId: WS_MARKETING },
      { id: BUG_BOARD_ID, name: 'Bug Tracker', workspaceId: WS_ENGINEERING },
    ],
    columns: [
      // Campaign Tracker
      {
        id: 'camp-status', boardId: CAMPAIGN_BOARD_ID, name: 'Status', type: 'status', width: 140,
        statusOptions: [
          { id: 'not-started', label: 'Not Started', color: '#6b7280' },
          { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
          { id: 'done', label: 'Done', color: '#10b981' },
          { id: 'on-hold', label: 'On Hold', color: '#f59e0b' },
        ],
      },
      { id: 'camp-owner', boardId: CAMPAIGN_BOARD_ID, name: 'Owner', type: 'text', width: 140 },
      { id: 'camp-due', boardId: CAMPAIGN_BOARD_ID, name: 'Due Date', type: 'date', width: 140 },
      {
        id: 'camp-priority', boardId: CAMPAIGN_BOARD_ID, name: 'Priority', type: 'dropdown', width: 120,
        dropdownOptions: ['High', 'Medium', 'Low'],
      },
      { id: 'camp-budget', boardId: CAMPAIGN_BOARD_ID, name: 'Budget', type: 'number', width: 120, unit: '$' },

      // Content Calendar
      {
        id: 'cont-status', boardId: CONTENT_BOARD_ID, name: 'Status', type: 'status', width: 140,
        statusOptions: [
          { id: 'draft', label: 'Draft', color: '#6b7280' },
          { id: 'review', label: 'Review', color: '#8b5cf6' },
          { id: 'scheduled', label: 'Scheduled', color: '#f59e0b' },
          { id: 'published', label: 'Published', color: '#10b981' },
        ],
      },
      { id: 'cont-author', boardId: CONTENT_BOARD_ID, name: 'Author', type: 'text', width: 140 },
      { id: 'cont-date', boardId: CONTENT_BOARD_ID, name: 'Publish Date', type: 'date', width: 140 },
      {
        id: 'cont-channel', boardId: CONTENT_BOARD_ID, name: 'Channel', type: 'dropdown', width: 120,
        dropdownOptions: ['Blog', 'Social', 'Email', 'Video'],
      },
      { id: 'cont-words', boardId: CONTENT_BOARD_ID, name: 'Word Count', type: 'number', width: 120 },

      // Bug Tracker
      {
        id: 'bug-status', boardId: BUG_BOARD_ID, name: 'Status', type: 'status', width: 140,
        statusOptions: [
          { id: 'open', label: 'Open', color: '#ef4444' },
          { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
          { id: 'fixed', label: 'Fixed', color: '#10b981' },
          { id: 'closed', label: 'Closed', color: '#6b7280' },
        ],
      },
      { id: 'bug-assignee', boardId: BUG_BOARD_ID, name: 'Assignee', type: 'text', width: 140 },
      { id: 'bug-reported', boardId: BUG_BOARD_ID, name: 'Reported', type: 'date', width: 130 },
      {
        id: 'bug-severity', boardId: BUG_BOARD_ID, name: 'Severity', type: 'dropdown', width: 120,
        dropdownOptions: ['Critical', 'High', 'Medium', 'Low'],
      },
      { id: 'bug-sprint', boardId: BUG_BOARD_ID, name: 'Sprint', type: 'number', width: 100 },
    ],
    groups: [
      { id: 'camp-g1', boardId: CAMPAIGN_BOARD_ID, name: 'Q1 Campaigns', color: '#6366f1', isCollapsed: false, order: 0 },
      { id: 'camp-g2', boardId: CAMPAIGN_BOARD_ID, name: 'Q2 Campaigns', color: '#10b981', isCollapsed: false, order: 1 },
      { id: 'camp-g3', boardId: CAMPAIGN_BOARD_ID, name: 'On Hold', color: '#f59e0b', isCollapsed: false, order: 2 },
      { id: 'cont-g1', boardId: CONTENT_BOARD_ID, name: 'January', color: '#3b82f6', isCollapsed: false, order: 0 },
      { id: 'cont-g2', boardId: CONTENT_BOARD_ID, name: 'February', color: '#8b5cf6', isCollapsed: false, order: 1 },
      { id: 'cont-g3', boardId: CONTENT_BOARD_ID, name: 'March', color: '#14b8a6', isCollapsed: false, order: 2 },
      { id: 'bug-g1', boardId: BUG_BOARD_ID, name: 'Critical Bugs', color: '#ef4444', isCollapsed: false, order: 0 },
      { id: 'bug-g2', boardId: BUG_BOARD_ID, name: 'Normal Bugs', color: '#eab308', isCollapsed: false, order: 1 },
      { id: 'bug-g3', boardId: BUG_BOARD_ID, name: 'Resolved', color: '#10b981', isCollapsed: false, order: 2 },
    ],
    items: [
      // Campaign - Q1
      { id: 'ci1', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g1', name: 'Email Newsletter Redesign', order: 0, values: { 'camp-status': 'in-progress', 'camp-owner': 'Alice Johnson', 'camp-due': '2025-03-15', 'camp-priority': 'High', 'camp-budget': 5000 } },
      { id: 'ci2', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g1', name: 'Social Media Blitz', order: 1, values: { 'camp-status': 'done', 'camp-owner': 'Bob Smith', 'camp-due': '2025-03-01', 'camp-priority': 'Medium', 'camp-budget': 2000 } },
      { id: 'ci3', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g1', name: 'Product Launch Video', order: 2, values: { 'camp-status': 'not-started', 'camp-owner': 'Carol Lee', 'camp-due': '2025-03-31', 'camp-priority': 'High', 'camp-budget': 8000 } },
      // Campaign - Q2
      { id: 'ci4', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g2', name: 'Summer Sale Campaign', order: 0, values: { 'camp-status': 'in-progress', 'camp-owner': 'Alice Johnson', 'camp-due': '2025-05-01', 'camp-priority': 'High', 'camp-budget': 6000 } },
      { id: 'ci5', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g2', name: 'Brand Refresh', order: 1, values: { 'camp-status': 'not-started', 'camp-owner': 'David Kim', 'camp-due': '2025-06-15', 'camp-priority': 'Low', 'camp-budget': 12000 } },
      { id: 'ci6', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g2', name: 'Influencer Partnership', order: 2, values: { 'camp-status': 'not-started', 'camp-owner': 'Bob Smith', 'camp-due': '2025-04-30', 'camp-priority': 'Medium', 'camp-budget': 3000 } },
      // Campaign - On Hold
      { id: 'ci7', boardId: CAMPAIGN_BOARD_ID, groupId: 'camp-g3', name: 'Trade Show Follow-up', order: 0, values: { 'camp-status': 'on-hold', 'camp-owner': 'Carol Lee', 'camp-due': '2025-02-28', 'camp-priority': 'Low', 'camp-budget': 1500 } },
      // Content - January
      { id: 'ni1', boardId: CONTENT_BOARD_ID, groupId: 'cont-g1', name: '2025 Marketing Trends', order: 0, values: { 'cont-status': 'published', 'cont-author': 'Alice Johnson', 'cont-date': '2025-01-10', 'cont-channel': 'Blog', 'cont-words': 1500 } },
      { id: 'ni2', boardId: CONTENT_BOARD_ID, groupId: 'cont-g1', name: 'Product Feature Spotlight', order: 1, values: { 'cont-status': 'published', 'cont-author': 'Bob Smith', 'cont-date': '2025-01-15', 'cont-channel': 'Social', 'cont-words': 300 } },
      // Content - February
      { id: 'ni3', boardId: CONTENT_BOARD_ID, groupId: 'cont-g2', name: "Valentine's Campaign Post", order: 0, values: { 'cont-status': 'published', 'cont-author': 'Carol Lee', 'cont-date': '2025-02-14', 'cont-channel': 'Social', 'cont-words': 200 } },
      { id: 'ni4', boardId: CONTENT_BOARD_ID, groupId: 'cont-g2', name: 'Q1 Newsletter', order: 1, values: { 'cont-status': 'published', 'cont-author': 'Alice Johnson', 'cont-date': '2025-02-28', 'cont-channel': 'Email', 'cont-words': 800 } },
      // Content - March
      { id: 'ni5', boardId: CONTENT_BOARD_ID, groupId: 'cont-g3', name: 'Spring Collection Launch', order: 0, values: { 'cont-status': 'review', 'cont-author': 'Bob Smith', 'cont-date': '2025-03-05', 'cont-channel': 'Blog', 'cont-words': 1200 } },
      { id: 'ni6', boardId: CONTENT_BOARD_ID, groupId: 'cont-g3', name: 'Behind the Scenes Video', order: 1, values: { 'cont-status': 'draft', 'cont-author': 'David Kim', 'cont-date': '2025-03-20', 'cont-channel': 'Video', 'cont-words': 600 } },
      // Bug - Critical
      { id: 'bi1', boardId: BUG_BOARD_ID, groupId: 'bug-g1', name: 'Login page 500 error', order: 0, values: { 'bug-status': 'in-progress', 'bug-assignee': 'Alice Johnson', 'bug-reported': '2025-01-20', 'bug-severity': 'Critical', 'bug-sprint': 5 } },
      { id: 'bi2', boardId: BUG_BOARD_ID, groupId: 'bug-g1', name: 'Payment gateway timeout', order: 1, values: { 'bug-status': 'open', 'bug-assignee': 'Bob Smith', 'bug-reported': '2025-01-25', 'bug-severity': 'Critical', 'bug-sprint': 5 } },
      // Bug - Normal
      { id: 'bi3', boardId: BUG_BOARD_ID, groupId: 'bug-g2', name: 'Profile picture upload fails', order: 0, values: { 'bug-status': 'fixed', 'bug-assignee': 'Carol Lee', 'bug-reported': '2025-01-15', 'bug-severity': 'High', 'bug-sprint': 4 } },
      { id: 'bi4', boardId: BUG_BOARD_ID, groupId: 'bug-g2', name: 'Search results pagination broken', order: 1, values: { 'bug-status': 'in-progress', 'bug-assignee': 'David Kim', 'bug-reported': '2025-01-22', 'bug-severity': 'Medium', 'bug-sprint': 5 } },
      { id: 'bi5', boardId: BUG_BOARD_ID, groupId: 'bug-g2', name: 'Email notifications delayed', order: 2, values: { 'bug-status': 'open', 'bug-assignee': 'Alice Johnson', 'bug-reported': '2025-01-28', 'bug-severity': 'Low', 'bug-sprint': 5 } },
      // Bug - Resolved
      { id: 'bi6', boardId: BUG_BOARD_ID, groupId: 'bug-g3', name: 'Dashboard loading slow', order: 0, values: { 'bug-status': 'closed', 'bug-assignee': 'Bob Smith', 'bug-reported': '2025-01-10', 'bug-severity': 'High', 'bug-sprint': 4 } },
      { id: 'bi7', boardId: BUG_BOARD_ID, groupId: 'bug-g3', name: 'CSV export formatting', order: 1, values: { 'bug-status': 'closed', 'bug-assignee': 'Carol Lee', 'bug-reported': '2025-01-12', 'bug-severity': 'Medium', 'bug-sprint': 4 } },
    ],
    activeBoardId: CAMPAIGN_BOARD_ID,
    searchText: '',
    sortConfig: null,
  };
}
