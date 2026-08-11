import React, { useEffect, useRef, useState } from 'react';
import {
  FiX, FiTrash2, FiSave, FiCheck, FiLoader, FiFileText, FiEdit2, FiAlertCircle, FiLock,
} from 'react-icons/fi';
import type { Item, FormAnswerValue, ItemFormEntry } from '../../types';
import {
  useForms, useItemForms, useAttachFormToItem, useSaveItemFormResponse, useDetachFormFromItem,
} from '../../hooks/queries/useFormQueries';
import FormFieldInput from './FormFieldInput';
import { emptyAnswer, isAnswered } from './formFieldTypes';

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

const ItemFormSidebar: React.FC<ItemFormSidebarProps> = ({ item, onClose }) => {
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

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed answers once per attached form. Keyed by formId rather than by the entry
  // object so a refetch after saving doesn't wipe in-progress edits.
  const seededFormId = useRef<string | null>(null);
  useEffect(() => {
    if (!entry) {
      seededFormId.current = null;
      return;
    }
    if (seededFormId.current === entry.response.formId) return;
    setAnswers(initialAnswers(entry));
    seededFormId.current = entry.response.formId;
  }, [entry]);

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
  };

  const handleAttach = async (formId: string) => {
    setError(null);
    try {
      const attached = await attachForm(formId);
      setAnswers(initialAnswers(attached));
      seededFormId.current = formId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the form.');
    }
  };

  const handleSave = async (submit: boolean) => {
    if (!form) return;
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

    try {
      await saveResponse({ formId: form.id, values: answers, submit });
      setFieldErrors({});
      if (submit) setEditing(false);
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
    if (!form) return;
    setConfirmRemove(false);
    setError(null);
    try {
      await detachForm(form.id);
      setAnswers({});
      setEditing(false);
      seededFormId.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the form.');
    }
  };

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[34rem] bg-white shadow-2xl flex flex-col"
      role="region"
      aria-label={`Form for ${item.name}`}
    >
      {/* Header — mirrors the chat sidebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white flex-shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate">{item.name}</span>
          <span className="text-xs text-indigo-200 truncate">
            {form ? form.name : 'No form yet'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {form && (
            confirmRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  className="p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
                  aria-label={`Confirm removing ${form.name} from this item`}
                >
                  <FiCheck size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
                  aria-label="Cancel removing form"
                >
                  <FiX size={16} aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
                aria-label={`Remove ${form.name} from this item`}
              >
                <FiTrash2 size={15} aria-hidden="true" />
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
        {!isLoading && !entry && (
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
        <div className="flex justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 flex-shrink-0">
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
                disabled={isSaving}
                className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center transition-colors"
                aria-label={`Save draft answers for ${form.name}`}
              >
                {isSaving ? <FiLoader className="animate-spin mr-1.5" size={13} aria-hidden="true" /> : <FiSave className="mr-1.5" size={13} aria-hidden="true" />}
                Save draft
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
  );
};

export default ItemFormSidebar;
