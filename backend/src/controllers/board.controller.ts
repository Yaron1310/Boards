import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { boardsCollection, boardVersionsCollection, groupsCollection, columnsCollection, workspacesCollection, boardMembersCollection, itemsCollection, itemChatMessagesCollection } from '../db/collections.js';
import { JwtUserPayload, DBBoard, DBBoardMember, UserRole } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { logAudit, logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';
import { assertBoardAccess, canAccessBoard, effectiveBoardRole, isAtLeast } from '../utils/workManagementAuth.js';
import { revokeAllWebhooksForBoard } from '../services/webhook.service.js';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

// ---------------------------------------------------------------------------
// POST /boards
// ---------------------------------------------------------------------------
export const createBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { name, description, workspaceId: clientWorkspaceId, order, isTemplate, templateId, templateMode = 'full' } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Board name is required.' });
  }

  const validModes = ['columns_only', 'columns_groups', 'columns_groups_items', 'full'];
  if (templateId && !validModes.includes(templateMode)) {
    return res.status(400).json({ message: 'Invalid templateMode.' });
  }

  try {
    let effectiveWorkspaceId: string;

    if (isTemplate === true) {
      // Always use the templates workspace for template boards
      const templatesWsSnap = await workspacesCollection
        .where('orgId', '==', user.orgId)
        .where('isTemplates', '==', true)
        .limit(1)
        .get();
      if (templatesWsSnap.empty) {
        return res.status(400).json({ message: 'No templates workspace found for this organization.' });
      }
      effectiveWorkspaceId = templatesWsSnap.docs[0].id;
    } else {
      if (!clientWorkspaceId || typeof clientWorkspaceId !== 'string') {
        return res.status(400).json({ message: 'workspaceId is required.' });
      }
      const workspaceDoc = await workspacesCollection.doc(clientWorkspaceId).get();
      if (!workspaceDoc.exists || workspaceDoc.data()?.orgId !== user.orgId) {
        return res.status(400).json({ message: 'Invalid workspaceId: workspace not found in this organization.' });
      }
      if (workspaceDoc.data()?.isPersonal === true) {
        return res.status(400).json({ message: 'Boards cannot be created in a default workspace. Please select a real workspace.' });
      }
      if (workspaceDoc.data()?.isTemplates === true) {
        return res.status(400).json({ message: 'Regular boards cannot be created in the templates workspace.' });
      }
      effectiveWorkspaceId = clientWorkspaceId;
    }

    // Build a provisional board to check create permission before writing
    const provisionalBoard: DBBoard = {
      id: '',
      workspaceId: effectiveWorkspaceId,
      name: sanitizeText(name),
      order: typeof order === 'number' ? order : 0,
      createdBy: user.id,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertBoardAccess(user, provisionalBoard, 'create');

    // New boards default to the front of their workspace's list: shift every
    // existing board in this workspace down by one and give the new board order 0.
    let boardOrder = typeof order === 'number' ? order : null;
    if (boardOrder === null) {
      const siblingsSnap = await boardsCollection(user.orgId)
        .where('workspaceId', '==', effectiveWorkspaceId)
        .get();
      if (!siblingsSnap.empty) {
        const shiftBatch = db.batch();
        const shiftTimestamp = admin.firestore.FieldValue.serverTimestamp();
        siblingsSnap.docs.forEach((d) => {
          const currentOrder = (d.data() as DBBoard).order ?? 0;
          shiftBatch.update(d.ref, { order: currentOrder + 1, updatedAt: shiftTimestamp });
        });
        await shiftBatch.commit();
      }
      boardOrder = 0;
    }

    const docRef = boardsCollection(user.orgId).doc();
    const newBoardId = docRef.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: newBoardId,
      workspaceId: effectiveWorkspaceId,
      name: sanitizeText(name),
      description: description ? sanitizeText(description) : null,
      order: boardOrder,
      createdBy: user.id,
      isArchived: false,
      ...(isTemplate === true ? { isTemplate: true } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Copy data from template if provided
    if (templateId && typeof templateId === 'string') {
      const tmplDoc = await boardsCollection(user.orgId).doc(templateId).get();
      if (tmplDoc.exists) {
        const colsSnap = await columnsCollection(user.orgId, templateId).get();
        if (!colsSnap.empty) {
          const colBatch = db.batch();
          colsSnap.docs.forEach((colDoc) => {
            colBatch.set(columnsCollection(user.orgId, newBoardId).doc(colDoc.id), { ...colDoc.data(), boardId: newBoardId });
          });
          await colBatch.commit();
        }

        if (templateMode === 'columns_groups' || templateMode === 'columns_groups_items' || templateMode === 'full') {
          const groupsSnap = await groupsCollection(user.orgId, templateId).get();
          const groupIdMap = new Map<string, string>();
          if (!groupsSnap.empty) {
            const groupBatch = db.batch();
            groupsSnap.docs.forEach((groupDoc) => {
              const newGroupRef = groupsCollection(user.orgId, newBoardId).doc();
              groupIdMap.set(groupDoc.id, newGroupRef.id);
              groupBatch.set(newGroupRef, { ...groupDoc.data(), id: newGroupRef.id, boardId: newBoardId });
            });
            await groupBatch.commit();
          }

          if (templateMode === 'columns_groups_items' || templateMode === 'full') {
            const itemsSnap = await itemsCollection(user.orgId).where('boardId', '==', templateId).get();
            if (!itemsSnap.empty) {
              const BATCH_SIZE = 400;
              let itemBatch = db.batch();
              let count = 0;
              for (const itemDoc of itemsSnap.docs) {
                const itemData = itemDoc.data();
                const newItemRef = itemsCollection(user.orgId).doc();
                itemBatch.set(newItemRef, {
                  ...itemData,
                  id: newItemRef.id,
                  boardId: newBoardId,
                  groupId: groupIdMap.get(itemData.groupId) ?? itemData.groupId,
                  workspaceId: effectiveWorkspaceId,
                  ...(templateMode === 'columns_groups_items' ? { values: {} } : {}),
                  createdAt: timestamp,
                  updatedAt: timestamp,
                });
                count++;
                if (count % BATCH_SIZE === 0) { await itemBatch.commit(); itemBatch = db.batch(); }
              }
              if (count % BATCH_SIZE !== 0) await itemBatch.commit();
            }
          }
        }
      }
    }

    const created = snapshotToData<DBBoard>(await docRef.get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'board',
      resourceId: newBoardId,
      workspaceId: user.orgId,
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
  const { workspaceId, includeArchived, isTemplate } = req.query;

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
      canAccessBoard(user, b, 'read') && (isTemplate === 'true' ? b.isTemplate === true : b.isTemplate !== true),
    );

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'board',
      resourceId: 'list',
      workspaceId: user.orgId,
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
// PATCH /boards/reorder   (must be registered BEFORE /:id)
// body: { workspaceId: string; order: { id: string; order: number }[] }
// Restricted to ORGANIZATION_ADMIN+ — reordering spans the whole WorkHub, not
// a single board, so the per-board admin role model doesn't apply here.
// ---------------------------------------------------------------------------
export const reorderBoards = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { workspaceId, order } = req.body;

  if (!workspaceId || typeof workspaceId !== 'string') {
    return res.status(400).json({ message: 'workspaceId is required.' });
  }
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ message: 'order must be a non-empty array of { id, order } objects.' });
  }
  if (!isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) {
    return res.status(403).json({ message: 'Forbidden: only organization admins can reorder boards.' });
  }

  try {
    const boardsSnap = await boardsCollection(user.orgId).where('workspaceId', '==', workspaceId).get();
    const validIds = new Set(boardsSnap.docs.map((d) => d.id));

    for (const item of order as { id: string; order: number }[]) {
      if (typeof item.id !== 'string' || typeof item.order !== 'number') {
        return res.status(400).json({ message: 'Each entry must have id (string) and order (number).' });
      }
      if (!validIds.has(item.id)) {
        return res.status(400).json({ message: `Board "${item.id}" does not belong to workspace "${workspaceId}".` });
      }
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    for (const item of order as { id: string; order: number }[]) {
      batch.update(boardsCollection(user.orgId).doc(item.id), { order: item.order, updatedAt: timestamp });
    }
    await batch.commit();

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: 'reorder',
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ message: 'Boards reordered.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error reordering boards:', err);
    res.status(500).json({ message: 'Failed to reorder boards.' });
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

    const memberDoc = await boardMembersCollection(user.orgId, id).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertBoardAccess(user, board, 'read', memberData);

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'board',
      resourceId: id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const userBoardRole = effectiveBoardRole(user, board, memberData);
    res.json({ ...board, userBoardRole });
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
  const { name, description, order, workspaceId: newWorkspaceId } = req.body;

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

    // Handle workspace move
    if (newWorkspaceId !== undefined && newWorkspaceId !== board.workspaceId) {
      if (typeof newWorkspaceId !== 'string' || !newWorkspaceId) {
        return res.status(400).json({ message: 'Invalid workspaceId.' });
      }
      const wsDoc = await workspacesCollection.doc(newWorkspaceId).get();
      if (!wsDoc.exists || (wsDoc.data() as { orgId?: string })?.orgId !== user.orgId) {
        return res.status(400).json({ message: 'Target WorkHub not found in this organization.' });
      }
      updateData.workspaceId = newWorkspaceId;

      // Batch-update denormalized workspaceId on all items belonging to this board
      const itemsSnap = await itemsCollection(user.orgId).where('boardId', '==', id).get();
      if (!itemsSnap.empty) {
        const BATCH_SIZE = 400;
        const docs = itemsSnap.docs;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          docs.slice(i, i + BATCH_SIZE).forEach((d) => {
            batch.update(d.ref, { workspaceId: newWorkspaceId });
          });
          await batch.commit();
        }
      }
    }

    await boardsCollection(user.orgId).doc(id).update(updateData);
    const updated = snapshotToData<DBBoard>(await boardsCollection(user.orgId).doc(id).get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: id,
      workspaceId: user.orgId,
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
    void revokeAllWebhooksForBoard(user.orgId, id);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'board',
      resourceId: id,
      workspaceId: user.orgId,
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
      workspaceId: user.orgId,
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
// DELETE /boards/:id   (hard-delete — ORGANIZATION_ADMIN+ only)
// ---------------------------------------------------------------------------
export const deleteBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'delete');

    // Cascade-delete everything that belongs to this board so nothing is left
    // orphaned: groups, columns, board members, items, and each item's chat
    // messages — then the board doc itself.
    const [groupsSnap, columnsSnap, membersSnap, itemsSnap] = await Promise.all([
      groupsCollection(user.orgId, id).get(),
      columnsCollection(user.orgId, id).get(),
      boardMembersCollection(user.orgId, id).get(),
      itemsCollection(user.orgId).where('boardId', '==', id).get(),
    ]);

    const chatMessageRefs: FirebaseFirestore.DocumentReference[] = [];
    for (const itemDoc of itemsSnap.docs) {
      const chatSnap = await itemChatMessagesCollection(user.orgId, itemDoc.id).get();
      chatSnap.forEach((m) => chatMessageRefs.push(m.ref));
    }

    const refsToDelete: FirebaseFirestore.DocumentReference[] = [
      ...chatMessageRefs,
      ...itemsSnap.docs.map((d) => d.ref),
      ...columnsSnap.docs.map((d) => d.ref),
      ...membersSnap.docs.map((d) => d.ref),
      ...groupsSnap.docs.map((d) => d.ref),
      boardsCollection(user.orgId).doc(id),
    ];

    const BATCH_SIZE = 400;
    for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
      const batch = db.batch();
      refsToDelete.slice(i, i + BATCH_SIZE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    void revokeAllWebhooksForBoard(user.orgId, id);

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'board',
      resourceId: id,
      workspaceId: user.orgId,
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

// ---------------------------------------------------------------------------
// POST /boards/:id/duplicate
// body: { mode: 'columns_only' | 'columns_groups' | 'columns_groups_items' | 'full' }
// ---------------------------------------------------------------------------
export const duplicateBoard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { mode = 'full' } = req.body;

  const validModes = ['columns_only', 'columns_groups', 'columns_groups_items', 'full'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ message: 'Invalid mode.' });
  }

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'create');

    const countSnap = await boardsCollection(user.orgId).count().get();
    const newRef = boardsCollection(user.orgId).doc();
    const newBoardId = newRef.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await newRef.set({
      id: newBoardId,
      workspaceId: board.workspaceId,
      name: `Copy of ${board.name}`,
      description: board.description ?? null,
      order: countSnap.data().count,
      createdBy: user.id,
      isArchived: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Always copy columns
    const colsSnap = await columnsCollection(user.orgId, id).get();
    if (!colsSnap.empty) {
      const colBatch = db.batch();
      colsSnap.docs.forEach((colDoc) => {
        const newColRef = columnsCollection(user.orgId, newBoardId).doc(colDoc.id);
        colBatch.set(newColRef, { ...colDoc.data(), boardId: newBoardId });
      });
      await colBatch.commit();
    }

    if (mode === 'columns_groups' || mode === 'columns_groups_items' || mode === 'full') {
      const groupsSnap = await groupsCollection(user.orgId, id).get();
      const groupIdMap = new Map<string, string>();

      if (!groupsSnap.empty) {
        const groupBatch = db.batch();
        groupsSnap.docs.forEach((groupDoc) => {
          const newGroupRef = groupsCollection(user.orgId, newBoardId).doc();
          groupIdMap.set(groupDoc.id, newGroupRef.id);
          groupBatch.set(newGroupRef, { ...groupDoc.data(), id: newGroupRef.id, boardId: newBoardId });
        });
        await groupBatch.commit();
      }

      if (mode === 'columns_groups_items' || mode === 'full') {
        const itemsSnap = await itemsCollection(user.orgId).where('boardId', '==', id).get();
        if (!itemsSnap.empty) {
          const BATCH_SIZE = 400;
          let itemBatch = db.batch();
          let count = 0;

          for (const itemDoc of itemsSnap.docs) {
            const itemData = itemDoc.data();
            const newItemRef = itemsCollection(user.orgId).doc();
            const newGroupId = groupIdMap.get(itemData.groupId) ?? itemData.groupId;
            itemBatch.set(newItemRef, {
              ...itemData,
              id: newItemRef.id,
              boardId: newBoardId,
              groupId: newGroupId,
              ...(mode === 'columns_groups_items' ? { values: {} } : {}),
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            count++;
            if (count % BATCH_SIZE === 0) {
              await itemBatch.commit();
              itemBatch = db.batch();
            }
          }
          if (count % BATCH_SIZE !== 0) await itemBatch.commit();
        }
      }
    }

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'board',
      resourceId: newBoardId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(snapshotToData<DBBoard>(await newRef.get()));
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error duplicating board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to duplicate board.' });
  }
};

// ---------------------------------------------------------------------------
// POST /boards/:id/save-as-template
// body: { name?: string; mode: 'columns_only' | 'columns_groups' | 'columns_groups_items' | 'full' }
// ---------------------------------------------------------------------------
export const saveAsTemplate = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { name, mode = 'full' } = req.body;

  const validModes = ['columns_only', 'columns_groups', 'columns_groups_items', 'full'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ message: 'Invalid mode.' });
  }

  try {
    const doc = await boardsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(doc)!;
    assertBoardAccess(user, board, 'create');

    // Use the dedicated templates workspace
    const templatesWsSnap = await workspacesCollection
      .where('orgId', '==', user.orgId)
      .where('isTemplates', '==', true)
      .limit(1)
      .get();
    const templateWorkspaceId = templatesWsSnap.empty ? board.workspaceId : templatesWsSnap.docs[0].id;

    const countSnap = await boardsCollection(user.orgId).count().get();
    const newRef = boardsCollection(user.orgId).doc();
    const newBoardId = newRef.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await newRef.set({
      id: newBoardId,
      workspaceId: templateWorkspaceId,
      name: name ? sanitizeText(String(name)) : board.name,
      description: board.description ?? null,
      order: countSnap.data().count,
      createdBy: user.id,
      isArchived: false,
      isTemplate: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Always copy columns
    const colsSnap = await columnsCollection(user.orgId, id).get();
    if (!colsSnap.empty) {
      const colBatch = db.batch();
      colsSnap.docs.forEach((colDoc) => {
        const newColRef = columnsCollection(user.orgId, newBoardId).doc(colDoc.id);
        colBatch.set(newColRef, { ...colDoc.data(), boardId: newBoardId });
      });
      await colBatch.commit();
    }

    if (mode === 'columns_groups' || mode === 'columns_groups_items' || mode === 'full') {
      const groupsSnap = await groupsCollection(user.orgId, id).get();
      const groupIdMap = new Map<string, string>();

      if (!groupsSnap.empty) {
        const groupBatch = db.batch();
        groupsSnap.docs.forEach((groupDoc) => {
          const newGroupRef = groupsCollection(user.orgId, newBoardId).doc();
          groupIdMap.set(groupDoc.id, newGroupRef.id);
          groupBatch.set(newGroupRef, { ...groupDoc.data(), id: newGroupRef.id, boardId: newBoardId });
        });
        await groupBatch.commit();
      }

      if (mode === 'columns_groups_items' || mode === 'full') {
        const itemsSnap = await itemsCollection(user.orgId).where('boardId', '==', id).get();
        if (!itemsSnap.empty) {
          const BATCH_SIZE = 400;
          let itemBatch = db.batch();
          let count = 0;

          for (const itemDoc of itemsSnap.docs) {
            const itemData = itemDoc.data();
            const newItemRef = itemsCollection(user.orgId).doc();
            const newGroupId = groupIdMap.get(itemData.groupId) ?? itemData.groupId;
            itemBatch.set(newItemRef, {
              ...itemData,
              id: newItemRef.id,
              boardId: newBoardId,
              groupId: newGroupId,
              ...(mode === 'columns_groups_items' ? { values: {} } : {}),
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            count++;
            if (count % BATCH_SIZE === 0) {
              await itemBatch.commit();
              itemBatch = db.batch();
            }
          }
          if (count % BATCH_SIZE !== 0) await itemBatch.commit();
        }
      }
    }

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'board',
      resourceId: newBoardId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(snapshotToData<DBBoard>(await newRef.get()));
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error saving board as template ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to save as template.' });
  }
};

// ---------------------------------------------------------------------------
// GET /boards/:id/version
// ---------------------------------------------------------------------------
export const getBoardVersion = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(id).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });

    const board = snapshotToData<DBBoard>(boardDoc)!;
    assertBoardAccess(user, board, 'read');

    const versionDoc = await boardVersionsCollection(user.orgId).doc(id).get();
    const raw = versionDoc.exists ? versionDoc.data()?.lastUpdatedAt : null;
    const lastUpdatedAt: string | null = raw?.toDate?.()?.toISOString?.() ?? null;

    res.json({ lastUpdatedAt });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching board version ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch board version.' });
  }
};
