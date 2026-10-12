import { ColumnType } from '../types';
import { numberLogLatestValue } from './numberLog';

/** Converts one cell's raw value from `from`'s storage format to `to`'s. Returns `undefined`
 *  when this particular value can't be converted (e.g. non-numeric text going to NUMBER) —
 *  the caller should then just leave that cell empty rather than write garbage. */
type Converter = (value: unknown) => unknown | undefined;

const numberToText: Converter = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

const textToNumber: Converter = (v) => {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

const passthroughString: Converter = (v) => (typeof v === 'string' && v !== '' ? v : undefined);

// A NUMBER cell's value becomes a plain numeric-literal formula string (e.g. 42 -> "42"),
// which SimpleFormulaCell evaluates back to the same number.
const numberToFormula: Converter = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

// Only a formula that's just a bare numeric literal (no refs/operators) converts cleanly —
// anything else has no single well-defined number to carry over.
const formulaToNumber: Converter = (v) => {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

// NUMBER -> NUMBER_LOG: the value becomes the log's first entry, stamped with the conversion time.
const numberToNumberLog: Converter = (v) => (typeof v === 'number' && Number.isFinite(v)
  ? [{ id: crypto.randomUUID(), value: v, loggedAt: new Date().toISOString() }]
  : undefined);

// NUMBER_LOG -> NUMBER / TEXT: the newest value (whatever its start/end dates).
const numberLogToNumber: Converter = (v) => numberLogLatestValue(v) ?? undefined;
const numberLogToText: Converter = (v) => {
  const n = numberLogLatestValue(v);
  return n === null ? undefined : String(n);
};

const CONVERTERS: Partial<Record<ColumnType, Partial<Record<ColumnType, Converter>>>> = {
  [ColumnType.NUMBER]: {
    [ColumnType.TEXT]: numberToText,
    [ColumnType.SIMPLE_FORMULA]: numberToFormula,
    [ColumnType.NUMBER_LOG]: numberToNumberLog,
  },
  [ColumnType.NUMBER_LOG]: {
    [ColumnType.NUMBER]: numberLogToNumber,
    [ColumnType.TEXT]: numberLogToText,
  },
  [ColumnType.TEXT]: {
    [ColumnType.NUMBER]: textToNumber,
    [ColumnType.LINK]: passthroughString,
  },
  [ColumnType.LINK]: {
    [ColumnType.TEXT]: passthroughString,
  },
  [ColumnType.SIMPLE_FORMULA]: {
    [ColumnType.NUMBER]: formulaToNumber,
  },
};

/** Whether values in a column of type `from` can be meaningfully carried over to type `to`. */
export function canConvertColumnValue(from: ColumnType, to: ColumnType): boolean {
  return from !== to && !!CONVERTERS[from]?.[to];
}

/** Converts a single cell value between column-type storage formats. See `Converter` above for
 *  the `undefined` (not-convertible) contract. */
export function convertColumnValue(from: ColumnType, to: ColumnType, value: unknown): unknown | undefined {
  return CONVERTERS[from]?.[to]?.(value);
}
