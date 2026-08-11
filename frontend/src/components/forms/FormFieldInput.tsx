import React from 'react';
import { FormFieldType } from '../../types';
import type { FormField, FormAnswerValue } from '../../types';

interface FormFieldInputProps {
  field: FormField;
  value: FormAnswerValue;
  onChange: (value: FormAnswerValue) => void;
  disabled?: boolean;
  /** Rendered under the label when the field is required and left blank on submit. */
  error?: string;
}

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500';

/**
 * Renders the single input that a form field type calls for, wired to `value`.
 * Every branch labels its control — option lists use a <fieldset>/<legend>, the
 * rest bind an explicit <label> to the input id.
 */
const FormFieldInput: React.FC<FormFieldInputProps> = ({ field, value, onChange, disabled, error }) => {
  const inputId = `form-field-${field.id}`;
  const describedBy = [
    field.description ? `${inputId}-desc` : null,
    error ? `${inputId}-error` : null,
  ].filter(Boolean).join(' ') || undefined;

  const labelNode = (
    <span className="block text-sm font-medium text-gray-700">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
    </span>
  );

  const description = field.description ? (
    <p id={`${inputId}-desc`} className="text-xs text-gray-500 mt-0.5">{field.description}</p>
  ) : null;

  const errorNode = error ? (
    <p id={`${inputId}-error`} className="text-xs text-red-600 mt-1" role="alert">{error}</p>
  ) : null;

  // Option lists: the group itself is the labelled control, so no <label for>.
  if (field.type === FormFieldType.SINGLE_SELECT || field.type === FormFieldType.MULTI_SELECT) {
    const isMulti = field.type === FormFieldType.MULTI_SELECT;
    const selected: string[] = isMulti
      ? (Array.isArray(value) ? value : [])
      : (typeof value === 'string' && value ? [value] : []);

    const toggle = (optionId: string) => {
      if (!isMulti) {
        onChange(selected[0] === optionId ? '' : optionId);
        return;
      }
      onChange(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
    };

    return (
      <fieldset className="space-y-1" aria-describedby={describedBy} aria-required={field.required || undefined}>
        <legend className="text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
        </legend>
        {description}
        <div className="space-y-1.5 mt-1.5">
          {(field.options ?? []).map((option) => {
            const checked = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className={`flex items-center gap-2 text-sm text-gray-800 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name={inputId}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(option.id)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-400"
                  aria-label={option.label}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
        {errorNode}
      </fieldset>
    );
  }

  if (field.type === FormFieldType.CHECKBOX) {
    return (
      <div>
        <label className={`flex items-start gap-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`} htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-400"
          />
          <span>
            {labelNode}
            {description}
          </span>
        </label>
        {errorNode}
      </div>
    );
  }

  const commonProps = {
    id: inputId,
    disabled,
    required: field.required,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    className: INPUT_CLASS,
  };

  let control: React.ReactNode;
  switch (field.type) {
    case FormFieldType.LONG_TEXT:
      control = (
        <textarea
          {...commonProps}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;

    case FormFieldType.DROPDOWN:
      control = (
        <select
          {...commonProps}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{field.placeholder || 'Select…'}</option>
          {(field.options ?? []).map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      );
      break;

    case FormFieldType.NUMBER:
      control = (
        <input
          {...commonProps}
          type="number"
          value={typeof value === 'number' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
      break;

    case FormFieldType.DATE:
      control = (
        <input
          {...commonProps}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;

    case FormFieldType.EMAIL:
    case FormFieldType.PHONE:
      control = (
        <input
          {...commonProps}
          type={field.type === FormFieldType.EMAIL ? 'email' : 'tel'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;

    default:
      control = (
        <input
          {...commonProps}
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div>
      <label htmlFor={inputId}>{labelNode}</label>
      {description}
      <div className="mt-1">{control}</div>
      {errorNode}
    </div>
  );
};

export default FormFieldInput;
