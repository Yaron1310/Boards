import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { columnsCollection } from '../db/collections.js';
import { JwtUserPayload, DBColumn, ColumnType, StatusColumnSettings, DropdownColumnSettings, SimpleFormulaColumnSettings } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { logAudit, getClientIp } from '../services/audit.service.js';
import { assertColumnAccess, canAccessColumn } from '../utils/workManagementAuth.js';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

/**
 * Cast helper: snapshotToData / querySnapshotToArray use a recursive DeepWithDates<T>
 * transform which widens tuple types (e.g. SimpleFormulaColumnSettings.fields: [string,string]
 * becomes string[]).  This prevents direct assignability to DBColumn when ColumnSettings is a
 * discriminated union.  Since the data is Firestore-sourced and structurally correct at runtime,
 * the cast is safe.
 */
function asDBColumn(data: unknown): DBColumn {
  return data as unknown as DBColumn;
}

const VALID_COLUMN_TYPES = new Set<string>(Object.values(ColumnType));

/**
 * Validates that the settings object matches the expected shape for the given column type.
 * Returns an error message string if invalid, null if valid.
 */
function validateColumnSettings(type: ColumnType, settings: unknown): string | null {
  switch (type) {
    case ColumnType.STATUS: {
      const s = settings as StatusColumnSettings | null;
      if (!s || !Array.isArray(s.options) || s.options.length === 0) {
        return 'STATUS column requires settings.options — a non-empty array of { id, label, color }.';
      }
      for (const opt of s.options) {
        if (typeof opt.id !== 'string' || typeof opt.label !== 'string' || typeof opt.color !== 'string') {
          return 'Each STATUS option must have id (string), label (string), and color (string).';
        }
      }
      return null;
    }

    case ColumnType.DROPDOWN: {
      const s = settings as DropdownColumnSettings | null;
      if (!s || !Array.isArray(s.options)) {
        return 'DROPDOWN column requires settings.options array of { id, label }.';
      }
      if (typeof s.multiple !== 'boolean') {
        return 'DROPDOWN column requires settings.multiple (boolean).';
      }
      return null;
    }

    case ColumnType.SIMPLE_FORMULA: {
      const s = settings as SimpleFormulaColumnSettings | null;
      const validOps = ['add', 'subtract', 'multiply', 'divide'];
      if (!s || !validOps.includes(s.operation)) {
        return 'SIMPLE_FORMULA column requires settings.operation: "add" | "subtract" | "multiply" | "divide".';
      }
      if (!Array.isArray(s.fields) || s.fields.length !== 2 || !s.fields.every((f) => typeof f === 'string')) {
        return 'SIMPLE_FORMULA column requires settings.fields: exactly 2 columnId strings.';
      }
      return null;
    }

    default:
      // All other types have optional or no settings — pass through
      return null;
  }
}

// ---------------------------------------------------------------------------
// GET /columns
// ---------------------------------------------------------------------------
export const getColumns = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;

  try {
    const snapshot = await columnsCollection(user.orgId).get();
    const columns = querySnapshotToArray<DBColumn>(snapshot).filter((col) =>
      canAccessColumn(user, asDBColumn(col), 'read'),
    );

    res.json(columns);
  } catch (err: unknown) {
    logger.error('Error fetching columns:', err);
    res.status(500).json({ message: 'Failed to fetch columns.' });
  }
};

// ---------------------------------------------------------------------------
// GET /columns/:id
// ---------------------------------------------------------------------------
export const getColumnById = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await columnsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Column not found.' });

    const column = asDBColumn(snapshotToData<DBColumn>(doc));
    if (!column) return res.status(404).json({ message: 'Column not found.' });
    assertColumnAccess(user, column, 'read');

    res.json(column);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching column ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch column.' });
  }
};

// ---------------------------------------------------------------------------
// POST /columns
// ---------------------------------------------------------------------------
export const createColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { name, type, settings } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Column name is required.' });
  }
  if (!type || !VALID_COLUMN_TYPES.has(type)) {
    return res.status(400).json({
      message: `Invalid column type. Valid types: ${[...VALID_COLUMN_TYPES].join(', ')}.`,
    });
  }

  // Validate settings shape for types that require it
  const settingsError = validateColumnSettings(type as ColumnType, settings ?? null);
  if (settingsError) return res.status(400).json({ message: settingsError });

  try {
    // Build a provisional column to check permission
    const provisionalColumn: DBColumn = {
      id: '',
      organizationId: user.orgId,
      name: sanitizeText(name),
      type: type as ColumnType,
      settings: settings ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertColumnAccess(user, provisionalColumn, 'create');

    const docRef = columnsCollection(user.orgId).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      organizationId: user.orgId,
      name: sanitizeText(name),
      type: type as ColumnType,
      settings: settings ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const created = snapshotToData<DBColumn>(await docRef.get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'column',
      resourceId: docRef.id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(created);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error creating column:', err);
    res.status(500).json({ message: 'Failed to create column.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /columns/reorder   (must be registered BEFORE /:id to avoid route conflict)
// ---------------------------------------------------------------------------
export const reorderColumns = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ message: 'order must be a non-empty array of { id, order } objects.' });
  }

  try {
    // Verify the user has column update permission (ORGANIZATION_ADMIN+) by checking the first column
    const firstEntry = order[0] as { id: string; order: number };
    if (typeof firstEntry.id !== 'string') {
      return res.status(400).json({ message: 'Each entry must have id (string) and order (number).' });
    }
    const sampleDoc = await columnsCollection(user.orgId).doc(firstEntry.id).get();
    if (sampleDoc.exists) {
      const sampleColumn = asDBColumn(snapshotToData<DBColumn>(sampleDoc));
      if (sampleColumn) assertColumnAccess(user, sampleColumn, 'update');
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const item of order as { id: string; order: number }[]) {
      if (typeof item.id !== 'string' || typeof item.order !== 'number') {
        return res.status(400).json({ message: 'Each entry must have id (string) and order (number).' });
      }
      const ref = columnsCollection(user.orgId).doc(item.id);
      batch.update(ref, { order: item.order, updatedAt: timestamp });
    }
    await batch.commit();

    res.json({ message: 'Columns reordered.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error reordering columns:', err);
    res.status(500).json({ message: 'Failed to reorder columns.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /columns/:id
// ---------------------------------------------------------------------------
export const updateColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { name, settings } = req.body;

  try {
    const doc = await columnsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Column not found.' });

    const column = asDBColumn(snapshotToData<DBColumn>(doc));
    if (!column) return res.status(404).json({ message: 'Column not found.' });
    assertColumnAccess(user, column, 'update');

    // Validate updated settings against the existing (immutable) column type
    if (settings !== undefined) {
      const settingsError = validateColumnSettings(column.type, settings);
      if (settingsError) return res.status(400).json({ message: settingsError });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (name !== undefined) updateData.name = sanitizeText(String(name));
    if (settings !== undefined) updateData.settings = settings;

    await columnsCollection(user.orgId).doc(id).update(updateData);
    const updated = snapshotToData<DBColumn>(await columnsCollection(user.orgId).doc(id).get());

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'column',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(updated);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error updating column ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update column.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /columns/:id
// ---------------------------------------------------------------------------
export const deleteColumn = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await columnsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Column not found.' });

    const column = asDBColumn(snapshotToData<DBColumn>(doc));
    if (!column) return res.status(404).json({ message: 'Column not found.' });
    assertColumnAccess(user, column, 'delete');

    await columnsCollection(user.orgId).doc(id).delete();

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'column',
      resourceId: id,
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error deleting column ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to delete column.' });
  }
};
