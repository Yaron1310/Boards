
import admin from 'firebase-admin';

// --- HIERARCHY & TENANCY ---

export interface DBOrganization {
  id: string;
  name: string;
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBWorkspace {
  id: string;
  name: string;
  orgId: string;
  color?: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt?: admin.firestore.Timestamp | Date | any;
  isPersonal?: boolean;
  status?: 'active' | 'archived';
}

export interface DBOrganizationSettings {
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
  updatedAt: admin.firestore.Timestamp | Date | any;
  displayNameColor?: string;
  sidebarLinkColor?: string;
  logoCircle?: boolean;
}

export interface DBSystemSettings {
  id?: string;
}

export interface DBTutorialSettings {
  id?: string;
}

export enum UserRole {
  REGULAR_USER = 'regular_user',
  WORKSPACE_ADMIN = 'workspace_admin',
  ORGANIZATION_ADMIN = 'org_admin',
  SYSTEM_ADMIN = 'system_admin',
}

export interface DBUser {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  profileImageUrl?: string;
  googleId?: string;
  microsoftId?: string;
  status: 'pending' | 'active' | 'disabled' | 'pending_setup';
  emailVerified?: boolean;
  createdAt: admin.firestore.Timestamp | Date | any;
  preferredLanguage?: string;
  passwordResetId?: string;
  failedLoginAttempts?: number;
  lockoutUntil?: admin.firestore.Timestamp | Date | null | any;
  primaryOrganizationId?: string;
  defaultWorkspaceId?: string;
  preferences?: {
    darkContrast?: boolean;
  };
}

export interface DBMembership {
  id: string;
  userId: string;
  entityId: string;
  entityType: 'workspace' | 'workspace';
  role: UserRole;
  orgId: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  // Denormalized user fields for list views
  userName?: string;
  userEmail?: string;
  userProfileImageUrl?: string;
  userStatus?: string;
  userCreatedAt?: admin.firestore.Timestamp | Date | any;
  userHasPassword?: boolean;
}

export interface DBPreapprovedUser {
  id: string;
  email: string;
  workspaceId: string;
  orgId: string;
  addedBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBUserAccessStatus {
  id: string;
  workspaceId: string;
  hasAccess: boolean;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- JWT PAYLOADS ---

export interface JwtUserPayload {
  id: string;
  role: UserRole;
  selectedWorkspaceId: string;
  orgId: string;
}

export interface JwtMultiOrgPayload {
  id: string;
  action: 'select-workspace' | 'workspace-setup';
}

export interface JwtApprovalPayload {
  userId: string;
  action: 'approve_user';
}

export interface JwtVerificationPayload {
  userId: string;
  action: 'verify_email' | 'verify_organization_admin';
}

export interface JwtPasswordResetPayload {
  userId: string;
  resetId: string;
  action: 'reset_password';
}

// --- PAGINATION ---

export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

declare global {
  namespace Express {
    interface User extends Partial<DBUser>, Partial<JwtUserPayload>, Partial<JwtMultiOrgPayload> {}
    interface Request {
      orgId?: string;
    }
  }
}

// --- PHASE 4: WORK MANAGEMENT DATA MODEL ---

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
  defaultFormula: string; // e.g. "{Price} * {Qty}" — evaluated client-side
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
  | Record<string, never>; // for types with no settings (checkbox, email, phone, location, time, time_range)

export interface DBColumn {
  id: string;
  boardId: string;
  name: string;
  type: ColumnType;
  settings: ColumnSettings;
  summaryConfig?: {
    calc: string;
    unit: string;
    unitAlign: 'left' | 'right';
  };
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- Column value types (stored inside Item.values) ---

export interface LocationValue {
  address: string;
}

export interface TimeRangeValue {
  start: admin.firestore.Timestamp | Date | any;
  end: admin.firestore.Timestamp | Date | any;
  durationDays?: number;
}

// --- Cell Dependencies ---

export interface TimeRangeDependency {
  id: string;
  sourceItemId: string;
  sourceColumnId: string;
  targetItemId: string;
  targetColumnId: string;
  offsetDays: number;
}

export interface DependencyRule {
  id: string;
  sourceColumnId: string;
  targetColumnId: string;
  offsetDays: number;
}

// The dynamic map stored in an Item document
export type ColumnValueMap = Record<string, unknown>;

// --- Board ---

export interface DBBoard {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  dependencyRules?: DependencyRule[];
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- Group ---

export interface DBGroup {
  id: string;
  workspaceId: string;
  boardId: string;
  name: string;
  color?: string;
  order: number;
  isCollapsed?: boolean;
  isArchived?: boolean;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- Item (flat, stored at workspace level) ---

export interface DBItem {
  id: string;
  workspaceId: string;
  boardId: string;
  groupId: string;
  name: string;
  order: number;
  createdBy: string;
  isArchived?: boolean;
  // Indexed top-level fields (mirrored from values for Firestore querying)
  status?: string;          // mirrors values[statusColumnId]
  assignees?: string[];     // mirrors values[personColumnId] — userIds
  dueDate?: admin.firestore.Timestamp | Date | any; // mirrors values[dateColumnId]
  dependencies?: TimeRangeDependency[];
  // Chat denormalized counters (updated on each new chat message)
  chatMessageCount?: number;
  chatLastMessageAt?: admin.firestore.Timestamp | Date | any;
  // Per-user seen counts for unread badge: { [userId]: seenCount }
  chatSeenBy?: Record<string, number>;
  // Dynamic column values
  values: ColumnValueMap;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- Chat Message ---

export interface DBChatMessage {
  id: string;
  itemId: string;
  authorId: string;
  authorName: string;
  authorProfileImageUrl?: string;
  text: string;
  attachments?: DBChatAttachment[];
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBChatAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

// --- AUDIT LOGGING ---

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'ANOMALY';
export type AuditResourceType =
  | 'user'
  | 'workspace'
  | 'board'
  | 'group'
  | 'item'
  | 'column';

export interface DBAuditLog {
  id: string;
  actorUserId: string;
  actorRole: UserRole;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  workspaceId?: string;
  orgId?: string;
  changes?: { before: unknown; after: unknown };
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  timestamp: admin.firestore.Timestamp | Date | any;
  expiresAt: admin.firestore.Timestamp | Date | any;
}

// --- PHASE 8: DASHBOARD ---

export interface DashboardStatusDistribution {
  statusId: string;
  label: string;
  color: string;
  count: number;
}

export interface DashboardWorkloadPerson {
  userId: string;
  name: string;
  profileImageUrl?: string;
  count: number;
}

export interface DashboardBoardCount {
  boardId: string;
  name: string;
  count: number;
}

export interface DashboardSummaryStats {
  total: number;
  completed: number;
  completionRate: number;
  archived: number;
}

export interface DashboardSummaryResponse {
  statusDistribution: DashboardStatusDistribution[];
  overdue: { count: number; items: DBItem[] };
  workloadByPerson: DashboardWorkloadPerson[];
  itemsByBoard: DashboardBoardCount[];
  summary: DashboardSummaryStats;
  truncated: boolean;
}

export interface DBEmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
  updatedAt: admin.firestore.Timestamp | Date | any;
  updatedBy?: string;
}

// --- WEBHOOKS ---

export interface DBWebhook {
  id: string;
  orgId: string;
  workspaceId: string;
  boardId: string;
  groupId: string;
  tokenHash: string;
  insertPosition: 'top' | 'bottom';
  allowedOrigins: string[];
  status: 'active' | 'revoked';
  createdBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt: admin.firestore.Timestamp | Date | any;
  lastUsedAt?: admin.firestore.Timestamp | Date | any;
  useCount: number;
  /** Position-based column mapping. position is 1-based (field 1 = first field in body). */
  fieldMap: Array<{ position: number; columnId: string }>;
  /** Which 1-based field position provides the item name. null = use body.name key instead. */
  nameFieldPosition: number | null;
}

// --- PHASE 9: PERMISSIONS & NOTIFICATIONS ---

export enum BoardRole {
  VIEWER = 'viewer',
  EDITOR = 'editor',
  ADMIN  = 'admin',
}

export interface DBBoardMember {
  userId: string;
  boardId: string;
  workspaceId: string;
  role: BoardRole;
  addedBy: string;
  createdAt: admin.firestore.Timestamp;
  // Denormalized user info (written on add)
  userName?: string;
  userEmail?: string;
  userProfileImageUrl?: string;
}

export type NotificationType = 'assignment' | 'mention';

export interface DBNotification {
  id: string;
  workspaceId: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  resourceType: 'item';
  resourceId: string;
  resourceName: string;
  boardId: string;
  boardName: string;
  read: boolean;
  createdAt: admin.firestore.Timestamp;
}
