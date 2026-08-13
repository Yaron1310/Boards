import { ColumnType, FormFieldType } from '../types/index.js';

/**
 * Column types a form field's answers may sync into. Kept in lockstep with the
 * frontend's COMPATIBLE_COLUMN_TYPES (components/forms/formFieldTypes.ts) — both
 * are restricted to column types whose stored value is a plain
 * string/number/boolean/date-string, matching what sanitizeAnswer already
 * produces for that field type. No id-remapping (dropdown/status options,
 * person ids, …) is attempted, so those column types are deliberately excluded.
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

export function isCompatibleColumnType(fieldType: FormFieldType, columnType: ColumnType): boolean {
  return !!COMPATIBLE_COLUMN_TYPES[fieldType]?.includes(columnType);
}
