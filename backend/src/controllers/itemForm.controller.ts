import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import {
  itemsCollection,
  itemFormResponsesCollection,
  boardMembersCollection,
  formsCollection,
  usersCollection,
} from '../db/collections.js';
import {
  JwtUserPayload,
  DBItem,
  DBUser,
  DBBoardMember,
  DBForm,
  DBFormField,
  DBFormResponse,
  FormAnswerValue,
  FormFieldType,
} from '../types/index.js';
import { assertItemAccess } from '../utils/workManagementAuth.js';

const MAX_TEXT_ANSWER_LENGTH = 5000;

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

/**
 * Loads the item and asserts the caller may perform `op` on it. Throws the same
 * `{ status, message }` shape the chat controller uses.
 */
async function loadItemWithAccess(
  user: JwtUserPayload,
  itemId: string,
  op: 'read' | 'update',
): Promise<DBItem> {
  const doc = await itemsCollection(user.orgId).doc(itemId).get();
  if (!doc.exists) throw { status: 404, message: 'Item not found.' };

  const item = snapshotToData<DBItem>(doc)!;
  const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
  const memberData = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
  assertItemAccess(user, item, op, memberData);
  return item;
}

/**
 * Coerces one submitted answer to the shape its field type stores, or returns an
 * error message. Firestore is schemaless, so this is the gatekeeper: anything
 * not explicitly handled here never reaches the document.
 */
function sanitizeAnswer(field: DBFormField, raw: unknown): { value: FormAnswerValue } | { error: string } {
  const isBlank = raw === null || raw === undefined || raw === '';

  switch (field.type) {
    case FormFieldType.SHORT_TEXT:
    case FormFieldType.LONG_TEXT:
    case FormFieldType.EMAIL:
    case FormFieldType.PHONE: {
      if (isBlank) return { value: '' };
      if (typeof raw !== 'string') return { error: `"${field.label}" must be text.` };
      return { value: raw.slice(0, MAX_TEXT_ANSWER_LENGTH) };
    }

    case FormFieldType.DATE: {
      if (isBlank) return { value: '' };
      if (typeof raw !== 'string') return { error: `"${field.label}" must be a date string.` };
      // Stored as the ISO yyyy-mm-dd the <input type="date"> produces — keeps the
      // answer timezone-free and directly comparable as a string.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: `"${field.label}" must be a YYYY-MM-DD date.` };
      return { value: raw };
    }

    case FormFieldType.NUMBER: {
      if (isBlank) return { value: null };
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (typeof n !== 'number' || Number.isNaN(n)) return { error: `"${field.label}" must be a number.` };
      return { value: n };
    }

    case FormFieldType.CHECKBOX:
      return { value: raw === true };

    case FormFieldType.DROPDOWN:
    case FormFieldType.SINGLE_SELECT: {
      if (isBlank) return { value: '' };
      if (typeof raw !== 'string') return { error: `"${field.label}" must be a single option id.` };
      if (!(field.options ?? []).some(o => o.id === raw)) return { error: `"${field.label}" has no option "${raw}".` };
      return { value: raw };
    }

    case FormFieldType.MULTI_SELECT: {
      if (isBlank) return { value: [] };
      if (!Array.isArray(raw)) return { error: `"${field.label}" must be a list of option ids.` };
      const allowed = new Set((field.options ?? []).map(o => o.id));
      const picked: string[] = [];
      for (const entry of raw) {
        if (typeof entry !== 'string' || !allowed.has(entry)) {
          return { error: `"${field.label}" has no option "${String(entry)}".` };
        }
        if (!picked.includes(entry)) picked.push(entry);
      }
      return { value: picked };
    }

    default:
      return { error: `"${field.label}" has an unsupported field type.` };
  }
}

function isAnswered(field: DBFormField, value: FormAnswerValue): boolean {
  if (field.type === FormFieldType.CHECKBOX) return value === true;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
}

/**
 * Validates the whole answers map against a form's fields. `enforceRequired` is
 * false for a draft save and true on submit, so partially-filled work can still
 * be stored.
 */
function sanitizeAnswers(
  form: DBForm,
  raw: unknown,
  enforceRequired: boolean,
): { values: Record<string, FormAnswerValue> } | { error: string } {
  if (raw === undefined || raw === null) return { values: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'values must be an object.' };

  const incoming = raw as Record<string, unknown>;
  const values: Record<string, FormAnswerValue> = {};

  for (const field of form.fields ?? []) {
    const sanitized = sanitizeAnswer(field, incoming[field.id]);
    if ('error' in sanitized) return { error: sanitized.error };
    if (enforceRequired && field.required && !isAnswered(field, sanitized.value)) {
      return { error: `"${field.label}" is required.` };
    }
    values[field.id] = sanitized.value;
  }

  return { values };
}

// ---------------------------------------------------------------------------
// GET /items/:itemId/forms
//
// Returns every form attached to the item, each with the live form definition
// so the sidebar can render inputs without a second round trip. `form` is null
// when the definition was deleted after the response was filled in.
// ---------------------------------------------------------------------------
export const listItemForms = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const itemId = req.params.itemId;

  try {
    await loadItemWithAccess(user, itemId, 'read');

    const snap = await itemFormResponsesCollection(user.orgId, itemId).orderBy('attachedAt', 'asc').get();
    const responses = querySnapshotToArray<DBFormResponse>(snap);
    if (responses.length === 0) return res.json([]);

    const formSnaps = await Promise.all(
      responses.map(r => formsCollection(user.orgId).doc(r.formId).get()),
    );

    res.json(
      responses.map((response, i) => ({
        response,
        form: formSnaps[i].exists ? { id: formSnaps[i].id, ...formSnaps[i].data() } as DBForm : null,
      })),
    );
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`listItemForms error for item ${itemId}:`, err);
    res.status(500).json({ message: 'Failed to fetch item forms.' });
  }
};

// ---------------------------------------------------------------------------
// POST /items/:itemId/forms   body: { formId }
//
// Attaches a form to an item, creating its (empty) response document. Attaching
// an already-attached form is a no-op that returns the existing response.
// ---------------------------------------------------------------------------
export const attachFormToItem = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const itemId = req.params.itemId;
  const formId = typeof req.body.formId === 'string' ? req.body.formId.trim() : '';

  if (!formId) return res.status(400).json({ message: 'formId is required.' });

  try {
    await loadItemWithAccess(user, itemId, 'update');

    const formSnap = await formsCollection(user.orgId).doc(formId).get();
    if (!formSnap.exists) return res.status(404).json({ message: 'Form not found.' });
    const form = { id: formSnap.id, ...formSnap.data() } as DBForm;
    if (form.isArchived) return res.status(400).json({ message: 'This form is archived.' });

    const responseRef = itemFormResponsesCollection(user.orgId, itemId).doc(formId);
    const existing = await responseRef.get();
    if (existing.exists) {
      return res.status(200).json({ response: snapshotToData<DBFormResponse>(existing), form });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const response: Omit<DBFormResponse, 'id'> = {
      itemId,
      formId,
      formName: form.name,
      values: {},
      attachedBy: user.id,
      attachedAt: now,
      updatedAt: now,
    };
    await responseRef.set(response);
    await itemsCollection(user.orgId).doc(itemId).update({
      formResponseCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now,
    });

    res.status(201).json({ response: { id: formId, ...response }, form });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`attachFormToItem error for item ${itemId}:`, err);
    res.status(500).json({ message: 'Failed to attach form.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /items/:itemId/forms/:formId   body: { values, submit? }
//
// Saves answers. `submit: true` enforces required fields and stamps the
// submitter; without it the answers are stored as a draft.
// ---------------------------------------------------------------------------
export const saveItemFormResponse = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { itemId, formId } = req.params;
  const submit = req.body.submit === true;

  try {
    await loadItemWithAccess(user, itemId, 'update');

    const responseRef = itemFormResponsesCollection(user.orgId, itemId).doc(formId);
    const [responseSnap, formSnap] = await Promise.all([
      responseRef.get(),
      formsCollection(user.orgId).doc(formId).get(),
    ]);
    if (!responseSnap.exists) return res.status(404).json({ message: 'This form is not attached to the item.' });
    if (!formSnap.exists) return res.status(404).json({ message: 'Form not found.' });

    const form = { id: formSnap.id, ...formSnap.data() } as DBForm;
    const sanitized = sanitizeAnswers(form, req.body.values, submit);
    if ('error' in sanitized) return res.status(400).json({ message: sanitized.error });

    const now = admin.firestore.FieldValue.serverTimestamp();
    const patch: Record<string, unknown> = {
      values: sanitized.values,
      // Keep the denormalized name fresh — the form may have been renamed since
      // it was attached.
      formName: form.name,
      updatedAt: now,
    };
    if (submit) {
      const userSnap = await usersCollection.doc(user.id).get();
      patch.submittedBy = user.id;
      patch.submittedByName = (userSnap.data() as DBUser | undefined)?.name ?? 'Unknown user';
      patch.submittedAt = now;
    }

    await responseRef.update(patch);
    const updated = await responseRef.get();

    res.json({ response: snapshotToData<DBFormResponse>(updated), form });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`saveItemFormResponse error for item ${itemId}, form ${formId}:`, err);
    res.status(500).json({ message: 'Failed to save form answers.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /items/:itemId/forms/:formId
//
// Detaches the form from the item, discarding its answers.
// ---------------------------------------------------------------------------
export const detachFormFromItem = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { itemId, formId } = req.params;

  try {
    await loadItemWithAccess(user, itemId, 'update');

    const responseRef = itemFormResponsesCollection(user.orgId, itemId).doc(formId);
    const snap = await responseRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'This form is not attached to the item.' });

    await responseRef.delete();
    await itemsCollection(user.orgId).doc(itemId).update({
      formResponseCount: admin.firestore.FieldValue.increment(-1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`detachFormFromItem error for item ${itemId}, form ${formId}:`, err);
    res.status(500).json({ message: 'Failed to detach form.' });
  }
};
