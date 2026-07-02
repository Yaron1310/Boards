import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
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
// PATCH /personal-hub/columns/reorder  (registered BEFORE /:id to avoid conflict)
// body: { order: { id: string; order: number }[] }
// ---------------------------------------------------------------------------
export const reorderPersonalColumns = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ message: 'order must be a non-empty array of { id, order } objects.' });
  }

  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Verify ownership of every entry up front (fail fast on a genuinely
    // foreign column), but only batch-update ones that still exist by the
    // time we commit — a column can be deleted/replaced concurrently (e.g.
    // "change type" deletes the old column right after reordering), and a
    // stale id in the reorder payload shouldn't fail the whole request.
    const docs = await Promise.all(
      (order as { id: string; order: number }[]).map((entry) =>
        typeof entry.id === 'string' ? personalColumnsCollection(user.orgId).doc(entry.id).get() : null,
      ),
    );

    for (const entry of order as { id: string; order: number }[]) {
      if (typeof entry.id !== 'string' || typeof entry.order !== 'number') {
        return res.status(400).json({ message: 'Each entry must have id (string) and order (number).' });
      }
    }
    for (const doc of docs) {
      if (doc?.exists && doc.data()?.userId !== user.id) {
        return res.status(403).json({ message: 'Forbidden: one or more columns are not yours.' });
      }
    }

    const skippedIds = (order as { id: string; order: number }[])
      .filter((_, i) => !docs[i]?.exists)
      .map((entry) => entry.id);
    if (skippedIds.length > 0) {
      logger.warn('reorderPersonalColumns: skipping stale/missing column ids', { userId: user.id, skippedIds });
    }

    // Must use `db` (the named-database instance every other query here uses), not
    // admin.firestore() (the default database) — a batch from the wrong Firestore
    // instance commits against docs that don't exist there, throwing NOT_FOUND even
    // though the .get() checks above (correctly scoped via `db`) found them.
    const batch = db.batch();
    let updated = 0;
    (order as { id: string; order: number }[]).forEach((entry, i) => {
      if (docs[i]?.exists) {
        // set(..., { merge: true }) instead of update() — update() throws NOT_FOUND if
        // the document is deleted in the (tiny) window between the existence check above
        // and this commit; set-merge upserts, so a confirmed-existing doc can never
        // NOT_FOUND here, and it writes identical fields either way.
        batch.set(personalColumnsCollection(user.orgId).doc(entry.id), { order: entry.order, updatedAt: timestamp }, { merge: true });
        updated += 1;
      }
    });
    if (updated > 0) await batch.commit();

    res.json({ message: 'Personal columns reordered.', updated, skipped: skippedIds.length });
  } catch (err: unknown) {
    logger.error('Error reordering personal columns:', err, { userId: user.id, order });
    res.status(500).json({ message: 'Failed to reorder personal columns.' });
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
