import type { Request, Response } from 'express';
import crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import {
  boardsCollection,
  boardMembersCollection,
  boardViewInvitesCollection,
  groupsCollection,
  columnsCollection,
  itemsCollection,
  usersCollection,
} from '../db/collections.js';
import { JwtUserPayload, DBBoard, DBBoardMember, DBBoardViewInvite, DBGroup, DBColumn, DBItem } from '../types/index.js';
import { assertBoardAccess } from '../utils/workManagementAuth.js';
import { sendBoardViewInviteEmail } from '../services/email.service.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { env } from '../config/env.js';

const DEFAULT_INVITE_TTL_DAYS = 7;
const MIN_INVITE_TTL_DAYS = 1;
const MAX_INVITE_TTL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getCallerMember(orgId: string, boardId: string, userId: string): Promise<DBBoardMember | null> {
  const doc = await boardMembersCollection(orgId, boardId).doc(userId).get();
  return doc.exists ? (doc.data() as DBBoardMember) : null;
}

// ---------------------------------------------------------------------------
// POST /boards/:boardId/view-invites — board admin sends a read-only view link
// ---------------------------------------------------------------------------
export const createInvite = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const email = sanitizeText(req.body.email ?? '').toLowerCase().trim();
  const rawExpirationDays = req.body.expirationDays;
  const expirationDays = rawExpirationDays === undefined || rawExpirationDays === null
    ? DEFAULT_INVITE_TTL_DAYS
    : Number(rawExpirationDays);

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }
  if (!Number.isInteger(expirationDays) || expirationDays < MIN_INVITE_TTL_DAYS || expirationDays > MAX_INVITE_TTL_DAYS) {
    return res.status(400).json({ message: `Expiration must be a whole number of days between ${MIN_INVITE_TTL_DAYS} and ${MAX_INVITE_TTL_DAYS}.` });
  }

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const plainToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const invite: DBBoardViewInvite = {
      orgId: user.orgId,
      boardId,
      boardName: board.name,
      workspaceId: board.workspaceId,
      email,
      invitedBy: user.id,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + expirationDays * DAY_MS),
      revokedAt: null,
    };
    await boardViewInvitesCollection.doc(hashToken(plainToken)).set(invite);

    const inviterDoc = await usersCollection.doc(user.id).get();
    const inviterName = inviterDoc.exists ? (inviterDoc.data()?.name || 'A teammate') : 'A teammate';

    const viewLink = `${env.FRONTEND_URL}/public/board-view/${plainToken}`;
    await sendBoardViewInviteEmail(email, board.name, inviterName, viewLink, expirationDays);

    return res.status(201).json({ message: `View-only invitation sent to ${email}.` });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error creating board view invite for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to send view invitation.' });
  }
};

// ---------------------------------------------------------------------------
// GET /boards/:boardId/view-invites — list active/expired invites (no tokens)
// ---------------------------------------------------------------------------
export const listInvites = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const snapshot = await boardViewInvitesCollection
      .where('boardId', '==', boardId)
      .where('orgId', '==', user.orgId)
      .get();

    const invites = querySnapshotToArray<DBBoardViewInvite & { id: string }>(snapshot)
      .map(({ id, email, createdAt, expiresAt, revokedAt }) => ({ id, email, createdAt, expiresAt, revokedAt }));

    res.json(invites);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error listing board view invites for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to list view invitations.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /boards/:boardId/view-invites/:inviteId — revoke early
// ---------------------------------------------------------------------------
export const revokeInvite = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, inviteId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const callerMember = await getCallerMember(user.orgId, boardId, user.id);
    assertBoardAccess(user, board, 'update', callerMember);

    const inviteDoc = await boardViewInvitesCollection.doc(inviteId).get();
    if (!inviteDoc.exists || (inviteDoc.data() as DBBoardViewInvite).boardId !== boardId) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    await inviteDoc.ref.update({ revokedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ message: 'Invitation revoked.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error revoking board view invite ${req.params.inviteId}:`, err);
    res.status(500).json({ message: 'Failed to revoke invitation.' });
  }
};

// ---------------------------------------------------------------------------
// GET /public/board-view/:token — unauthenticated, read-only board snapshot
// ---------------------------------------------------------------------------
export const getPublicBoardView = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'Invalid link.' });
  }

  try {
    const inviteDoc = await boardViewInvitesCollection.doc(hashToken(token)).get();
    if (!inviteDoc.exists) {
      return res.status(404).json({ message: 'This link is invalid.' });
    }
    const invite = snapshotToData<DBBoardViewInvite>(inviteDoc)!;

    if (invite.revokedAt) {
      return res.status(410).json({ message: 'This link has been revoked.' });
    }
    const getMillis = (ts: any) => (typeof ts?.toMillis === 'function' ? ts.toMillis() : new Date(ts).getTime());
    if (getMillis(invite.expiresAt) < Date.now()) {
      return res.status(410).json({ message: 'This link has expired.' });
    }

    const { orgId, boardId } = invite;
    const boardDoc = await boardsCollection(orgId).doc(boardId).get();
    if (!boardDoc.exists) {
      return res.status(404).json({ message: 'This board no longer exists.' });
    }
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const [groupsSnap, columnsSnap, itemsSnap] = await Promise.all([
      groupsCollection(orgId, boardId).orderBy('order').get(),
      columnsCollection(orgId, boardId).get(),
      itemsCollection(orgId).where('boardId', '==', boardId).where('isArchived', '==', false).get(),
    ]);

    const groups = querySnapshotToArray<DBGroup>(groupsSnap).filter((g) => !g.isArchived && !g.parentItemId);
    const columns = querySnapshotToArray<DBColumn>(columnsSnap).filter((c) => !c.parentGroupId);
    // Firestore doesn't guarantee insertion order without an explicit orderBy, and columns
    // aren't queried with one here — sort the same way the authenticated getColumns does.
    (columns as (DBColumn & { order?: number; createdAt?: Date })[]).sort((a, b) => {
      const aOrder = typeof a.order === 'number' ? a.order : Infinity;
      const bOrder = typeof b.order === 'number' ? b.order : Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return aTime - bTime;
    });
    const items = querySnapshotToArray<DBItem>(itemsSnap);

    res.json({
      board,
      groups,
      columns,
      items,
      expiresAt: invite.expiresAt,
    });
  } catch (err: unknown) {
    logger.error(`Error resolving public board view for token:`, err);
    res.status(500).json({ message: 'Failed to load board.' });
  }
};
