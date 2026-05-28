import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import {
  boardsCollection,
  boardMembersCollection,
  membershipsCollection,
  usersCollection,
  workspacesCollection,
  preapprovedUsersCollection,
} from '../db/collections.js';
import { JwtUserPayload, DBBoard, DBBoardMember, DBMembership, DBUser, DBPreapprovedUser, DBWorkspace, BoardRole, UserRole } from '../types/index.js';
import { logAudit, getClientIp } from '../services/audit.service.js';
import { assertBoardAccess } from '../utils/workManagementAuth.js';
import { sendUserInvitationEmail } from '../services/email.service.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { env } from '../config/env.js';
import { Buffer } from 'node:buffer';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

const VALID_BOARD_ROLES = new Set<string>(Object.values(BoardRole));

async function getCallerMember(orgId: string, boardId: string, userId: string): Promise<DBBoardMember | null> {
  const doc = await boardMembersCollection(orgId, boardId).doc(userId).get();
  return doc.exists ? doc.data() as DBBoardMember : null;
}

// ---------------------------------------------------------------------------
// GET /boards/:boardId/members
// ---------------------------------------------------------------------------
export const listMembers = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    const callerMember = await getCallerMember(user.orgId, boardId, user.id);

    // Requires board ADMIN or full_access (WORKSPACE_ADMIN+)
    assertBoardAccess(user, board, 'update', callerMember);

    const snapshot = await boardMembersCollection(user.orgId, boardId).get();
    const members = querySnapshotToArray<DBBoardMember>(snapshot);

    res.json(members);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error listing board members for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to list board members.' });
  }
};

// ---------------------------------------------------------------------------
// POST /boards/:boardId/members
// ---------------------------------------------------------------------------
export const addMember = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const { userId, role } = req.body;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'userId is required.' });
  }
  if (!role || !VALID_BOARD_ROLES.has(role)) {
    return res.status(400).json({
      message: `Invalid role. Valid roles: ${[...VALID_BOARD_ROLES].join(', ')}.`,
    });
  }

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    // Verify userId is a member of the board's workspace
    const membershipSnap = await membershipsCollection
      .where('userId', '==', userId)
      .where('orgId', '==', user.orgId)
      .get();

    const isWorkspaceMember = membershipSnap.docs.some(
      (doc) => (doc.data() as DBMembership).entityId === board.workspaceId,
    );
    if (!isWorkspaceMember) {
      return res.status(403).json({ message: 'User is not a member of this workspace.' });
    }

    // Check if already a board member
    const existingDoc = await boardMembersCollection(user.orgId, boardId).doc(userId).get();
    if (existingDoc.exists) {
      return res.status(409).json({ message: 'User is already a member of this board.' });
    }

    // Denormalize user info from membership
    const membershipData = membershipSnap.docs
      .find((doc) => (doc.data() as DBMembership).entityId === board.workspaceId)
      ?.data() as DBMembership | undefined;

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await boardMembersCollection(user.orgId, boardId).doc(userId).set({
      userId,
      boardId,
      workspaceId: user.orgId,
      role: role as BoardRole,
      addedBy: user.id,
      createdAt: timestamp,
      userName: membershipData?.userName ?? null,
      userEmail: membershipData?.userEmail ?? null,
      userProfileImageUrl: membershipData?.userProfileImageUrl ?? null,
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'board',
      resourceId: boardId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const created = await boardMembersCollection(user.orgId, boardId).doc(userId).get();
    res.status(201).json(created.data());
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error adding board member to board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to add board member.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/members/:userId
// ---------------------------------------------------------------------------
export const updateMemberRole = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, userId } = req.params;
  const { role } = req.body;

  if (!role || !VALID_BOARD_ROLES.has(role)) {
    return res.status(400).json({
      message: `Invalid role. Valid roles: ${[...VALID_BOARD_ROLES].join(', ')}.`,
    });
  }

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const targetDoc = await boardMembersCollection(user.orgId, boardId).doc(userId).get();
    if (!targetDoc.exists) return res.status(404).json({ message: 'Board member not found.' });

    const targetMember = targetDoc.data() as DBBoardMember;

    // Prevent demoting the last admin
    if (targetMember.role === BoardRole.ADMIN && role !== BoardRole.ADMIN) {
      const adminSnap = await boardMembersCollection(user.orgId, boardId)
        .where('role', '==', BoardRole.ADMIN)
        .get();
      if (adminSnap.size <= 1) {
        return res.status(409).json({ message: 'Cannot demote the last board admin.' });
      }
    }

    await boardMembersCollection(user.orgId, boardId).doc(userId).update({
      role: role as BoardRole,
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: boardId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ message: 'Member role updated.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error updating board member role for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to update member role.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /boards/:boardId/members/:userId
// ---------------------------------------------------------------------------
export const removeMember = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, userId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const targetDoc = await boardMembersCollection(user.orgId, boardId).doc(userId).get();
    if (!targetDoc.exists) return res.status(404).json({ message: 'Board member not found.' });

    const targetMember = targetDoc.data() as DBBoardMember;

    // Prevent removing the last admin
    if (targetMember.role === BoardRole.ADMIN) {
      const adminSnap = await boardMembersCollection(user.orgId, boardId)
        .where('role', '==', BoardRole.ADMIN)
        .get();
      if (adminSnap.size <= 1) {
        return res.status(409).json({ message: 'Cannot remove the last board admin.' });
      }
    }

    await boardMembersCollection(user.orgId, boardId).doc(userId).delete();

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'board',
      resourceId: boardId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error removing board member from board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to remove board member.' });
  }
};

// ---------------------------------------------------------------------------
// POST /boards/:boardId/invite  (invite by email — board-level invitation)
// ---------------------------------------------------------------------------
export const inviteByEmail = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const rawEmail = sanitizeText(req.body.email ?? '');
  const permissions: 'edit' | 'read_only' = req.body.permissions === 'read_only' ? 'read_only' : 'edit';
  const boardRole = permissions === 'read_only' ? BoardRole.VIEWER : BoardRole.EDITOR;

  const email = rawEmail.toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const userSnap = await usersCollection.where('email', '==', email).limit(1).get();

    if (!userSnap.empty) {
      const targetUser = snapshotToData<DBUser>(userSnap.docs[0])!;
      const targetUserId = targetUser.id;

      // Check if already a board member
      const existingMemberDoc = await boardMembersCollection(user.orgId, boardId).doc(targetUserId).get();
      if (existingMemberDoc.exists) {
        return res.status(409).json({ message: 'User is already a member of this board.' });
      }

      const membershipSnap = await membershipsCollection
        .where('userId', '==', targetUserId)
        .where('orgId', '==', user.orgId)
        .get();

      const existingWorkspaceMembership = membershipSnap.docs.find(
        (d) => (d.data() as DBMembership).entityId === board.workspaceId,
      );

      const batch = db.batch();

      if (!existingWorkspaceMembership) {
        // New to this workspace — add with board-only access
        const newMemberRef = membershipsCollection.doc();
        batch.set(newMemberRef, {
          id: newMemberRef.id,
          userId: targetUserId,
          userName: targetUser.name,
          userEmail: targetUser.email,
          entityId: board.workspaceId,
          entityType: 'workspace',
          role: UserRole.REGULAR_USER,
          permissions,
          orgId: user.orgId,
          boardOnlyAccess: true,
          boardIds: [boardId],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Update boardIds if user has boardOnlyAccess
        const existingData = existingWorkspaceMembership.data() as DBMembership;
        if (existingData.boardOnlyAccess) {
          const existingBoardIds = existingData.boardIds ?? [];
          if (!existingBoardIds.includes(boardId)) {
            batch.update(existingWorkspaceMembership.ref, {
              boardIds: [...existingBoardIds, boardId],
            });
          }
        }
      }

      // Add board member record
      batch.set(boardMembersCollection(user.orgId, boardId).doc(targetUserId), {
        userId: targetUserId,
        boardId,
        workspaceId: board.workspaceId,
        role: boardRole,
        addedBy: user.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userName: targetUser.name ?? null,
        userEmail: targetUser.email ?? null,
        userProfileImageUrl: targetUser.profileImageUrl ?? null,
      });

      await batch.commit();
      return res.status(201).json({ message: `${email} has been added to this board.` });
    }

    // User doesn't exist — create pre-approved entry with boardIds
    const workspaceDoc = await workspacesCollection.doc(board.workspaceId).get();
    const workspaceData = snapshotToData<DBWorkspace>(workspaceDoc);
    const workspaceName = workspaceData?.name ?? 'this workspace';

    const docId = Buffer.from(`${email}_${board.workspaceId}`).toString('base64');
    const docRef = preapprovedUsersCollection.doc(docId);
    const existing = await docRef.get();
    if (existing.exists) {
      const existingData = existing.data() as DBPreapprovedUser;
      const existingBoardIds = existingData.boardIds ?? [];
      if (!existingBoardIds.includes(boardId)) {
        await docRef.update({ boardIds: [...existingBoardIds, boardId] });
      }
    } else {
      await docRef.set({
        email,
        workspaceId: board.workspaceId,
        orgId: user.orgId,
        addedBy: user.id,
        permissions,
        boardOnlyAccess: true,
        boardIds: [boardId],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      } as Omit<DBPreapprovedUser, 'id'>);
    }

    const orgDoc = await db.collection('organizations').doc(user.orgId).get();
    const orgName = orgDoc.exists ? (orgDoc.data()?.name ?? 'Logyx') : 'Logyx';
    await sendUserInvitationEmail(email, workspaceName, orgName, `${env.FRONTEND_URL}/register`);

    return res.status(200).json({ message: `Invitation sent to ${email}.` });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error inviting user to board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to invite user.' });
  }
};
