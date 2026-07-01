import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { boardsCollection, groupsCollection, boardMembersCollection, itemsCollection } from '../db/collections.js';
import { JwtUserPayload, DBBoard, DBGroup, DBBoardMember, DBItem } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { logAudit, getClientIp } from '../services/audit.service.js';
import {
  assertBoardAccess,
  assertGroupAccess,
  validateGroupOwnershipChain,
} from '../utils/workManagementAuth.js';
import { touchBoardVersion } from '../services/boardVersion.service.js';
import { revokeWebhookForGroup } from '../services/webhook.service.js';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

// ---------------------------------------------------------------------------
// GET /boards/:boardId/groups
// ---------------------------------------------------------------------------
export const getGroups = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const { includeArchived, parentItemId } = req.query;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    assertBoardAccess(user, board, 'read');

    const snapshot = await groupsCollection(user.orgId, boardId).orderBy('order').get();
    const allGroups = querySnapshotToArray<DBGroup>(snapshot);

    let groups = allGroups;

    if (parentItemId && typeof parentItemId === 'string') {
      // Return only subitem groups for the given parent item
      groups = allGroups.filter((g) => g.parentItemId === parentItemId);
    } else {
      // Default: return only top-level groups (no parentItemId), optionally filtered by archive status
      groups = allGroups.filter((g) => !g.parentItemId);
      if (includeArchived !== 'true') {
        groups = groups.filter((g) => !g.isArchived);
      }
    }

    res.json(groups);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching groups for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to fetch groups.' });
  }
};

// ---------------------------------------------------------------------------
// POST /boards/:boardId/groups
// ---------------------------------------------------------------------------
export const createGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const { name, color, order, parentItemId } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Group name is required.' });
  }

  try {
    // Validate the board exists in this org
    const chain = await validateGroupOwnershipChain(user.orgId, boardId);
    if (!chain.valid) return res.status(400).json({ message: chain.error });

    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;

    // Build a provisional group to check permission before writing
    const provisionalGroup: DBGroup = {
      id: '',
      workspaceId: user.orgId,
      boardId,
      name: sanitizeText(name),
      color: color ?? null,
      order: typeof order === 'number' ? order : 0,
      isCollapsed: false,
      parentItemId: parentItemId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertGroupAccess(user, provisionalGroup, 'create', board.createdBy, memberData, board.workspaceId);

    // Auto-calculate order if not provided
    let groupOrder = typeof order === 'number' ? order : null;
    if (groupOrder === null) {
      const countSnap = await groupsCollection(user.orgId, boardId).count().get();
      groupOrder = countSnap.data().count;
    }

    const docRef = groupsCollection(user.orgId, boardId).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      workspaceId: user.orgId,
      boardId,
      name: sanitizeText(name),
      color: color ?? null,
      order: groupOrder,
      isCollapsed: false,
      ...(parentItemId ? { parentItemId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const created = snapshotToData<DBGroup>(await docRef.get());
    touchBoardVersion(user.orgId, boardId);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'group',
      resourceId: docRef.id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error creating group for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to create group.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/groups/reorder   (must be registered BEFORE /:groupId)
// ---------------------------------------------------------------------------
export const reorderGroups = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId } = req.params;
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ message: 'order must be a non-empty array of { id, order } objects.' });
  }

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertBoardAccess(user, board, 'update', memberData);

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const item of order as { id: string; order: number }[]) {
      if (typeof item.id !== 'string' || typeof item.order !== 'number') {
        return res.status(400).json({ message: 'Each entry must have id (string) and order (number).' });
      }
      const ref = groupsCollection(user.orgId, boardId).doc(item.id);
      batch.update(ref, { order: item.order, updatedAt: timestamp });
    }
    await batch.commit();
    touchBoardVersion(user.orgId, boardId);

    res.json({ message: 'Groups reordered.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error reordering groups for board ${req.params.boardId}:`, err);
    res.status(500).json({ message: 'Failed to reorder groups.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/groups/:groupId
// ---------------------------------------------------------------------------
export const updateGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;
  const { name, color, isCollapsed, order } = req.body;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'update', board.createdBy, memberData, board.workspaceId);

    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (name !== undefined) updateData.name = sanitizeText(String(name));
    if (color !== undefined) updateData.color = color;
    if (isCollapsed !== undefined) updateData.isCollapsed = Boolean(isCollapsed);
    if (order !== undefined) updateData.order = Number(order);

    await groupsCollection(user.orgId, boardId).doc(groupId).update(updateData);
    touchBoardVersion(user.orgId, boardId);
    const updated = snapshotToData<DBGroup>(
      await groupsCollection(user.orgId, boardId).doc(groupId).get(),
    );

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(updated);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error updating group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Failed to update group.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /boards/:boardId/groups/:groupId
// ---------------------------------------------------------------------------
export const deleteGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'delete', board.createdBy, memberData, board.workspaceId);

    await groupsCollection(user.orgId, boardId).doc(groupId).delete();
    touchBoardVersion(user.orgId, boardId);
    void revokeWebhookForGroup(user.orgId, groupId);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error deleting group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Failed to delete group.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/groups/:groupId/archive
// ---------------------------------------------------------------------------
export const archiveGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'archive', board.createdBy, memberData, board.workspaceId);

    await groupsCollection(user.orgId, boardId).doc(groupId).update({
      isArchived: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    touchBoardVersion(user.orgId, boardId);
    void revokeWebhookForGroup(user.orgId, groupId);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ message: 'Group archived.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error archiving group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Failed to archive group.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:boardId/groups/:groupId/restore
// ---------------------------------------------------------------------------
export const restoreGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'archive', board.createdBy, memberData, board.workspaceId);

    await groupsCollection(user.orgId, boardId).doc(groupId).update({
      isArchived: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    touchBoardVersion(user.orgId, boardId);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const updated = snapshotToData<DBGroup>(await groupsCollection(user.orgId, boardId).doc(groupId).get());
    res.json(updated);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error restoring group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Failed to restore group.' });
  }
};

// ---------------------------------------------------------------------------
// POST /boards/:boardId/groups/:groupId/duplicate
// body: { withData: boolean }
// ---------------------------------------------------------------------------
export const duplicateGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;
  const withData = req.body?.withData === true;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'create', board.createdBy, memberData, board.workspaceId);

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const newGroupRef = groupsCollection(user.orgId, boardId).doc();
    await newGroupRef.set({
      id: newGroupRef.id,
      workspaceId: group.workspaceId,
      boardId,
      name: `${group.name} (copy)`,
      color: group.color ?? null,
      // Sits immediately after the source group without renumbering any others.
      order: (typeof group.order === 'number' ? group.order : 0) + 0.5,
      isCollapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (withData) {
      const itemsSnap = await itemsCollection(user.orgId)
        .where('boardId', '==', boardId)
        .where('groupId', '==', groupId)
        .where('isArchived', '==', false)
        .get();

      if (!itemsSnap.empty) {
        const BATCH_SIZE = 400;
        let batch = db.batch();
        let count = 0;

        for (const itemDoc of itemsSnap.docs) {
          const itemData = snapshotToData<DBItem>(itemDoc)!;
          const newItemRef = itemsCollection(user.orgId).doc();
          batch.set(newItemRef, {
            ...itemData,
            id: newItemRef.id,
            groupId: newGroupRef.id,
            createdBy: user.id,
            chatMessageCount: 0,
            chatLastMessageAt: null,
            chatSeenBy: {},
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          count++;
          if (count % BATCH_SIZE === 0) {
            await batch.commit();
            batch = db.batch();
          }
        }
        if (count % BATCH_SIZE !== 0) await batch.commit();
      }
    }

    touchBoardVersion(user.orgId, boardId);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'group',
      resourceId: newGroupRef.id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const created = snapshotToData<DBGroup>(await newGroupRef.get());
    res.status(201).json(created);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error duplicating group ${req.params.groupId}:`, err);
    res.status(500).json({ message: 'Failed to duplicate group.' });
  }
};
