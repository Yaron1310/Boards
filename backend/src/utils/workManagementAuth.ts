/**
 * workManagementAuth.ts
 *
 * Authorization helpers for the Phase 5 work-management security rules.
 * These functions are called inside Phase 6 controllers — they do NOT replace
 * Express middleware, they implement per-resource access logic.
 *
 * All enforcement stays at the Express layer; Firestore rules remain deny-all.
 */

import { UserRole, JwtUserPayload, DBBoard, DBGroup, DBItem, DBColumn, DBBoardMember, BoardRole } from '../types/index.js';
import { boardsCollection, groupsCollection } from '../db/collections.js';

// ---------------------------------------------------------------------------
// Role level helpers
// ---------------------------------------------------------------------------

const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.REGULAR_USER]: 0,
  [UserRole.WORKSPACE_ADMIN]: 1,
  [UserRole.ORGANIZATION_ADMIN]: 2,
  [UserRole.SYSTEM_ADMIN]: 3,
};

function isAtLeast(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[minRole];
}

export type WorkManagementOperation = 'read' | 'create' | 'update' | 'archive' | 'delete';

// ---------------------------------------------------------------------------
// Board role helpers (Phase 9)
// ---------------------------------------------------------------------------

const BOARD_ROLE_LEVEL: Record<BoardRole, number> = {
  [BoardRole.VIEWER]: 0,
  [BoardRole.EDITOR]: 1,
  [BoardRole.ADMIN]:  2,
};

function boardRoleAtLeast(effective: BoardRole | 'full_access' | null, min: BoardRole): boolean {
  if (effective === null) return false;
  if (effective === 'full_access') return true;
  return BOARD_ROLE_LEVEL[effective] >= BOARD_ROLE_LEVEL[min];
}

/**
 * Merges workspace role and explicit board membership into a single effective role.
 *
 * - SYSTEM_ADMIN / ORGANIZATION_ADMIN → full_access (bypasses board restrictions)
 * - WORKSPACE_ADMIN in own workspace → full_access
 * - Board creator → ADMIN
 * - Explicit board member → member.role
 * - Everyone else → null (no access)
 */
export function effectiveBoardRole(
  user: JwtUserPayload,
  board: DBBoard,
  member: DBBoardMember | null,
): BoardRole | 'full_access' | null {
  if (user.role === UserRole.SYSTEM_ADMIN) return 'full_access';
  if (isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) return 'full_access';
  if (
    user.role === UserRole.WORKSPACE_ADMIN &&
    user.selectedWorkspaceId === board.workspaceId
  ) return 'full_access';
  if (board.createdBy === user.id) return BoardRole.ADMIN;
  return member?.role ?? null;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given board.
 *
 * Rules (Phase 9A — board-role aware):
 *   read   — effectiveBoardRole >= viewer (or full_access)
 *   create — WORKSPACE_ADMIN+ in their workspace (pre-membership; no board exists yet)
 *   update — effectiveBoardRole = admin (or full_access)
 *   archive— effectiveBoardRole = admin (or full_access)
 *   delete — full_access only (ORGANIZATION_ADMIN+ or SYSTEM_ADMIN)
 *
 * The `member` parameter defaults to null (backwards-compatible with Phase 5/6 callers).
 */
export function canAccessBoard(
  user: JwtUserPayload,
  board: DBBoard,
  op: WorkManagementOperation,
  member: DBBoardMember | null = null,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  // Tenant isolation is guaranteed by the collection path (boardsCollection(user.orgId)).
  // board.workspaceId holds the *department* ID — comparing it to user.orgId (the academy ID)
  // would always be unequal and incorrectly block all non-system-admin users.

  const effective = effectiveBoardRole(user, board, member);

  switch (op) {
    case 'read':
      return boardRoleAtLeast(effective, BoardRole.VIEWER);

    case 'create':
      // ORGANIZATION_ADMIN may create boards in any workspace within their org.
      // WORKSPACE_ADMIN may only create boards in their own selected workspace.
      if (isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) return true;
      return (
        user.role === UserRole.WORKSPACE_ADMIN &&
        user.selectedWorkspaceId === board.workspaceId
      );

    case 'update':
      return boardRoleAtLeast(effective, BoardRole.ADMIN);

    case 'archive':
      return boardRoleAtLeast(effective, BoardRole.ADMIN);

    case 'delete':
      return effective === 'full_access';

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
  member: DBBoardMember | null = null,
): void {
  if (!canAccessBoard(user, board, op, member)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this board.' };
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given group.
 *
 * Rules (Phase 9A — board-role aware):
 *   read   — any org member OR board member with viewer+
 *   create/update — WORKSPACE_ADMIN+ OR board creator OR board member with editor+
 *   delete — WORKSPACE_ADMIN+ OR board member with admin
 *
 * `member` defaults to null (backwards-compatible).
 */
export function canAccessGroup(
  user: JwtUserPayload,
  group: DBGroup,
  op: WorkManagementOperation,
  boardCreatedBy?: string,
  member: DBBoardMember | null = null,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  if (user.orgId !== group.workspaceId) return false;

  const isOrgAdmin = isAtLeast(user.role, UserRole.WORKSPACE_ADMIN);
  const isBoardCreator = boardCreatedBy !== undefined && boardCreatedBy === user.id;
  const boardMemberRole = member?.role ?? null;

  switch (op) {
    case 'read':
      return true; // any org member

    case 'create':
    case 'update':
      return (
        isOrgAdmin ||
        isBoardCreator ||
        boardRoleAtLeast(boardMemberRole, BoardRole.EDITOR)
      );

    case 'archive':
    case 'delete':
      return (
        isOrgAdmin ||
        boardRoleAtLeast(boardMemberRole, BoardRole.ADMIN)
      );

    default:
      return false;
  }
}

export function assertGroupAccess(
  user: JwtUserPayload,
  group: DBGroup,
  op: WorkManagementOperation,
  boardCreatedBy?: string,
  member: DBBoardMember | null = null,
): void {
  if (!canAccessGroup(user, group, op, boardCreatedBy, member)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this group.' };
  }
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on the given item.
 *
 * Rules (Phase 9A — board-role aware):
 *   read   — effectiveBoardRole >= viewer OR user is an assignee
 *   create — effectiveBoardRole >= editor
 *   update — effectiveBoardRole >= editor OR (creator/assignee AND >= viewer)
 *   archive— effectiveBoardRole >= editor
 *   delete — effectiveBoardRole = admin
 *
 * Effective role computed without board.createdBy (not available here); board
 * creators are always WORKSPACE_ADMIN+ and receive full_access that way.
 *
 * `member` defaults to null (backwards-compatible).
 */
export function canAccessItem(
  user: JwtUserPayload,
  item: DBItem,
  op: WorkManagementOperation,
  member: DBBoardMember | null = null,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  const isOrgMember = user.orgId === item.workspaceId;
  const isAssignee = Array.isArray(item.assignees) && item.assignees.includes(user.id);
  const isCreator = item.createdBy === user.id;
  const isWorkspaceMember = isOrgMember && user.selectedWorkspaceId === item.workspaceId;

  // Compute effective board role (simplified — no board.createdBy available)
  let effective: BoardRole | 'full_access' | null = null;
  if (isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) {
    effective = 'full_access';
  } else if (user.role === UserRole.WORKSPACE_ADMIN && isWorkspaceMember) {
    effective = 'full_access';
  } else {
    effective = member?.role ?? null;
  }

  switch (op) {
    case 'read':
      return boardRoleAtLeast(effective, BoardRole.VIEWER) || isAssignee;

    case 'create':
      return boardRoleAtLeast(effective, BoardRole.EDITOR);

    case 'update':
      return (
        boardRoleAtLeast(effective, BoardRole.EDITOR) ||
        ((isCreator || isAssignee) && boardRoleAtLeast(effective, BoardRole.VIEWER))
      );

    case 'archive':
      return boardRoleAtLeast(effective, BoardRole.EDITOR);

    case 'delete':
      return boardRoleAtLeast(effective, BoardRole.ADMIN);

    default:
      return false;
  }
}

export function assertItemAccess(
  user: JwtUserPayload,
  item: DBItem,
  op: WorkManagementOperation,
  member: DBBoardMember | null = null,
): void {
  if (!canAccessItem(user, item, op, member)) {
    throw { status: 403, message: 'Forbidden: insufficient permissions for this item.' };
  }
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * Returns true if the user is allowed to perform `op` on column definitions.
 *
 * Rules (Phase 9A — board-role aware):
 *   read   — any org member.
 *   create/update/delete — WORKSPACE_ADMIN+ OR board member with editor+
 *
 * Columns are org-level; `member` allows editors to manage columns when passed.
 * `member` defaults to null (backwards-compatible).
 */
export function canAccessColumn(
  user: JwtUserPayload,
  column: DBColumn,
  op: WorkManagementOperation,
  member: DBBoardMember | null = null,
): boolean {
  if (user.role === UserRole.SYSTEM_ADMIN) return true;

  if (user.orgId !== column.workspaceId) return false;

  switch (op) {
    case 'read':
      return true; // any org member

    case 'create':
    case 'update':
    case 'delete':
      return (
        isAtLeast(user.role, UserRole.WORKSPACE_ADMIN) ||
        boardRoleAtLeast(member?.role ?? null, BoardRole.EDITOR)
      );

    default:
      return false;
  }
}

export function assertColumnAccess(
  user: JwtUserPayload,
  column: DBColumn,
  op: WorkManagementOperation,
  member: DBBoardMember | null = null,
): void {
  if (!canAccessColumn(user, column, op, member)) {
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
 *   1. boardId exists under boardsCollection(workspaceId)
 *   2. groupId exists under groupsCollection(workspaceId, boardId)
 *   3. board.workspaceId matches the provided workspaceId
 *
 * Prevents cross-tenant and cross-workspace item injection.
 * Call this before creating or updating an item.
 */
export async function validateItemOwnershipChain(
  orgId: string,
  workspaceId: string,
  boardId: string,
  groupId: string,
): Promise<OwnershipChainResult> {
  // 1. Board must exist under this org
  const boardDoc = await boardsCollection(orgId).doc(boardId).get();
  if (!boardDoc.exists) {
    return { valid: false, error: `Board "${boardId}" not found in this workspace.` };
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
  const groupDoc = await groupsCollection(orgId, boardId).doc(groupId).get();
  if (!groupDoc.exists) {
    return {
      valid: false,
      error: `Group "${groupId}" not found under board "${boardId}".`,
    };
  }

  return { valid: true, board: boardData };
}

/**
 * Verifies that a group's boardId is valid within the workspace.
 * Call this before creating or updating a group.
 */
export async function validateGroupOwnershipChain(
  workspaceId: string,
  boardId: string,
): Promise<{ valid: boolean; error?: string }> {
  const boardDoc = await boardsCollection(workspaceId).doc(boardId).get();
  if (!boardDoc.exists) {
    return { valid: false, error: `Board "${boardId}" not found in this workspace.` };
  }
  return { valid: true };
}
