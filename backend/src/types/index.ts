
import admin from 'firebase-admin';

// --- HIERARCHY & TENANCY ---

export interface DBAcademy {
  id: string;
  name: string;
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBOrganization {
  id: string;
  name: string;
  academyId: string;
  createdAt: admin.firestore.Timestamp | Date | any;
  updatedAt?: admin.firestore.Timestamp | Date | any;
  isPersonal?: boolean;
  status?: 'active' | 'archived';
}

export interface DBAcademySettings {
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
}

export interface DBSystemSettings {
  id?: string;
}

export interface DBTutorialSettings {
  id?: string;
}

export enum UserRole {
  REGULAR_USER = 'regular_user',
  ORGANIZATION_ADMIN = 'organization_admin',
  ACADEMY_ADMIN = 'academy_admin',
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
  primaryAcademyId?: string;
  defaultOrganizationId?: string;
}

export interface DBMembership {
  id: string;
  userId: string;
  entityId: string;
  entityType: 'organization' | 'academy';
  role: UserRole;
  academyId: string;
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
  organizationId: string;
  academyId: string;
  addedBy: string;
  createdAt: admin.firestore.Timestamp | Date | any;
}

export interface DBUserAccessStatus {
  id: string;
  organizationId: string;
  hasAccess: boolean;
  updatedAt: admin.firestore.Timestamp | Date | any;
}

// --- JWT PAYLOADS ---

export interface JwtUserPayload {
  id: string;
  role: UserRole;
  selectedOrganizationId: string;
  academyId: string;
}

export interface JwtMultiOrgPayload {
  id: string;
  action: 'select-organization' | 'academy-setup';
}

export interface JwtApprovalPayload {
  userId: string;
  action: 'approve_user';
}

export interface JwtVerificationPayload {
  userId: string;
  action: 'verify_email' | 'verify_academy_admin';
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
      academyId?: string;
    }
  }
}

// --- AUDIT LOGGING ---

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'ANOMALY';
export type AuditResourceType = 'user' | 'organization' | 'academy';

export interface DBAuditLog {
  id: string;
  actorUserId: string;
  actorRole: UserRole;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  organizationId?: string;
  academyId?: string;
  changes?: { before: unknown; after: unknown };
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  timestamp: admin.firestore.Timestamp | Date | any;
  expiresAt: admin.firestore.Timestamp | Date | any;
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
