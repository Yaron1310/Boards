import React, { useEffect, useMemo, useState } from 'react';
import {
  FiX, FiPlus, FiTrash2, FiSave, FiCheck, FiLoader, FiFileText, FiChevronDown, FiChevronRight,
  FiAlertCircle,
} from 'react-icons/fi';
import type { Item, Form, FormAnswerValue, ItemFormEntry } from '../../types';
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
  const { mutateAsync: saveResponse } = useSaveItemFormResponse(item.id);
  const { mutateAsync: detachForm } = useDetachFormFromItem(item.id);

  // Per-form editing state, keyed by formId.
  const [answers, setAnswers] = useState<Record<string, AnswerMap>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({});
  const [savingFormId, setSavingFormId] = useState<string | null>(null);
  const [confirmDetachId, setConfirmDetachId] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load server answers into local state for forms not being edited yet. Forms
  // already in `answers` keep the user's in-progress edits across refetches.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const entry of entries) {
        if (!(entry.response.formId in next)) {
          next[entry.response.formId] = initialAnswers(entry);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // A single attached form starts open — with several, the list stays collapsed.
    setExpanded((prev) => {
      if (entries.length !== 1 || Object.keys(prev).length > 0) return prev;
      return { [entries[0].response.formId]: true };
    });
  }, [entries]);

  const attachedIds = useMemo(() => new Set(entries.map((e) => e.response.formId)), [entries]);
  const attachable = availableForms.filter((f) => !attachedIds.has(f.id));

  const setAnswer = (formId: string, fieldId: string, value: FormAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [formId]: { ...(prev[formId] ?? {}), [fieldId]: value } }));
    setFieldErrors((prev) => {
      if (!prev[formId]?.[fieldId]) return prev;
      const next = { ...prev, [formId]: { ...prev[formId] } };
      delete next[formId][fieldId];
      return next;
    });
  };

  const handleAttach = async (formId: string) => {
    setError(null);
    setAttachOpen(false);
    try {
      const entry = await attachForm(formId);
      setAnswers((prev) => ({ ...prev, [formId]: initialAnswers(entry) }));
      setExpanded((prev) => ({ ...prev, [formId]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach the form.');
    }
  };

  const handleSave = async (form: Form, submit: boolean) => {
    setError(null);
    const values = answers[form.id] ?? {};

    if (submit) {
      const missing: Record<string, string> = {};
      for (const field of form.fields) {
        if (field.required && !isAnswered(field, values[field.id] ?? null)) {
          missing[field.id] = 'This field is required.';
        }
      }
      if (Object.keys(missing).length > 0) {
        setFieldErrors((prev) => ({ ...prev, [form.id]: missing }));
        setError('Fill in the required fields before submitting.');
        return;
      }
    }

    setSavingFormId(form.id);
    try {
      await saveResponse({ formId: form.id, values, submit });
      setFieldErrors((prev) => ({ ...prev, [form.id]: {} }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your answers.');
    } finally {
      setSavingFormId(null);
    }
  };

  const handleDetach = async (formId: string) => {
    setError(null);
    setConfirmDetachId(null);
    try {
      await detachForm(formId);
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[formId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the form.');
    }
  };

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[34rem] bg-white shadow-2xl flex flex-col"
      role="region"
      aria-label={`Forms for ${item.name}`}
    >
      {/* Header — mirrors the chat sidebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white flex-shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate">{item.name}</span>
          <span className="text-xs text-indigo-200">
            {entries.length} form{entries.length !== 1 ? 's' : ''} attached
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
          aria-label="Close forms"
        >
          <FiX size={16} aria-hidden="true" />
        </button>
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

      {/* Attached forms */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
        {isLoading && <div className="text-center text-sm text-gray-400 py-8">Loading forms…</div>}

        {!isLoading && entries.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">
            No forms on this item yet. Add one below.
          </div>
        )}

        {entries.map((entry) => {
          const { response, form } = entry;
          const formId = response.formId;
          const isOpen = expanded[formId] ?? false;
          const errors = fieldErrors[formId] ?? {};
          const isSaving = savingFormId === formId;

          return (
            <section key={formId} className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [formId]: !isOpen }))}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} form ${response.formName}`}
                >
                  {isOpen
                    ? <FiChevronDown size={15} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                    : <FiChevronRight size={15} className="text-gray-400 flex-shrink-0" aria-hidden="true" />}
                  <FiFileText size={15} className="text-indigo-500 flex-shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-800 truncate">{response.formName}</span>
                    <span className="block text-[11px] text-gray-400">
                      {response.submittedAt
                        ? `Submitted by ${response.submittedByName ?? 'someone'} · ${formatTimestamp(response.submittedAt)}`
                        : 'Not submitted yet'}
                    </span>
                  </span>
                </button>

                {confirmDetachId === formId ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDetach(formId)}
                      className="p-1 text-red-500 hover:text-red-700 rounded transition-colors"
                      aria-label={`Confirm removing ${response.formName} from this item`}
                    >
                      <FiCheck size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDetachId(null)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                      aria-label="Cancel removing form"
                    >
                      <FiX size={14} aria-hidden="true" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDetachId(formId)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex-shrink-0"
                    aria-label={`Remove ${response.formName} from this item`}
                  >
                    <FiTrash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              {isOpen && (
                form ? (
                  <div className="px-3 py-3">
                    {form.description && (
                      <p className="text-xs text-gray-500 mb-3">{form.description}</p>
                    )}
                    <div className="space-y-4">
                      {form.fields.map((field) => (
                        <FormFieldInput
                          key={field.id}
                          field={field}
                          value={answers[formId]?.[field.id] ?? emptyAnswer(field.type)}
                          onChange={(value) => setAnswer(formId, field.id, value)}
                          disabled={isSaving}
                          error={errors[field.id]}
                        />
                      ))}
                    </div>

                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => void handleSave(form, false)}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center transition-colors"
                        aria-label={`Save draft answers for ${form.name}`}
                      >
                        {isSaving ? <FiLoader className="animate-spin mr-1.5" size={13} aria-hidden="true" /> : <FiSave className="mr-1.5" size={13} aria-hidden="true" />}
                        Save draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave(form, true)}
                        disabled={isSaving}
                        className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center transition-colors"
                        aria-label={`Submit ${form.name}`}
                      >
                        {isSaving ? <FiLoader className="animate-spin mr-1.5" size={13} aria-hidden="true" /> : <FiCheck className="mr-1.5" size={13} aria-hidden="true" />}
                        Submit
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="px-3 py-4 text-sm text-gray-500 italic">
                    This form was deleted. Its saved answers are kept, but it can no longer be edited.
                  </p>
                )
              )}
            </section>
          );
        })}
      </div>

      {/* Attach a form */}
      <div className="border-t border-gray-200 bg-white px-3 py-2.5 flex-shrink-0 relative">
        <button
          type="button"
          onClick={() => setAttachOpen((v) => !v)}
          disabled={isAttaching || attachable.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-haspopup="menu"
          aria-expanded={attachOpen}
          aria-label="Add a form to this item"
        >
          {isAttaching ? <FiLoader className="animate-spin" size={14} aria-hidden="true" /> : <FiPlus size={14} aria-hidden="true" />}
          {attachable.length === 0 ? 'All forms already added' : 'Add form'}
        </button>

        {attachOpen && attachable.length > 0 && (
          <div
            className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-10"
            role="menu"
            aria-label="Available forms"
          >
            {attachable.map((form) => (
              <button
                key={form.id}
                type="button"
                role="menuitem"
                onClick={() => void handleAttach(form.id)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors"
              >
                <span className="block text-sm text-gray-800 truncate">{form.name}</span>
                <span className="block text-xs text-gray-400 truncate">
                  {form.fields.length} field{form.fields.length !== 1 ? 's' : ''}
                  {form.description ? ` · ${form.description}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemFormSidebar;
