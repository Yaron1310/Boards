import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { formsCollection, itemsCollection } from '../db/collections.js';
import {
  JwtUserPayload,
  UserRole,
  DBForm,
  DBFormField,
  DBFormFieldOption,
  DBFormResponse,
  DBItem,
  FormFieldType,
  ColumnType,
} from '../types/index.js';
import { isAtLeast } from '../utils/workManagementAuth.js';
import { logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';
import { isCompatibleColumnType } from '../utils/formColumnSync.js';

const MAX_FIELDS = 50;
const MAX_OPTIONS = 50;
const MAX_LABEL_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

const FIELD_TYPES: FormFieldType[] = Object.values(FormFieldType);

/** Field types whose answers come from a fixed option list. */
const OPTION_FIELD_TYPES = new Set<FormFieldType>([
  FormFieldType.DROPDOWN,
  FormFieldType.SINGLE_SELECT,
  FormFieldType.MULTI_SELECT,
]);

/**
 * Forms are an administrative surface, gated like Templates: WorkHub admins and
 * org admins author them and read their results. Everyone else can still fill in
 * a form that an admin has attached to an item.
 */
function canManageForms(user: JwtUserPayload): boolean {
  return isAtLeast(user.role, UserRole.WORKSPACE_ADMIN);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validates and normalizes the incoming fields array. Returns either the
 * sanitized fields or an error message to send back as a 400.
 */
function sanitizeFields(raw: unknown): { fields: DBFormField[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: 'fields must be an array.' };
  if (raw.length === 0) return { error: 'A form needs at least one field.' };
  if (raw.length > MAX_FIELDS) return { error: `A form may have at most ${MAX_FIELDS} fields.` };

  const fields: DBFormField[] = [];
  const seenIds = new Set<string>();

  for (const [i, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object') return { error: `fields[${i}]: must be an object.` };
    const f = entry as Record<string, unknown>;

    if (!FIELD_TYPES.includes(f.type as FormFieldType)) return { error: `fields[${i}]: invalid type.` };
    const type = f.type as FormFieldType;

    if (typeof f.label !== 'string' || !f.label.trim()) return { error: `fields[${i}]: label is required.` };
    const label = f.label.trim().slice(0, MAX_LABEL_LENGTH);

    // Preserve client-supplied ids so saved answers keep pointing at their field
    // across edits; mint one when a field is new or its id collides.
    let id = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : makeId('fld');
    if (seenIds.has(id)) id = makeId('fld');
    seenIds.add(id);

    const field: DBFormField = { id, type, label };

    if (typeof f.description === 'string' && f.description.trim()) {
      field.description = f.description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    }
    if (typeof f.placeholder === 'string' && f.placeholder.trim()) {
      field.placeholder = f.placeholder.trim().slice(0, MAX_LABEL_LENGTH);
    }
    if (f.required === true) field.required = true;

    if (typeof f.linkedColumnType === 'string') {
      const columnType = f.linkedColumnType as ColumnType;
      if (!isCompatibleColumnType(type, columnType)) {
        return { error: `fields[${i}]: "${label}" can't be connected to a ${columnType} column.` };
      }
      field.linkedColumnType = columnType;
    }

    if (OPTION_FIELD_TYPES.has(type)) {
      if (!Array.isArray(f.options) || f.options.length === 0) {
        return { error: `fields[${i}]: "${label}" needs at least one option.` };
      }
      if (f.options.length > MAX_OPTIONS) {
        return { error: `fields[${i}]: at most ${MAX_OPTIONS} options allowed.` };
      }
      const options: DBFormFieldOption[] = [];
      const seenOptionIds = new Set<string>();
      for (const [oi, rawOption] of (f.options as unknown[]).entries()) {
        if (!rawOption || typeof rawOption !== 'object') return { error: `fields[${i}].options[${oi}]: must be an object.` };
        const o = rawOption as Record<string, unknown>;
        if (typeof o.label !== 'string' || !o.label.trim()) {
          return { error: `fields[${i}].options[${oi}]: label is required.` };
        }
        let optionId = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : makeId('opt');
        if (seenOptionIds.has(optionId)) optionId = makeId('opt');
        seenOptionIds.add(optionId);
        options.push({ id: optionId, label: o.label.trim().slice(0, MAX_LABEL_LENGTH) });
      }
      field.options = options;
    }

    fields.push(field);
  }

  return { fields };
}

// ---------------------------------------------------------------------------
// GET /forms
// ---------------------------------------------------------------------------
export const listForms = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const includeArchived = req.query.includeArchived === 'true';

  try {
    const snap = await formsCollection(user.orgId).orderBy('createdAt', 'asc').get();
    const all = querySnapshotToArray<DBForm>(snap);
    res.json(includeArchived ? all.filter(f => f.isArchived) : all.filter(f => !f.isArchived));
  } catch (err) {
    logger.error('listForms error:', err);
    res.status(500).json({ message: 'Failed to list forms.' });
  }
};

// ---------------------------------------------------------------------------
// GET /forms/:id
// ---------------------------------------------------------------------------
export const getForm = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;

  try {
    const snap = await formsCollection(user.orgId).doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ message: 'Form not found.' });
    res.json({ id: snap.id, ...snap.data() });
  } catch (err) {
    logger.error(`getForm error for ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch form.' });
  }
};

// ---------------------------------------------------------------------------
// POST /forms
// ---------------------------------------------------------------------------
export const createForm = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!canManageForms(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { name, description, fields } = req.body as Record<string, unknown>;

  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name is required.' });

  const sanitized = sanitizeFields(fields);
  if ('error' in sanitized) return res.status(400).json({ message: sanitized.error });

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = formsCollection(user.orgId).doc();
    const form: Omit<DBForm, 'id'> = {
      name: name.trim().slice(0, MAX_LABEL_LENGTH),
      ...(typeof description === 'string' && description.trim()
        ? { description: description.trim().slice(0, MAX_DESCRIPTION_LENGTH) }
        : {}),
      fields: sanitized.fields,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
    };
    await docRef.set(form);

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'CREATE',
      resourceType: 'form', resourceId: docRef.id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json({ id: docRef.id, ...form });
  } catch (err) {
    logger.error('createForm error:', err);
    res.status(500).json({ message: 'Failed to create form.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /forms/:id
// ---------------------------------------------------------------------------
export const updateForm = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!canManageForms(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { id } = req.params;
  const { name, description, fields } = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name must be a non-empty string.' });
    patch.name = name.trim().slice(0, MAX_LABEL_LENGTH);
  }
  if (description !== undefined) {
    if (typeof description !== 'string') return res.status(400).json({ message: 'description must be a string.' });
    // An emptied description is stored as '' rather than deleted so the client
    // round-trip stays a plain overwrite.
    patch.description = description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  }
  if (fields !== undefined) {
    const sanitized = sanitizeFields(fields);
    if ('error' in sanitized) return res.status(400).json({ message: sanitized.error });
    patch.fields = sanitized.fields;
  }

  try {
    const docRef = formsCollection(user.orgId).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'Form not found.' });

    await docRef.update(patch);

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'UPDATE',
      resourceType: 'form', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ ...(snap.data() as DBForm), ...patch, id });
  } catch (err) {
    logger.error(`updateForm error for ${id}:`, err);
    res.status(500).json({ message: 'Failed to update form.' });
  }
};

/**
 * Every item this form is currently attached to (i.e. has an active, non-detached
 * response doc), across the whole org. Mirrors listFormResponses' collection-group
 * query, filtered down to attachments still "on" an item.
 */
async function findAttachedItems(
  orgId: string,
  formId: string,
): Promise<{ doc: FirebaseFirestore.QueryDocumentSnapshot; itemId: string }[]> {
  const orgItemsPrefix = `organizations/${orgId}/items/`;
  const snap = await db.collectionGroup('formResponses').where('formId', '==', formId).get();
  return snap.docs
    .filter(d => d.ref.path.startsWith(orgItemsPrefix) && !(d.data() as DBFormResponse).detachedAt)
    .map(doc => ({ doc, itemId: (doc.data() as DBFormResponse).itemId }));
}

// ---------------------------------------------------------------------------
// PATCH /forms/:id/archive  |  PATCH /forms/:id/restore
//
// Archiving asks for confirmation first if the form is attached to any item —
// req.body.confirm must be true to proceed once the caller has seen that list.
// Confirmed archiving then detaches the form from every one of those items, the
// same way a manual per-item removal would: a submitted response is kept (so it
// still shows in the form's results) but marked detached, an unsubmitted one is
// just discarded.
// ---------------------------------------------------------------------------
async function setArchived(req: Request, res: Response, isArchived: boolean) {
  const user = req.user as JwtUserPayload;
  if (!canManageForms(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { id } = req.params;
  try {
    const docRef = formsCollection(user.orgId).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'Form not found.' });

    if (isArchived) {
      const attached = await findAttachedItems(user.orgId, id);

      if (attached.length > 0 && req.body?.confirm !== true) {
        const itemIds = [...new Set(attached.map(a => a.itemId))];
        const itemSnaps = await Promise.all(itemIds.map(itemId => itemsCollection(user.orgId).doc(itemId).get()));
        return res.status(409).json({
          message: 'This form is attached to items. Archiving will remove it from them.',
          // Reuses the app-wide "archive with dependencies" contract (see e.g.
          // organization/workspace archive) so the client's existing 409 handling
          // and confirm-with-dependencies UI apply here unchanged.
          dependencies: {
            items: itemSnaps.filter(s => s.exists).map(s => ({ id: s.id, name: (s.data() as DBItem).name })),
          },
        });
      }

      if (attached.length > 0) {
        const now = admin.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        const affectedItemIds = new Set<string>();
        for (const { doc, itemId } of attached) {
          const data = doc.data() as DBFormResponse;
          if (data.submittedAt) {
            batch.update(doc.ref, { detachedAt: now });
          } else {
            batch.delete(doc.ref);
          }
          affectedItemIds.add(itemId);
        }
        for (const itemId of affectedItemIds) {
          batch.update(itemsCollection(user.orgId).doc(itemId), {
            formResponseCount: admin.firestore.FieldValue.increment(-1),
            formSubmitted: false,
            updatedAt: now,
          });
        }
        await batch.commit();
      }
    }

    await docRef.update({ isArchived, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'UPDATE',
      resourceType: 'form', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    if (isArchived) return res.status(204).send();
    res.json({ ...(snap.data() as DBForm), id, isArchived: false });
  } catch (err) {
    logger.error(`setArchived(${isArchived}) error for form ${id}:`, err);
    res.status(500).json({ message: `Failed to ${isArchived ? 'archive' : 'restore'} form.` });
  }
}

export const archiveForm = (req: Request, res: Response) => setArchived(req, res, true);
export const restoreForm = (req: Request, res: Response) => setArchived(req, res, false);

// ---------------------------------------------------------------------------
// DELETE /forms/:id
//
// Hard delete of the definition only. Responses already filled in on items keep
// their denormalized formName and stored answers, so an item's history survives
// a deleted form.
// ---------------------------------------------------------------------------
export const deleteForm = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
  }

  const { id } = req.params;
  try {
    const docRef = formsCollection(user.orgId).doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'Form not found.' });

    await docRef.delete();

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'DELETE',
      resourceType: 'form', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(204).send();
  } catch (err) {
    logger.error(`deleteForm error for ${id}:`, err);
    res.status(500).json({ message: 'Failed to delete form.' });
  }
};

// ---------------------------------------------------------------------------
// GET /forms/:id/responses
//
// Every answer set collected for this form, across all items in the org.
//
// Responses live in per-item subcollections, so this is a collection-group query
// filtered by formId. Firestore collection groups span the whole database, so
// results are additionally filtered to documents under this org's items path —
// tenant isolation never rests on formIds being unique.
// ---------------------------------------------------------------------------
const MAX_RESPONSES = 500;

export const listFormResponses = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!canManageForms(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { id } = req.params;

  try {
    const formSnap = await formsCollection(user.orgId).doc(id).get();
    if (!formSnap.exists) return res.status(404).json({ message: 'Form not found.' });

    const snap = await db
      .collectionGroup('formResponses')
      .where('formId', '==', id)
      .limit(MAX_RESPONSES)
      .get();

    const orgItemsPrefix = `organizations/${user.orgId}/items/`;
    // Drafts are personal scratch space for whoever is filling the form in — they're
    // never sent to the server at all now, but older rows saved before that change (or
    // any future data that slips through) must still never surface here. Only a
    // submitted response is a record other people are allowed to see.
    const docs = snap.docs.filter(
      d => d.ref.path.startsWith(orgItemsPrefix) && !!(d.data() as DBFormResponse).submittedAt,
    );

    // Item names for display — one read per distinct item, deduplicated.
    const itemIds = [...new Set(docs.map(d => (d.data() as DBFormResponse).itemId).filter(Boolean))];
    const itemSnaps = await Promise.all(itemIds.map(itemId => itemsCollection(user.orgId).doc(itemId).get()));
    const itemNames = new Map<string, string>();
    itemSnaps.forEach((itemSnap, i) => {
      if (itemSnap.exists) itemNames.set(itemIds[i], (itemSnap.data() as DBItem).name);
    });

    // snapshotToData converts Firestore Timestamps to Dates, so the client receives
    // ISO strings like every other endpoint rather than raw {_seconds} objects.
    const millis = (value: unknown): number =>
      value instanceof Date ? value.getTime() : 0;

    const responses = docs
      .map(d => {
        const response = snapshotToData<DBFormResponse>(d)!;
        return { response, itemId: response.itemId, itemName: itemNames.get(response.itemId) ?? null };
      })
      // Every row here is submitted (drafts are filtered out above) — newest first.
      .sort((a, b) => {
        const aTime = millis(a.response.submittedAt) || millis(a.response.updatedAt);
        const bTime = millis(b.response.submittedAt) || millis(b.response.updatedAt);
        return bTime - aTime;
      });

    res.json({
      form: snapshotToData<DBForm>(formSnap),
      responses,
      truncated: snap.size >= MAX_RESPONSES,
    });
  } catch (err) {
    logger.error(`listFormResponses error for form ${id}:`, err);
    res.status(500).json({ message: 'Failed to fetch form results.' });
  }
};
