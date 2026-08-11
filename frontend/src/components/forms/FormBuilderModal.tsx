import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiXCircle, FiX, FiPlus, FiTrash2, FiSave, FiLoader, FiChevronUp, FiChevronDown,
  FiAlertCircle, FiArchive,
} from 'react-icons/fi';
import { FormFieldType } from '../../types';
import type { Form, FormField } from '../../types';
import { FIELD_TYPE_LABELS, hasOptions, makeLocalId } from './formFieldTypes';

interface FormBuilderModalProps {
  /** The form being edited, or null when creating a new one. */
  form: Form | null;
  onClose: () => void;
  onSave: (data: { name: string; description: string; fields: FormField[] }) => void;
  onArchive?: () => void;
  isSaving: boolean;
  error: string | null;
}

const newField = (type: FormFieldType): FormField => ({
  id: makeLocalId('fld'),
  type,
  label: '',
  ...(hasOptions(type) ? { options: [{ id: makeLocalId('opt'), label: '' }] } : {}),
});

const FormBuilderModal: React.FC<FormBuilderModalProps> = ({ form, onClose, onSave, onArchive, isSaving, error }) => {
  const [name, setName] = useState(form?.name ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [fields, setFields] = useState<FormField[]>(form?.fields ?? []);
  const [addTypeOpen, setAddTypeOpen] = useState(false);

  const patchField = (id: string, patch: Partial<FormField>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const changeType = (id: string, type: FormFieldType) =>
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next: FormField = { ...f, type };
        // Options only exist on option-backed types; seed one row when switching in,
        // drop the list when switching out so the payload stays clean.
        if (hasOptions(type)) {
          next.options = f.options && f.options.length > 0 ? f.options : [{ id: makeLocalId('opt'), label: '' }];
        } else {
          delete next.options;
        }
        return next;
      }),
    );

  const moveField = (index: number, delta: number) =>
    setFields((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const addOption = (fieldId: string) =>
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, options: [...(f.options ?? []), { id: makeLocalId('opt'), label: '' }] } : f,
      ),
    );

  const patchOption = (fieldId: string, optionId: string, label: string) =>
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: (f.options ?? []).map((o) => (o.id === optionId ? { ...o, label } : o)) }
          : f,
      ),
    );

  const removeOption = (fieldId: string, optionId: string) =>
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, options: (f.options ?? []).filter((o) => o.id !== optionId) } : f,
      ),
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name.trim(),
      description: description.trim(),
      fields: fields.map((f) => ({
        ...f,
        label: f.label.trim(),
        options: f.options?.map((o) => ({ ...o, label: o.label.trim() })),
      })),
    });
  };

  // Save is blocked until the form has a name and every field is complete — the
  // backend rejects the same shapes, this just surfaces it before the round trip.
  const isValid =
    name.trim().length > 0 &&
    fields.length > 0 &&
    fields.every(
      (f) =>
        f.label.trim().length > 0 &&
        (!hasOptions(f.type) || ((f.options ?? []).length > 0 && (f.options ?? []).every((o) => o.label.trim()))),
    );

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={form ? `Edit form ${form.name}` : 'Create a new form'}
      >
        <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">{form ? 'Edit Form' : 'New Form'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200" aria-label="Close">
            <FiXCircle size={24} aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
          <form id="form-builder-form" onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-md text-sm bg-red-100 text-red-700" role="alert">
                <FiAlertCircle className="inline mr-2" aria-hidden="true" />{error}
              </div>
            )}

            <div>
              <label htmlFor="form-name" className="block text-sm font-medium text-gray-700">
                Form name <span aria-hidden="true">*</span>
              </label>
              <input
                id="form-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                aria-required="true"
                placeholder="e.g. Client intake"
                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="form-description" className="block text-sm font-medium text-gray-700">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="form-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this form is for"
                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-md font-semibold text-gray-700">
                  Fields <span className="text-sm font-normal text-gray-400">({fields.length})</span>
                </h3>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAddTypeOpen((v) => !v)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm flex items-center"
                    aria-haspopup="menu"
                    aria-expanded={addTypeOpen}
                    aria-label="Add a field"
                  >
                    <FiPlus className="mr-1.5" aria-hidden="true" /> Add field
                  </button>
                  {addTypeOpen && (
                    <div
                      className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-72 overflow-y-auto"
                      role="menu"
                      aria-label="Field types"
                    >
                      {FIELD_TYPE_LABELS.map(({ type, label, hint }) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitem"
                          onClick={() => { setFields((prev) => [...prev, newField(type)]); setAddTypeOpen(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors"
                        >
                          <span className="block text-sm text-gray-800">{label}</span>
                          <span className="block text-xs text-gray-400">{hint}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {fields.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-6 text-center border border-dashed border-gray-300 rounded-md">
                  No fields yet. Use "Add field" to build your form.
                </p>
              ) : (
                <ul className="space-y-3" role="list" aria-label="Form fields">
                  {fields.map((field, index) => (
                    <li key={field.id} className="border border-gray-200 rounded-md p-3 bg-gray-50">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 pt-1">
                          <button
                            type="button"
                            onClick={() => moveField(index, -1)}
                            disabled={index === 0}
                            className="p-0.5 text-gray-400 hover:text-indigo-600 disabled:opacity-30"
                            aria-label={`Move field ${index + 1} up`}
                          >
                            <FiChevronUp size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveField(index, 1)}
                            disabled={index === fields.length - 1}
                            className="p-0.5 text-gray-400 hover:text-indigo-600 disabled:opacity-30"
                            aria-label={`Move field ${index + 1} down`}
                          >
                            <FiChevronDown size={14} aria-hidden="true" />
                          </button>
                        </div>

                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <div className="flex-1">
                              <label htmlFor={`field-label-${field.id}`} className="block text-xs font-medium text-gray-600">
                                Question <span aria-hidden="true">*</span>
                              </label>
                              <input
                                id={`field-label-${field.id}`}
                                type="text"
                                value={field.label}
                                onChange={(e) => patchField(field.id, { label: e.target.value })}
                                placeholder="Question text"
                                className="mt-0.5 w-full p-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                              />
                            </div>
                            <div className="sm:w-52">
                              <label htmlFor={`field-type-${field.id}`} className="block text-xs font-medium text-gray-600">
                                Type
                              </label>
                              <select
                                id={`field-type-${field.id}`}
                                value={field.type}
                                onChange={(e) => changeType(field.id, e.target.value as FormFieldType)}
                                className="mt-0.5 w-full p-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                              >
                                {FIELD_TYPE_LABELS.map(({ type, label }) => (
                                  <option key={type} value={type}>{label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {hasOptions(field.type) && (
                            <div className="pl-1">
                              <span className="block text-xs font-medium text-gray-600 mb-1">Options</span>
                              <ul className="space-y-1" role="list" aria-label={`Options for ${field.label || `field ${index + 1}`}`}>
                                {(field.options ?? []).map((option, optionIndex) => (
                                  <li key={option.id} className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={option.label}
                                      onChange={(e) => patchOption(field.id, option.id, e.target.value)}
                                      placeholder={`Option ${optionIndex + 1}`}
                                      className="flex-1 p-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                                      aria-label={`Option ${optionIndex + 1} label`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeOption(field.id, option.id)}
                                      disabled={(field.options ?? []).length <= 1}
                                      className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"
                                      aria-label={`Remove option ${optionIndex + 1}`}
                                    >
                                      <FiX size={14} aria-hidden="true" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                              <button
                                type="button"
                                onClick={() => addOption(field.id)}
                                className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 flex items-center"
                                aria-label={`Add an option to ${field.label || `field ${index + 1}`}`}
                              >
                                <FiPlus size={12} className="mr-1" aria-hidden="true" /> Add option
                              </button>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required ?? false}
                                onChange={(e) => patchField(field.id, { required: e.target.checked })}
                                className="h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-400"
                                aria-label={`Make ${field.label || `field ${index + 1}`} required`}
                              />
                              Required
                            </label>
                            <input
                              type="text"
                              value={field.description ?? ''}
                              onChange={(e) => patchField(field.id, { description: e.target.value })}
                              placeholder="Helper text (optional)"
                              className="flex-1 min-w-[10rem] p-1.5 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                              aria-label={`Helper text for ${field.label || `field ${index + 1}`}`}
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeField(field.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                          aria-label={`Delete field ${index + 1}`}
                        >
                          <FiTrash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
        </div>

        <div className="flex justify-between items-center gap-3 p-6 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
          <div>
            {form && onArchive && (
              <button
                type="button"
                onClick={onArchive}
                disabled={isSaving}
                className="text-sm text-red-600 hover:text-red-800 py-2 px-3 rounded-md hover:bg-red-50 flex items-center transition-colors border border-red-200"
                aria-label={`Archive form ${form.name}`}
              >
                <FiArchive className="mr-2" aria-hidden="true" /> Archive
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="form-builder-form"
              disabled={isSaving || !isValid}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center"
            >
              {isSaving ? <FiLoader className="animate-spin mr-2" aria-hidden="true" /> : <FiSave className="mr-2" aria-hidden="true" />}
              {form ? 'Save Changes' : 'Create Form'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!,
  );
};

export default FormBuilderModal;
