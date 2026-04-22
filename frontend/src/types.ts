export enum UserRole {
  REGULAR_USER = 'regular_user',
  WORKSPACE_ADMIN = 'workspace_admin',
  ORGANIZATION_ADMIN = 'org_admin',
  SYSTEM_ADMIN = 'system_admin',
}

export interface Workspace {
  id: string;
  name: string;
  orgId: string;
  organizationName?: string;
  isPersonal?: boolean;
  status?: 'active' | 'archived';
}

export interface OrganizationSettings {
  id: string;
  sidebarColor: string;
  enableSidebarGradient?: boolean;
  sidebarHueRotation?: number;
  sidebarGradientHeight?: number;
  sidebarGradientMaskOpacity?: number;
  appName: string;
  logoUrl: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  socialMedia?: {
      twitter?: string;
      linkedin?: string;
      facebook?: string;
      instagram?: string;
  };
  apiKey?: string;
  displayNameColor?: string;
  sidebarLinkColor?: string;
  logoCircle?: boolean;
  bridgeEnabled?: boolean;
  bridgeSecretKey?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
  updatedAt?: string | Date | any;
  updatedBy?: string;
}

export interface SystemSettings {
  id?: string;
  oneTimeTokensPerLesson: number;
  oneTimeGeneralTokens: number;
  subscriptionMonthlyLimit: number;
  globalSystemPrompt?: string;
}

export interface TutorialLink {
  enabled: boolean;
  videoUrl: string;
}

export interface TutorialSettings {
  theme?: TutorialLink;
  workspaces?: TutorialLink;
  users?: TutorialLink;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  dbRoles?: {
    systemAdmin?: boolean;
    organizationAdmin?: string[];
    workspaceAdmin?: string[];
  };
  status: 'pending' | 'active' | 'disabled' | 'pending_setup';
  workspaces: Pick<Workspace, 'id' | 'name' | 'orgId' | 'organizationName' | 'isPersonal'>[];
  profileImageUrl?: string;
  preferredLanguage?: string;
  hasPassword?: boolean;
  tokenUsage?: {
    used: number;
    limit: number | null;
  };
  workspaceId?: string;
  workspaceName?: string;
  allAcademies?: Workspace[];
}


export interface Part {
  text: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

export type ExtractedFactors = { [key: string]: string };

export interface PreApprovedUser {
  id: string;
  email: string;
  workspaceId: string;
  addedBy: string;
  createdAt: Date;
}

export interface TokenUsageData {
  [id: string]: {
    used: number;
    limit: number | null;
  };
}

// --- Pagination ---

export interface PaginatedResponse<T> {
    data: T[];
    cursor: string | null;
    hasMore: boolean;
    total?: number;
}

export type SystemPrompts = {
    chatSystemPrompt: string;
};
export type ThemeSettings = Pick<OrganizationSettings, 'sidebarColor' | 'appName' | 'logoUrl'>;

// =============================================================================
// PHASE 4 — WORK MANAGEMENT DATA MODEL
// =============================================================================

export enum ColumnType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  STATUS = 'status',
  PERSON = 'person',
  DROPDOWN = 'dropdown',
  CHECKBOX = 'checkbox',
  TAGS = 'tags',
  TIME = 'time',
  EMAIL = 'email',
  PHONE = 'phone',
  LOCATION = 'location',
  TIME_RANGE = 'time_range',
  SIMPLE_FORMULA = 'simple_formula',
}

// --- Column settings per type ---

export interface TextColumnSettings {
  maxLength?: number;
  multiline?: boolean;
}

export interface NumberColumnSettings {
  precision?: number;
  unit?: string;
  summary?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface DateColumnSettings {
  includeTime?: boolean;
}

export interface StatusOption {
  id: string;
  label: string;
  color: string;
}

export interface StatusColumnSettings {
  options: StatusOption[];
}

export interface PersonColumnSettings {
  multiple: boolean;
}

export interface DropdownOption {
  id: string;
  label: string;
}

export interface DropdownColumnSettings {
  options: DropdownOption[];
  multiple: boolean;
}

export interface TagsColumnSettings {
  allowCustom: boolean;
}

export interface SimpleFormulaColumnSettings {
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  fields: [string, string]; // exactly 2 columnIds
}

export type ColumnSettings =
  | TextColumnSettings
  | NumberColumnSettings
  | DateColumnSettings
  | StatusColumnSettings
  | PersonColumnSettings
  | DropdownColumnSettings
  | TagsColumnSettings
  | SimpleFormulaColumnSettings
  | Record<string, never>;

// --- Column definition ---

export interface Column {
  id: string;
  boardId: string;
  name: string;
  type: ColumnType;
  settings: ColumnSettings;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Column value types (stored inside Item.values) ---

export interface LocationValue {
  address: string;
}

export interface TimeRangeValue {
  start: Date | string;
  end: Date | string;
}

export type ColumnValueMap = Record<string, unknown>;

// --- Board ---

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Group ---

export interface Group {
  id: string;
  workspaceId: string;
  boardId: string;
  name: string;
  color?: string;
  order: number;
  isCollapsed?: boolean;
  isArchived?: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Item (flat, stored at workspace level) ---

export interface Item {
  id: string;
  workspaceId: string;
  boardId: string;
  groupId: string;
  name: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  // Indexed top-level fields (mirrored from values for querying/filtering)
  status?: string;
  assignees?: string[];
  dueDate?: Date | string;
  // Dynamic column values
  values: ColumnValueMap;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// =============================================================================
// PHASE 8 — DASHBOARD TYPES
// =============================================================================

export interface DashboardParams {
  workspaceId?: string;
  boardIds?: string[];
  assigneeId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface StatusDistributionEntry {
  statusId: string;
  label: string;
  color: string;
  count: number;
}

export interface WorkloadByPersonEntry {
  userId: string;
  name: string;
  profileImageUrl?: string;
  count: number;
}

export interface ItemsByBoardEntry {
  boardId: string;
  name: string;
  count: number;
}

export interface DashboardSummary {
  statusDistribution: StatusDistributionEntry[];
  overdue: { count: number; items: Item[] };
  workloadByPerson: WorkloadByPersonEntry[];
  itemsByBoard: ItemsByBoardEntry[];
  summary: {
    total: number;
    completed: number;
    completionRate: number;
    archived: number;
  };
  truncated: boolean;
}

// =============================================================================
// PHASE 9 — PERMISSIONS & NOTIFICATIONS
// =============================================================================

export enum BoardRole {
  VIEWER = 'viewer',
  EDITOR = 'editor',
  ADMIN  = 'admin',
}

export interface BoardMember {
  userId: string;
  boardId: string;
  workspaceId: string;
  role: BoardRole;
  addedBy: string;
  createdAt: Date | string;
  userName?: string;
  userEmail?: string;
  userProfileImageUrl?: string;
}

export type NotificationType = 'assignment' | 'mention';

export interface Notification {
  id: string;
  type: NotificationType;
  actorName: string;
  resourceName: string;
  boardName: string;
  boardId: string;
  resourceId: string;
  read: boolean;
  createdAt: Date | string;
}
