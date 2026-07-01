import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { personalColumnsCollection, personalItemValuesCollection } from '../db/collections.js';
import { JwtUserPayload, DBPersonalColumn, DBPersonalItemValue, ColumnType } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';

const VALID_COLUMN_TYPES = new Set<string>(Object.values(ColumnType));

function personalValueDocId(userId: string, itemId: string): string {
  return `${userId}_${itemId}`;
}

// ---------------------------------------------------------------------------
// GET /personal-hub/columns
// ---------------------------------------------------------------------------
export const listPersonalColumns = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;

  try {
    const snapshot = await personalColumnsCollection(user.orgId)
      .where('userId', '==', user.id)
      .get();
    const columns = querySnapshotToArray<DBPersonalColumn>(snapshot)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    res.json(columns);
  } catch (err: unknown) {
    logger.error('Error fetching personal columns:', err);
    res.status(500).json({ message: 'Failed to fetch personal columns.' });
  }
};

// ---------------------------------------------------------------------------
// POST /personal-hub/columns
// ---------------------------------------------------------------------------
export const createPersonalColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { name, type, settings, scope, boardId } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Column name is required.' });
  }
  if (!type || !VALID_COLUMN_TYPES.has(type)) {
    return res.status(400).json({ message: `Invalid column type. Valid types: ${[...VALID_COLUMN_TYPES].join(', ')}.` });
  }
  if (scope !== 'board' && scope !== 'all') {
    return res.status(400).json({ message: "scope must be 'board' (this group only) or 'all' (all groups)." });
  }
  if (scope === 'board' && (!boardId || typeof boardId !== 'string')) {
    return res.status(400).json({ message: 'boardId is required when scope is "board".' });
  }

  try {
    const countSnap = await personalColumnsCollection(user.orgId)
      .where('userId', '==', user.id)
      .count()
      .get();
    const order = countSnap.data().count;

    const docRef = personalColumnsCollection(user.orgId).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      orgId: user.orgId,
      userId: user.id,
      name: sanitizeText(name),
      type: type as ColumnType,
      settings: settings ?? {},
      scope,
      ...(scope === 'board' ? { boardId } : {}),
      order,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const created = snapshotToData<DBPersonalColumn>(await docRef.get());
    res.status(201).json(created);
  } catch (err: unknown) {
    logger.error('Error creating personal column:', err);
    res.status(500).json({ message: 'Failed to create personal column.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /personal-hub/columns/:id
// ---------------------------------------------------------------------------
export const updatePersonalColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { name, settings, width } = req.body;

  try {
    const doc = await personalColumnsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Personal column not found.' });

    const column = snapshotToData<DBPersonalColumn>(doc);
    if (!column || column.userId !== user.id) {
      return res.status(403).json({ message: 'Forbidden: this is not your personal column.' });
    }

    const updateData: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (name !== undefined) updateData.name = sanitizeText(String(name));
    if (settings !== undefined) updateData.settings = settings;
    if (width !== undefined && typeof width === 'number' && width >= 50 && width <= 1000) {
      updateData.width = Math.round(width);
    }

    await personalColumnsCollection(user.orgId).doc(id).update(updateData);
    const updated = snapshotToData<DBPersonalColumn>(await personalColumnsCollection(user.orgId).doc(id).get());
    res.json(updated);
  } catch (err: unknown) {
    logger.error(`Error updating personal column ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update personal column.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /personal-hub/columns/:id
// ---------------------------------------------------------------------------
export const deletePersonalColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await personalColumnsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Personal column not found.' });

    const column = snapshotToData<DBPersonalColumn>(doc);
    if (!column || column.userId !== user.id) {
      return res.status(403).json({ message: 'Forbidden: this is not your personal column.' });
    }

    await personalColumnsCollection(user.orgId).doc(id).delete();
    res.status(204).send();
  } catch (err: unknown) {
    logger.error(`Error deleting personal column ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to delete personal column.' });
  }
};

// ---------------------------------------------------------------------------
// GET /personal-hub/item-values?itemIds=a,b,c
// Returns a map of itemId -> { [personalColumnId]: value } for the current user only.
// ---------------------------------------------------------------------------
export const getPersonalItemValues = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { itemIds } = req.query;

  if (!itemIds || typeof itemIds !== 'string') {
    return res.json({});
  }

  const ids = itemIds.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return res.json({});

  try {
    const refs = ids.map((itemId) => personalItemValuesCollection(user.orgId).doc(personalValueDocId(user.id, itemId)));
    const docs = await personalItemValuesCollection(user.orgId).firestore.getAll(...refs);

    const result: Record<string, Record<string, unknown>> = {};
    docs.forEach((doc, i) => {
      const data = snapshotToData<DBPersonalItemValue>(doc);
      result[ids[i]] = data?.values ?? {};
    });

    res.json(result);
  } catch (err: unknown) {
    logger.error('Error fetching personal item values:', err);
    res.status(500).json({ message: 'Failed to fetch personal item values.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /personal-hub/item-values/:itemId
// body: { columnId: string, value: unknown }
// ---------------------------------------------------------------------------
export const updatePersonalItemValue = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { itemId } = req.params;
  const { columnId, value } = req.body;

  if (!columnId || typeof columnId !== 'string') {
    return res.status(400).json({ message: 'columnId is required.' });
  }

  try {
    const column = await personalColumnsCollection(user.orgId).doc(columnId).get();
    if (!column.exists || column.data()?.userId !== user.id) {
      return res.status(403).json({ message: 'Forbidden: this is not your personal column.' });
    }

    const docId = personalValueDocId(user.id, itemId);
    const ref = personalItemValuesCollection(user.orgId).doc(docId);
    await ref.set(
      {
        id: docId,
        orgId: user.orgId,
        userId: user.id,
        itemId,
        values: { [columnId]: value ?? null },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const updated = snapshotToData<DBPersonalItemValue>(await ref.get());
    res.json(updated);
  } catch (err: unknown) {
    logger.error(`Error updating personal item value for item ${req.params.itemId}:`, err);
    res.status(500).json({ message: 'Failed to update personal item value.' });
  }
};
