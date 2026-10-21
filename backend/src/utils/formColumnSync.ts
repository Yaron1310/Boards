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

/**
 * A form is shared across boards with different column setups, so which column a
 * linked field targets can't be fixed at form-authoring time — it's resolved once,
 * per item, when the form is attached: candidates of the linked type are found on
 * that item's board, and if there's more than one, the caller (attachFormToItem)
 * must supply a columnId to pick one. The chosen columnId is then stored on the
 * response doc (DBFormResponse.columnSelections) and reused unchanged on every
 * later submit, so it doesn't need to be (and can't be) re-decided from a bare
 * type at submit time.
 */
export interface ColumnCandidates<C> {
  fieldId: string;
  columnType: ColumnType;
  candidates: C[];
}

/** Every linked field's matching columns on one board, keyed by field for the caller to inspect. */
export function findColumnCandidates<C extends { id: string; type: ColumnType }>(
  linkedFields: { id: string; linkedColumnType?: ColumnType }[],
  columns: C[],
): ColumnCandidates<C>[] {
  return linkedFields
    .filter((f): f is { id: string; linkedColumnType: ColumnType } => !!f.linkedColumnType)
    .map(f => ({
      fieldId: f.id,
      columnType: f.linkedColumnType,
      candidates: columns.filter(c => c.type === f.linkedColumnType),
    }));
}

/**
 * Normalizes a plain string answer destined for a LINK column the same way a
 * manual edit in LinkCell.tsx does (prepend https:// to a bare domain) — writing
 * the raw, unprefixed form answer would otherwise save a value isValidUrl()
 * rejects, leaving the cell showing plain text instead of a clickable link until
 * someone re-saves it by hand.
 */
export function normalizeLinkAnswer(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(www\.|\w[\w-]*\.\w)/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}
