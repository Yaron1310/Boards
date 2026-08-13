import { FormFieldType, ColumnType } from '../../types';
import type { FormField, FormAnswerValue } from '../../types';

/**
 * Column types a field's answers can sync into on submit. Limited to column types
 * whose stored value is a plain string/number/boolean/date-string matching what
 * this field type already produces — no id-remapping (dropdown/status options,
 * person ids, …) is attempted, so those column types aren't offered.
 */
export const COMPATIBLE_COLUMN_TYPES: Partial<Record<FormFieldType, ColumnType[]>> = {
  [FormFieldType.SHORT_TEXT]: [ColumnType.TEXT, ColumnType.LINK, ColumnType.EMAIL, ColumnType.PHONE, ColumnType.LOCATION],
  [FormFieldType.LONG_TEXT]: [ColumnType.TEXT],
  [FormFieldType.EMAIL]: [ColumnType.EMAIL, ColumnType.TEXT, ColumnType.LINK],
  [FormFieldType.PHONE]: [ColumnType.PHONE, ColumnType.TEXT, ColumnType.LINK],
  [FormFieldType.NUMBER]: [ColumnType.NUMBER],
  [FormFieldType.DATE]: [ColumnType.DATE],
  [FormFieldType.CHECKBOX]: [ColumnType.CHECKBOX],
};

/** Field types whose answers come from a fixed option list. */
export const OPTION_FIELD_TYPES: FormFieldType[] = [
  FormFieldType.DROPDOWN,
  FormFieldType.SINGLE_SELECT,
  FormFieldType.MULTI_SELECT,
];

export const hasOptions = (type: FormFieldType): boolean => OPTION_FIELD_TYPES.includes(type);

/** Builder palette — the order fields are offered in the "add field" menu. */
export const FIELD_TYPE_LABELS: { type: FormFieldType; label: string; hint: string }[] = [
  { type: FormFieldType.SHORT_TEXT,    label: 'Short text',        hint: 'Single-line answer' },
  { type: FormFieldType.LONG_TEXT,     label: 'Long text',         hint: 'Multi-line text box' },
  { type: FormFieldType.DROPDOWN,      label: 'Dropdown',          hint: 'Pick one from a menu' },
  { type: FormFieldType.SINGLE_SELECT, label: 'Single selection',  hint: 'Radio list — one answer' },
  { type: FormFieldType.MULTI_SELECT,  label: 'Multiple selection', hint: 'Checkbox list — many answers' },
  { type: FormFieldType.CHECKBOX,      label: 'Checkbox',          hint: 'A single yes/no toggle' },
  { type: FormFieldType.NUMBER,        label: 'Number',            hint: 'Numeric answer' },
  { type: FormFieldType.DATE,          label: 'Date',              hint: 'Date picker' },
  { type: FormFieldType.EMAIL,         label: 'Email',             hint: 'Email address' },
  { type: FormFieldType.PHONE,         label: 'Phone',             hint: 'Phone number' },
];

export const fieldTypeLabel = (type: FormFieldType): string =>
  FIELD_TYPE_LABELS.find((t) => t.type === type)?.label ?? String(type);

/** Client-side ids for new fields/options; the backend keeps whatever it is sent. */
export const makeLocalId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The empty answer for a field type — matches what the backend stores for a blank value. */
export const emptyAnswer = (type: FormFieldType): FormAnswerValue => {
  if (type === FormFieldType.MULTI_SELECT) return [];
  if (type === FormFieldType.CHECKBOX) return false;
  if (type === FormFieldType.NUMBER) return null;
  return '';
};

export const isAnswered = (field: FormField, value: FormAnswerValue): boolean => {
  if (field.type === FormFieldType.CHECKBOX) return value === true;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== '';
};

/** Human-readable rendering of a stored answer, for read-only result views. */
export const formatAnswer = (field: FormField, value: FormAnswerValue): string => {
  if (field.type === FormFieldType.CHECKBOX) return value === true ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map((id) => field.options?.find((o) => o.id === id)?.label ?? id).join(', ');
  }
  if (value === null || value === undefined || value === '') return '';
  if (hasOptions(field.type)) {
    return field.options?.find((o) => o.id === value)?.label ?? String(value);
  }
  return String(value);
};
