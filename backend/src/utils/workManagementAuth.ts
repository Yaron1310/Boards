/**
 * workManagementAuth.ts
 *
 * Authorization helpers for the Phase 5 work-management security rules.
 * These functions are called inside Phase 6 controllers — they do NOT replace
 * Express middleware, they implement per-resource access logic.
 *
 * All enforcement stays at the Express layer; Firestore rules remain deny-all.
 */

import { UserRole, JwtUserPayload, DBBoard, DBGroup, DBItem, DBColumn } from '../types/index.js';
import { boardsCollection, groupsCollection } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Role level helpers
// ---------------------------------------------------------------------------

const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.REGULAR_USER]: 0,
  [UserRole.ORGANIZATION_ADMIN]: 1,
  [UserRole.ACADEMY_ADMIN]: 2,
  [UserRole.SYSTEM_ADMIN]: 3,
};

function isAtLeast(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

export type WorkManagementOperation = 'read' | 'create' | 'update' | 'archive' | 'delete';

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given board.
 *
 * Rules (Phase 5.2):
 *   read   — any member whose orgId matches board.organizationId;
 *            ACADEMY_ADMIN+ can read any board in their org.
 *   create — ORGANIZATION_ADMIN+ scoped to their workspaceId.
 *   update — board creator OR ORGANIZATION_ADMIN (own workspace) OR ACADEMY_ADMIN+.
 *   archive— ORGANIZATION_ADMIN (own workspace) OR ACADEMY_ADMIN+.
 *   delete — ACADEMY_ADMIN+ only (hard-delete).
 */
export function canAccessBoard(
  user: JwtUserPayload,
  board: DBBoard,
  op: WorkManagementOperation,
): boolean {
  // SYSTEM_ADMIN bypasses all checks
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  // Tenant boundary — always required
  if (user.orgId !== board.organizationId) return false;

  switch (op) {
    case 'read':
      // Any org member can read boards in their workspace; ACADEMY_ADMIN+ sees all org boards
      return (
        isAtLeast(user.role, UserRole.ACADEMY_ADMIN) ||
        user.selectedOrganizationId === board.workspaceId
      );

    case 'create':
      return (
        isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN) &&
        user.selectedOrganizationId === board.workspaceId
      );

    case 'update':
      return (
        board.createdBy === user.id ||
        (user.role === UserRole.ORGANIZATION_ADMIN &&
          user.selectedOrganizationId === board.workspaceId) ||
        isAtLeast(user.role, UserRole.ACADEMY_ADMIN)
      );

    case 'archive':
      return (
        (user.role === UserRole.ORGANIZATION_ADMIN &&
          user.selectedOrganizationId === board.workspaceId) ||
        isAtLeast(user.role, UserRole.ACADEMY_ADMIN)
      );

    case 'delete':
      // Hard-delete: ACADEMY_ADMIN+ only
      return isAtLeast(user.role, UserRole.ACADEMY_ADMIN);

    default:
      return false;
  }
}

/**
 * Asserts board access or throws an object with `status` and `message`
 * suitable for `res.status(err.status).json({ message: err.message })`.
 */
export function assertBoardAccess(
  user: JwtUserPayload,
  board: DBBoard,
  op: WorkManagementOperation,
): void {
  if (!canAccessBoard(user, board, op)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this board.' };
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given group.
 *
 * Rules (Phase 5.3):
 *   read   — same tenant access as the parent board (orgId match).
 *   create/update — ORGANIZATION_ADMIN+ OR board creator (passed as boardCreatedBy).
 *   delete — ORGANIZATION_ADMIN+ (hard-delete).
 */
export function canAccessGroup(
  user: JwtUserPayload,
  group: DBGroup,
  op: WorkManagementOperation,
  boardCreatedBy?: string,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  if (user.orgId !== group.organizationId) return false;

  switch (op) {
    case 'read':
      return true; // any org member

    case 'create':
    case 'update':
      return (
        (boardCreatedBy !== undefined && boardCreatedBy === user.id) ||
        isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)
      );

    case 'archive':
    case 'delete':
      return isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN);

    default:
      return false;
  }
}

export function assertGroupAccess(
  user: JwtUserPayload,
  group: DBGroup,
  op: WorkManagementOperation,
  boardCreatedBy?: string,
): void {
  if (!canAccessGroup(user, group, op, boardCreatedBy)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this group.' };
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given item.
 *
 * Rules (Phase 5.4):
 *   read   — orgId match OR user is in item.assignees.
 *   create — workspace member: selectedOrganizationId === item.workspaceId (and orgId match).
 *   update — item creator OR assignee OR ORGANIZATION_ADMIN+.
 *   archive— item creator OR ORGANIZATION_ADMIN+.
 *   delete — ORGANIZATION_ADMIN+ only (hard-delete).
 */
export function canAccessItem(
  user: JwtUserPayload,
  item: DBItem,
  op: WorkManagementOperation,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  const isOrgMember = user.orgId === item.organizationId;
  const isAssignee = Array.isArray(item.assignees) && item.assignees.includes(user.id);
  const isCreator = item.createdBy === user.id;
  const isWorkspaceMember =
    isOrgMember && user.selectedOrganizationId === item.workspaceId;

  switch (op) {
    case 'read':
      return isOrgMember || isAssignee;

    case 'create':
      return isWorkspaceMember;

    case 'update':
      return (isOrgMember || isAssignee) && (isCreator || isAssignee || isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN));

    case 'archive':
      return isOrgMember && (isCreator || isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN));

    case 'delete':
      return isOrgMember && isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN);

    default:
      return false;
  }
}

export function assertItemAccess(
  user: JwtUserPayload,
  item: DBItem,
  op: WorkManagementOperation,
): void {
  if (!canAccessItem(user, item, op)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this item.' };
  }
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on column definitions.
 *
 * Rules (Phase 5.5):
 *   read   — any org member.
 *   create/update/delete — ORGANIZATION_ADMIN+ only.
 */
export function canAccessColumn(
  user: JwtUserPayload,
  column: DBColumn,
  op: WorkManagementOperation,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  if (user.orgId !== column.organizationId) return false;

  switch (op) {
    case 'read':
      return true; // any org member

    case 'create':
    case 'update':
    case 'delete':
      return isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN);

    default:
      return false;
  }
}

export function assertColumnAccess(
  user: JwtUserPayload,
  column: DBColumn,
  op: WorkManagementOperation,
): void {
  if (!canAccessColumn(user, column, op)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for column definitions.' };
  }
}

// ---------------------------------------------------------------------------
// Ownership chain validation (async — requires DB lookups)
// ---------------------------------------------------------------------------

export interface OwnershipChainResult {
  valid: boolean;
  error?: string;
  /** The fetched board (available when valid === true) */
  board?: FirebaseFirestore.DocumentData;
}

/**
 * Verifies the full ownership chain for an item write:
 *   1. boardId exists under boardsCollection(organizationId)
 *   2. groupId exists under groupsCollection(organizationId, boardId)
 *   3. board.workspaceId matches the provided workspaceId
 *
 * Prevents cross-tenant and cross-workspace item injection.
 * Call this before creating or updating an item.
 */
export async function validateItemOwnershipChain(
  organizationId: string,
  workspaceId: string,
  boardId: string,
  groupId: string,
): Promise<OwnershipChainResult> {
  // 1. Board must exist under this org
  const boardDoc = await boardsCollection(organizationId).doc(boardId).get();
  if (!boardDoc.exists) {
    return { valid: false, error: `Board "${boardId}" not found in this organization.` };
  }

  const boardData = boardDoc.data()!;

  // 2. Board must belong to the same workspace as the item
  if (boardData.workspaceId !== workspaceId) {
    return {
      valid: false,
      error: `Board "${boardId}" does not belong to workspace "${workspaceId}".`,
    };
  }

  // 3. Group must exist under this board
  const groupDoc = await groupsCollection(organizationId, boardId).doc(groupId).get();
  if (!groupDoc.exists) {
    return {
      valid: false,
      error: `Group "${groupId}" not found under board "${boardId}".`,
    };
  }

  return { valid: true, board: boardData };
}

/**
 * Verifies that a group's boardId is valid within the organization.
 * Call this before creating or updating a group.
 */
export async function validateGroupOwnershipChain(
  organizationId: string,
  boardId: string,
): Promise<{ valid: boolean; error?: string }> {
  const boardDoc = await boardsCollection(organizationId).doc(boardId).get();
  if (!boardDoc.exists) {
    return { valid: false, error: `Board "${boardId}" not found in this organization.` };
  }
  return { valid: true };
}
