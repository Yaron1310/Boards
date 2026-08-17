import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiX, FiTrash2, FiSave, FiCheck, FiLoader, FiFileText, FiEdit2, FiAlertCircle, FiLock,
} from 'react-icons/fi';
import { UserRole } from '../../types';
import type { Item, FormAnswerValue, ItemFormEntry, ColumnType } from '../../types';
import { useAuthSession } from '../../hooks/useAuthSession';
import {
  useForms, useItemForms, useAttachFormToItem, useSaveItemFormResponse, useDetachFormFromItem,
} from '../../hooks/queries/useFormQueries';
import FormFieldInput from './FormFieldInput';
import { emptyAnswer, isAnswered } from './formFieldTypes';
import { COLUMN_TYPE_LABELS } from '../boards/AddColumnModal';

/** One connected field this board has more than one matching column for — see attachFormToItem. */
interface ColumnSelectionField {
  fieldId: string;
  fieldLabel: string;
  columnType: ColumnType;
  columns: { id: string; name: string }[];
}

interface ItemFormSidebarProps {
  item: Item;
  onClose: () => void;
}

type AnswerMap = Record<string, FormAnswerValue>;

/** Seeds the editable answer map from a saved response, filling gaps for new fields. */
function initialAnswers(entry: ItemFormEntry): AnswerMap {
  const answers: AnswerMap = {};
  for (const field of entry.form?.fields ?? []) {
    const saved = entry.response.values?.[field.id];
    answers[field.id] = saved === undefined ? emptyAnswer(field.type) : saved;
  }
  return answers;
}

function formatTimestamp(ts: Date | string | undefined): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Drafts are personal scratch space — they never touch the server. Keyed by user so a
// shared browser/device doesn't leak one person's in-progress answers to another.
const draftKey = (userId: string, itemId: string, formId: string) => `formDraft:${userId}:${itemId}:${formId}`;

function loadDraft(userId: string, itemId: string, formId: string): AnswerMap | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, itemId, formId));
    return raw ? (JSON.parse(raw) as AnswerMap) : null;
  } catch {
    return null;
  }
}

function saveDraft(userId: string, itemId: string, formId: string, answers: AnswerMap): void {
  try {
    localStorage.setItem(draftKey(userId, itemId, formId), JSON.stringify(answers));
  } catch {
    // Private mode / storage disabled — the draft just won't persist across reloads.
  }
}

function clearDraft(userId: string, itemId: string, formId: string): void {
  try {
    localStorage.removeItem(draftKey(userId, itemId, formId));
  } catch {
    // No-op — nothing was stored anyway.
  }
}

const ItemFormSidebar: React.FC<ItemFormSidebarProps> = ({ item, onClose }) => {
  const { user, selectedWorkspace } = useAuthSession();
  const { data: entries = [], isLoading } = useItemForms(item.id);
  const { data: availableForms = [] } = useForms();
  const { mutateAsync: attachForm, isPending: isAttaching } = useAttachFormToItem(item.id);
  const { mutateAsync: saveResponse, isPending: isSaving } = useSaveItemFormResponse(item.id);
  const { mutateAsync: detachForm } = useDetachFormFromItem(item.id);

  // An item holds at most one form.
  const entry: ItemFormEntry | null = entries[0] ?? null;
  const form = entry?.form ?? null;
  const response = entry?.response ?? null;
  const isSubmitted = !!response?.submittedAt;

  // Mirrors canManageItemForm on the backend: choosing which form sits on an item is
  // for org admins, and for a WorkHub admin only inside their own WorkHub. Everyone
  // else can still fill in a form that's already there.
  const canManageAttachment =
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN ||
    (user?.role === UserRole.WORKSPACE_ADMIN && selectedWorkspace?.id === item.workspaceId);
  const canRemoveForm = canManageAttachment;

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  // Set when attaching a form whose connected fields are ambiguous on this board
  // (more than one column of the same type) — the picker below resolves them.
  const [columnSelectionRequest, setColumnSelectionRequest] = useState<{ formId: string; fields: ColumnSelectionField[] } | null>(null);
  const [columnPicks, setColumnPicks] = useState<Record<string, string>>({});

  // Seed answers once per attached form. Keyed by formId rather than by the entry
  // object so a refetch after saving doesn't wipe in-progress edits. A local draft
  // (unsubmitted, saved only in this browser for this user) takes priority over
  // whatever the server has, since the server never stores draft values.
  const seededFormId = useRef<string | null>(null);
  useEffect(() => {
    if (!entry || !user) {
      seededFormId.current = null;
      return;
    }
    if (seededFormId.current === entry.response.formId) return;
    const draft = entry.response.submittedAt ? null : loadDraft(user.id, item.id, entry.response.formId);
    setAnswers(draft ?? initialAnswers(entry));
    seededFormId.current = entry.response.formId;
  }, [entry, user, item.id]);

  // A submitted form is read-only until the user explicitly chooses to edit it.
  const locked = isSubmitted && !editing;

  const setAnswer = (fieldId: string, value: FormAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setFieldErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
    setDraftSaved(false);
  };

  const handleAttach = async (formId: string, columnSelections?: Record<string, string>) => {
    setError(null);
    try {
      const attached = await attachForm({ formId, columnSelections });
      const draft = user ? loadDraft(user.id, item.id, formId) : null;
      setAnswers(draft ?? initialAnswers(attached));
      seededFormId.current = formId;
      setColumnSelectionRequest(null);
      setColumnPicks({});
    } catch (err) {
      const fields = (err as { needsColumnSelection?: ColumnSelectionField[] } | undefined)?.needsColumnSelection;
      if (fields?.length) {
        setColumnSelectionRequest({ formId, fields });
        // Default each field to its first candidate so the picker starts pre-filled.
        setColumnPicks(Object.fromEntries(fields.map((f) => [f.fieldId, f.columns[0]?.id ?? ''])));
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to add the form.');
    }
  };

  const confirmColumnSelection = async () => {
    if (!columnSelectionRequest) return;
    await handleAttach(columnSelectionRequest.formId, columnPicks);
  };

  const handleSave = async (submit: boolean) => {
    if (!form || !user) return;
    setError(null);

    if (submit) {
      const missing: Record<string, string> = {};
      for (const field of form.fields) {
        if (field.required && !isAnswered(field, answers[field.id] ?? null)) {
          missing[field.id] = 'This field is required.';
        }
      }
      if (Object.keys(missing).length > 0) {
        setFieldErrors(missing);
        setError('Fill in the required fields before submitting.');
        return;
      }
    }

    // Drafts are personal scratch space — they're saved only in this browser for this
    // user, never sent to the server, so nobody else can see in-progress answers.
    if (!submit) {
      saveDraft(user.id, item.id, form.id, answers);
      setFieldErrors({});
      setDraftSaved(true);
      return;
    }

    try {
      await saveResponse({ formId: form.id, values: answers, submit });
      clearDraft(user.id, item.id, form.id);
      setFieldErrors({});
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your answers.');
    }
  };

  const handleCancelEdit = () => {
    if (entry) setAnswers(initialAnswers(entry));
    setFieldErrors({});
    setEditing(false);
    setError(null);
  };

  const handleRemove = async () => {
    if (!form || !user) return;
    setConfirmRemove(false);
    setError(null);
    try {
      await detachForm(form.id);
      clearDraft(user.id, item.id, form.id);
      setAnswers({});
      setEditing(false);
      seededFormId.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the form.');
    }
  };

  return ReactDOM.createPortal(
    <>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[10200]">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Form for ${item.name}`}
      >
      {/* Header — mirrors the chat sidebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white flex-shrink-0 rounded-t-lg">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate">{item.name}</span>
          <span className="text-xs text-indigo-200 truncate">
            {form ? form.name : 'No form yet'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {form && canRemoveForm && (
            confirmRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  className="px-2 py-1 text-xs font-medium rounded-full hover:bg-indigo-500 transition-colors"
                  aria-label={`Confirm removing ${form.name} from this item`}
                  title={isSubmitted ? "Submitted answers are kept and still shown in the form's results" : undefined}
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="px-2 py-1 text-xs font-medium rounded-full hover:bg-indigo-500 transition-colors"
                  aria-label="Cancel removing form"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full hover:bg-indigo-500 transition-colors"
                aria-label={`Remove ${form.name} from this item`}
              >
                <FiTrash2 size={13} aria-hidden="true" />
                Remove form
              </button>
            )
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
            aria-label="Close form"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-red-100" role="alert">
          <FiAlertCircle size={14} aria-hidden="true" className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600" aria-label="Dismiss error">
            <FiX size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {confirmRemove && isSubmitted && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-800 text-xs border-b border-amber-100">
          <FiAlertCircle size={13} aria-hidden="true" className="flex-shrink-0" />
          <span className="flex-1">
            This form's submitted answers will be kept and still show in the form's results — only its link to this item is removed.
          </span>
        </div>
      )}

      {/* Submitted banner — states plainly why the fields are read-only */}
      {isSubmitted && !editing && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-800 text-xs border-b border-green-100">
          <FiLock size={13} aria-hidden="true" className="flex-shrink-0" />
          <span className="flex-1">
            Submitted by {response?.submittedByName ?? 'someone'} · {formatTimestamp(response?.submittedAt)}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
        {isLoading && <div className="text-center text-sm text-gray-400 py-8">Loading form…</div>}

        {/* Nothing attached yet — pick a form to start filling it in */}
        {!isLoading && !entry && !canManageAttachment && (
          <p className="text-sm text-gray-400 italic py-6 text-center">
            No form has been added to this item yet. An org or WorkHub admin can add one.
          </p>
        )}

        {!isLoading && !entry && canManageAttachment && (
          <div>
            <p className="text-sm text-gray-500 mb-3">Choose a form to add to this item:</p>
            {availableForms.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No forms have been created yet. An admin can add one on the Forms page.
              </p>
            ) : (
              <ul className="space-y-2" role="list" aria-label="Available forms">
                {availableForms.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => void handleAttach(f.id)}
                      disabled={isAttaching}
                      className="w-full text-left px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all disabled:opacity-50"
                      aria-label={`Add form ${f.name} to this item`}
                    >
                      <span className="flex items-center gap-2">
                        <FiFileText size={15} className="text-indigo-500 flex-shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800 truncate">{f.name}</span>
                          <span className="block text-xs text-gray-400 truncate">
                            {f.fields.length} field{f.fields.length !== 1 ? 's' : ''}
                            {f.description ? ` · ${f.description}` : ''}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* The attached form, always open and ready to fill */}
        {!isLoading && entry && !form && (
          <p className="text-sm text-gray-500 italic">
            This form was deleted. Its saved answers are kept, but it can no longer be edited.
          </p>
        )}

        {!isLoading && form && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-4">
            {form.description && <p className="text-xs text-gray-500 mb-4">{form.description}</p>}
            <div className="space-y-4">
              {form.fields.map((field) => (
                <FormFieldInput
                  key={field.id}
                  field={field}
                  value={answers[field.id] ?? emptyAnswer(field.type)}
                  onChange={(value) => setAnswer(field.id, value)}
                  disabled={locked || isSaving}
                  error={fieldErrors[field.id]}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      {form && (
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0 rounded-b-lg">
          {locked ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center transition-colors"
              aria-label={`Edit answers for ${form.name}`}
            >
              <FiEdit2 className="mr-1.5" size={13} aria-hidden="true" /> Edit answers
            </button>
          ) : (
            <>
              {isSubmitted && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  aria-label="Cancel editing answers"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSave(false)}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center transition-colors"
                aria-label={`Save draft answers for ${form.name}, kept only on this device`}
                title="Saved only on this device — not visible to anyone else"
              >
                <FiSave className="mr-1.5" size={13} aria-hidden="true" />
                {draftSaved ? 'Draft saved' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={isSaving}
                className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center transition-colors"
                aria-label={`Submit ${form.name}`}
              >
                {isSaving ? <FiLoader className="animate-spin mr-1.5" size={13} aria-hidden="true" /> : <FiCheck className="mr-1.5" size={13} aria-hidden="true" />}
                {isSubmitted ? 'Save changes' : 'Submit'}
              </button>
            </>
          )}
        </div>
      )}
      </div>
    </div>

    {columnSelectionRequest && (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[10300]">
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Choose columns for connected fields"
        >
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800">Choose columns</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              This board has more than one column matching a field this form connects to. Pick which column each should fill in when submitted.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {columnSelectionRequest.fields.map((f) => (
              <div key={f.fieldId}>
                <label htmlFor={`column-pick-${f.fieldId}`} className="block text-xs font-medium text-gray-600 mb-1">
                  "{f.fieldLabel}" → {COLUMN_TYPE_LABELS[f.columnType]} column
                </label>
                <select
                  id={`column-pick-${f.fieldId}`}
                  value={columnPicks[f.fieldId] ?? ''}
                  onChange={(e) => setColumnPicks((prev) => ({ ...prev, [f.fieldId]: e.target.value }))}
                  className="w-full p-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                >
                  {f.columns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
            <button
              type="button"
              onClick={() => { setColumnSelectionRequest(null); setColumnPicks({}); }}
              disabled={isAttaching}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmColumnSelection()}
              disabled={isAttaching}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center"
            >
              {isAttaching && <FiLoader className="animate-spin mr-1.5" size={13} aria-hidden="true" />}
              Add form
            </button>
          </div>
        </div>
      </div>
    )}
    </>,
    document.getElementById('modal-root')!,
  );
};

export default ItemFormSidebar;
