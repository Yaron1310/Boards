import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import {
  itemsCollection,
  itemFormResponsesCollection,
  boardMembersCollection,
  formsCollection,
  columnsCollection,
  usersCollection,
} from '../db/collections.js';
import {
  JwtUserPayload,
  UserRole,
  DBItem,
  DBUser,
  DBBoardMember,
  DBForm,
  DBFormField,
  DBFormResponse,
  DBColumn,
  ColumnType,
  FormAnswerValue,
  FormFieldType,
} from '../types/index.js';
import { assertItemAccess, isAtLeast } from '../utils/workManagementAuth.js';
import { findColumnCandidates, normalizeLinkAnswer } from '../utils/formColumnSync.js';

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
 * Deciding *which* form belongs on an item is an administrative act, narrower than
 * editing the item itself: org admins anywhere, and a WorkHub admin only within
 * their own WorkHub. Filling the form in stays open to anyone who can edit the item.
 */
function canManageItemForm(user: JwtUserPayload, item: DBItem): boolean {
  if (isAtLeast(user.role, UserRole.ORGANIZATION_ADMIN)) return true;
  return user.role === UserRole.WORKSPACE_ADMIN && user.selectedWorkspaceId === item.workspaceId;
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
    // Detached-but-kept responses (a submitted form removed from the item) stay in this
    // subcollection so their answers still show in the form's results, but they're no
    // longer "on" the item.
    const responses = querySnapshotToArray<DBFormResponse>(snap).filter(r => !r.detachedAt);
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
// POST /items/:itemId/forms   body: { formId, columnSelections? }
//
// Attaches a form to an item, creating its (empty) response document. An item
// holds at most one form: re-attaching the same one is a no-op, attaching a
// different one is rejected until the current form is detached.
//
// If the form has fields linked to a column type, this also resolves, once,
// which actual column on THIS item's board each one targets (see
// findColumnCandidates, formColumnSync.ts). A field with no matching column on
// this board is just skipped — nothing to sync here. A field whose board has
// more than one column of the linked type is ambiguous: the caller must supply
// columnSelections ({ fieldId: columnId }) or this responds 409 with the
// candidates for each such field so the UI can ask the user to pick.
// ---------------------------------------------------------------------------
export const attachFormToItem = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const itemId = req.params.itemId;
  const formId = typeof req.body.formId === 'string' ? req.body.formId.trim() : '';

  if (!formId) return res.status(400).json({ message: 'formId is required.' });

  try {
    const item = await loadItemWithAccess(user, itemId, 'update');
    if (!canManageItemForm(user, item)) {
      return res.status(403).json({ message: 'Only org admins and WorkHub admins can add a form to an item.' });
    }

    const formSnap = await formsCollection(user.orgId).doc(formId).get();
    if (!formSnap.exists) return res.status(404).json({ message: 'Form not found.' });
    const form = { id: formSnap.id, ...formSnap.data() } as DBForm;
    if (form.isArchived) return res.status(400).json({ message: 'This form is archived.' });

    const allDocs = (await itemFormResponsesCollection(user.orgId, itemId).get()).docs;
    const activeDoc = allDocs.find(d => !(d.data() as DBFormResponse).detachedAt);
    if (activeDoc) {
      if (activeDoc.id === formId) {
        return res.status(200).json({ response: snapshotToData<DBFormResponse>(activeDoc), form });
      }
      return res.status(409).json({
        message: 'This item already has a form. Remove it before adding a different one.',
      });
    }

    // Resolve which column each linked field targets on this item's board.
    let columnSelections: Record<string, string> | undefined;
    const linkedFields = form.fields.filter(f => f.linkedColumnType);
    if (linkedFields.length > 0) {
      const columnsSnap = await columnsCollection(user.orgId, item.boardId).get();
      const columns = columnsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DBColumn, 'id'>) }));
      const candidateGroups = findColumnCandidates(linkedFields, columns);

      const provided = (req.body.columnSelections && typeof req.body.columnSelections === 'object')
        ? req.body.columnSelections as Record<string, unknown>
        : {};

      const needsColumnSelection: {
        fieldId: string; fieldLabel: string; columnType: ColumnType; columns: { id: string; name: string }[];
      }[] = [];
      const resolved: Record<string, string> = {};

      for (const group of candidateGroups) {
        if (group.candidates.length === 0) continue; // no matching column on this board — nothing to sync
        if (group.candidates.length === 1) {
          resolved[group.fieldId] = group.candidates[0].id;
          continue;
        }
        const pickedId = provided[group.fieldId];
        const picked = typeof pickedId === 'string' ? group.candidates.find(c => c.id === pickedId) : undefined;
        if (picked) {
          resolved[group.fieldId] = picked.id;
        } else {
          const field = linkedFields.find(f => f.id === group.fieldId)!;
          needsColumnSelection.push({
            fieldId: group.fieldId,
            fieldLabel: field.label,
            columnType: group.columnType,
            columns: group.candidates.map(c => ({ id: c.id, name: c.name })),
          });
        }
      }

      if (needsColumnSelection.length > 0) {
        return res.status(409).json({
          message: 'This board has more than one column of the same type as one of this form\'s connected fields. Choose which column each should use.',
          needsColumnSelection,
        });
      }
      if (Object.keys(resolved).length > 0) columnSelections = resolved;
    }

    // A detached-but-kept record (a previously submitted form removed from this item)
    // may already occupy the formId-keyed doc slot. Move it aside under its own id first
    // so its answers keep showing in the form's results instead of being overwritten.
    const staleDoc = allDocs.find(d => d.id === formId);
    if (staleDoc) {
      const migratedRef = itemFormResponsesCollection(user.orgId, itemId).doc();
      await migratedRef.set(staleDoc.data());
      await staleDoc.ref.delete();
    }

    const responseRef = itemFormResponsesCollection(user.orgId, itemId).doc(formId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const response: Omit<DBFormResponse, 'id'> = {
      itemId,
      formId,
      formName: form.name,
      values: {},
      attachedBy: user.id,
      attachedAt: now,
      updatedAt: now,
      ...(columnSelections ? { columnSelections } : {}),
    };
    await responseRef.set(response);
    await itemsCollection(user.orgId).doc(itemId).update({
      formResponseCount: admin.firestore.FieldValue.increment(1),
      formSubmitted: false,
      updatedAt: now,
    });

    res.status(201).json({ response: { id: formId, ...response }, form });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`attachFormToItem error for item ${itemId}:`, err);
    res.status(500).json({ message: 'Failed to attach form.' });
  }
};

/**
 * For every field with a linkedColumnType, looks up which column attach time
 * resolved it to (response.columnSelections — see findColumnCandidates,
 * formColumnSync.ts) and returns { columnId: answerValue } for the ones that
 * have a selection. Answer values already match a compatible column's storage
 * format 1:1 except LINK, which needs the same https:// normalization a manual
 * edit gets — otherwise the cell shows plain text instead of a clickable link
 * until someone re-saves it by hand.
 */
function buildColumnSyncPatch(
  form: DBForm,
  columnSelections: Record<string, string> | undefined,
  values: Record<string, FormAnswerValue>,
): Record<string, FormAnswerValue> {
  if (!columnSelections) return {};

  const patch: Record<string, FormAnswerValue> = {};
  for (const field of form.fields) {
    if (!field.linkedColumnType) continue;
    const columnId = columnSelections[field.id];
    if (!columnId) continue;
    const answer = values[field.id];
    if (answer === undefined) continue;
    patch[columnId] = field.linkedColumnType === ColumnType.LINK && typeof answer === 'string'
      ? normalizeLinkAnswer(answer)
      : answer;
  }
  return patch;
}

// ---------------------------------------------------------------------------
// PATCH /items/:itemId/forms/:formId   body: { values, submit? }
//
// Saves answers. `submit: true` enforces required fields and stamps the
// submitter; without it the answers are stored as a draft. On submit, any field
// with a linkedColumnType also gets copied into the matching board column.
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
    if (submit) {
      const itemUpdate: Record<string, unknown> = { formSubmitted: true, updatedAt: now };
      const columnSelections = (responseSnap.data() as DBFormResponse).columnSelections;
      const columnPatch = buildColumnSyncPatch(form, columnSelections, sanitized.values);
      // Dot-path keys merge into the item's `values` map rather than overwriting it.
      for (const [columnId, value] of Object.entries(columnPatch)) {
        itemUpdate[`values.${columnId}`] = value;
      }
      await itemsCollection(user.orgId).doc(itemId).update(itemUpdate);
    }
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
// Detaches the form from the item. An unsubmitted response is just discarded —
// it never held anything but empty draft placeholders (drafts live in the filler's
// browser, not the server). A submitted response is a record, so it's kept and
// merely marked detached: it drops off the item but still shows up in the form's
// results.
// ---------------------------------------------------------------------------
export const detachFormFromItem = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { itemId, formId } = req.params;

  try {
    const item = await loadItemWithAccess(user, itemId, 'update');
    if (!canManageItemForm(user, item)) {
      return res.status(403).json({ message: 'Only org admins and WorkHub admins can remove a form from an item.' });
    }

    const responseRef = itemFormResponsesCollection(user.orgId, itemId).doc(formId);
    const snap = await responseRef.get();
    if (!snap.exists) return res.status(404).json({ message: 'This form is not attached to the item.' });

    if ((snap.data() as DBFormResponse).submittedAt) {
      await responseRef.update({ detachedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      await responseRef.delete();
    }
    await itemsCollection(user.orgId).doc(itemId).update({
      formResponseCount: admin.firestore.FieldValue.increment(-1),
      formSubmitted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`detachFormFromItem error for item ${itemId}, form ${formId}:`, err);
    res.status(500).json({ message: 'Failed to detach form.' });
  }
};
