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
 * Which single column, among a board's columns, a linked field's answer should be
 * written to — or null if that can't be determined safely.
 *
 * A board can have more than one column of the same type, so type alone doesn't
 * pick one: with exactly one column of the linked type we use it (the common case,
 * and backward-compatible with fields linked before names were required); with
 * more than one, `linkedColumnName` must exactly match (case-insensitive) one of
 * them, otherwise we skip the sync entirely rather than guess and write to the
 * wrong column.
 */
export function resolveLinkedColumn<C extends { id: string; name: string; type: ColumnType }>(
  columns: C[],
  linkedColumnType: ColumnType,
  linkedColumnName: string | undefined,
): C | null {
  const candidates = columns.filter(c => c.type === linkedColumnType);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const wanted = linkedColumnName?.trim().toLowerCase();
  if (!wanted) return null;
  return candidates.find(c => c.name.trim().toLowerCase() === wanted) ?? null;
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
