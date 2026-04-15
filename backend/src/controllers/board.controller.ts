import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { boardsCollection, groupsCollection, organizationsCollection } from '../db/collections.js';
import { JwtUserPayload, DBBoard } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { logAudit, logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';
import { assertBoardAccess, canAccessBoard } from '../utils/workManagementAuth.js';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

// ---------------------------------------------------------------------------
// POST /boards
// ---------------------------------------------------------------------------
export const createBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { name, description, workspaceId, order } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Board name is required.' });
  }
  if (!workspaceId || typeof workspaceId !== 'string') {
    return res.status(400).json({ message: 'workspaceId is required.' });
  }

  try {
    // Validate workspaceId belongs to this organization (tenant boundary)
    const workspaceDoc = await organizationsCollection.doc(workspaceId).get();
    if (!workspaceDoc.exists || workspaceDoc.data()?.orgId !== user.orgId) {
      return res.status(400).json({ message: 'Invalid workspaceId: workspace not found in this organization.' });
    }

    // Build a provisional board to check create permission before writing
    const provisionalBoard: DBBoard = {
      id: '',
      organizationId: user.orgId,
      workspaceId,
      name: sanitizeText(name),
      order: typeof order === 'number' ? order : 0,
      createdBy: user.id,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertBoardAccess(user, provisionalBoard, 'create');

    // Auto-calculate order if not provided
    let boardOrder = typeof order === 'number' ? order : null;
    if (boardOrder === null) {
      const countSnap = await boardsCollection(user.orgId).count().get();
      boardOrder = countSnap.data().count;
    }

    const docRef = boardsCollection(user.orgId).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      organizationId: user.orgId,
      workspaceId,
      name: sanitizeText(name),
      description: description ? sanitizeText(description) : null,
      order: boardOrder,
      createdBy: user.id,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const created = snapshotToData<DBBoard>(await docRef.get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'board',
      resourceId: docRef.id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error creating board:', err);
    res.status(500).json({ message: 'Failed to create board.' });
  }
};

// ---------------------------------------------------------------------------
// GET /boards
// ---------------------------------------------------------------------------
export const getBoards = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { workspaceId, includeArchived } = req.query;

  try {
    let query: admin.firestore.Query = boardsCollection(user.orgId);

    if (workspaceId && typeof workspaceId === 'string') {
      query = query.where('workspaceId', '==', workspaceId);
    }
    if (includeArchived !== 'true') {
      query = query.where('isArchived', '==', false);
    }
    query = query.orderBy('order');

    const snapshot = await query.get();
    const boards = querySnapshotToArray<DBBoard>(snapshot).filter((b) =>
      canAccessBoard(user, b, 'read'),
    );

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'board',
      resourceId: 'list',
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(boards);
  } catch (err: unknown) {
    logger.error('Error fetching boards:', err);
    res.status(500).json({ message: 'Failed to fetch boards.' });
  }
};

// ---------------------------------------------------------------------------
// GET /boards/:id
// ---------------------------------------------------------------------------
export const getBoardById = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'read');

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'board',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(board);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch board.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:id
// ---------------------------------------------------------------------------
export const updateBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { name, description, order } = req.body;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'update');

    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (name !== undefined) updateData.name = sanitizeText(String(name));
    if (description !== undefined) updateData.description = description ? sanitizeText(String(description)) : null;
    if (order !== undefined) updateData.order = Number(order);

    await boardsCollection(user.orgId).doc(id).update(updateData);
    const updated = snapshotToData<DBBoard>(await boardsCollection(user.orgId).doc(id).get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(updated);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error updating board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update board.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:id/archive
// ---------------------------------------------------------------------------
export const archiveBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'archive');

    await boardsCollection(user.orgId).doc(id).update({
      isArchived: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ message: 'Board archived.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error archiving board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to archive board.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /boards/:id/restore
// ---------------------------------------------------------------------------
export const restoreBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'archive');

    await boardsCollection(user.orgId).doc(id).update({
      isArchived: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(snapshotToData<DBBoard>(await boardsCollection(user.orgId).doc(id).get()));
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error restoring board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to restore board.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /boards/:id   (hard-delete — ACADEMY_ADMIN+ only)
// ---------------------------------------------------------------------------
export const deleteBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'delete');

    // Batch-delete all groups under this board, then delete the board itself
    const groupsSnap = await groupsCollection(user.orgId, id).get();
    const batch = db.batch();
    groupsSnap.forEach((g: { ref: FirebaseFirestore.DocumentReference }) => batch.delete(g.ref));
    batch.delete(boardsCollection(user.orgId).doc(id));
    await batch.commit();

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'board',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error deleting board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to delete board.' });
  }
};
