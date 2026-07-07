/**
 * Safe arithmetic formula evaluator.
 * Supports:
 *   - numeric literals, +, -, *, /, ()
 *   - legacy positional cell references: {C3} (absolute), {C} (row-relative), {42} (literal)
 *   - stable ID references: {ref:<kind>:<boardId>:<columnId>:<row>}
 *       kind = 'b' (board item.values) | 'p' (personal-hub value store)
 *       row  = '@'        → relative to the current row (same board only)
 *            = <itemId>   → a specific item (required for cross-board references)
 * No eval() — uses a recursive-descent parser.
 *
 * Examples: "{B2} * {C2} + 10", "{ref:b:brd_1:col_9:@} * {ref:b:brd_2:col_3:itm_7}"
 */

import { ColumnType } from '../types';

export type ColumnValues = Record<string, number | null | undefined>;

/** Minimal shapes — real board Item[]/Column[] satisfy these structurally, and so do
 *  Personal Hub's pseudo-rows (items backed by personalItemValues instead of item.values).
 *  `id` is optional but required to resolve absolute ID refs ({ref:...:<itemId>}) locally;
 *  `groupId` is required to resolve group-summary refs. */
export interface FormulaRow { id?: string; groupId?: string; values: Record<string, unknown> }
export interface FormulaColumn { id: string; type: ColumnType }

/** Aggregate functions supported by group-summary references. */
export type SummaryCalc = 'sum' | 'avg' | 'median' | 'min' | 'max' | 'count';

/** A structured, stable-ID cell reference. */
export interface CellRef {
  /** Value source: board item.values ('b') or personal-hub value store ('p'). */
  kind: 'b' | 'p';
  boardId: string;
  columnId: string;
  /** null → relative to the current row (only valid for same-board refs); otherwise a specific item id. */
  itemId: string | null;
  /** When set, this is a group-summary reference: aggregate `columnId` across `groupId` with `agg`. */
  agg?: SummaryCalc;
  groupId?: string;
}

function parseTimeToMinutes(time: string): number | null {
  const m = time.match(/^(\d+):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function timeRangeIntervals(
  rows: FormulaRow[],
  columnId: string,
  getVal: (r: FormulaRow, c: string) => unknown,
): { s: number; e: number }[] {
  return rows
    .map((r) => {
      const v = getVal(r, columnId) as { start?: string; end?: string } | null | undefined;
      if (!v?.start || !v?.end) return null;
      const s = new Date(v.start).getTime();
      const e = new Date(v.end).getTime();
      return isNaN(s) || isNaN(e) ? null : { s, e };
    })
    .filter((x): x is { s: number; e: number } => x !== null);
}

/** Total unique calendar days covered by a set of intervals (union). */
function mergedDays(intervals: { s: number; e: number }[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.s - b.s);
  let total = 0;
  let curS = sorted[0].s;
  let curE = sorted[0].e;
  for (let i = 1; i < sorted.length; i++) {
    const { s, e } = sorted[i];
    if (s <= curE) { if (e > curE) curE = e; }
    else { total += Math.round((curE - curS) / 86_400_000) + 1; curS = s; curE = e; }
  }
  return total + Math.round((curE - curS) / 86_400_000) + 1;
}

/**
 * Numeric group-summary matching GroupSummaryRow's aggregation, for any column type:
 * count works for every type; NUMBER/TIME/TIME_RANGE produce numeric aggregates. Returns null
 * for combinations with no numeric meaning (e.g. avg of a text column). SIMPLE_FORMULA is not
 * summarizable here — callers exclude it as the formula→summary→formula data-loop guard.
 */
export function computeSummaryNumeric(
  rows: FormulaRow[],
  type: ColumnType,
  columnId: string,
  calc: SummaryCalc,
  getVal: (r: FormulaRow, c: string) => unknown = (r, c) => r.values[c],
): number | null {
  if (calc === 'count') {
    if (type === ColumnType.CHECKBOX) return rows.filter((r) => Boolean(getVal(r, columnId))).length;
    return rows.filter((r) => {
      const v = getVal(r, columnId);
      if (v == null || v === '') return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }).length;
  }
  if (type === ColumnType.NUMBER) {
    const vals = rows
      .map((r) => getVal(r, columnId))
      .filter((v) => v != null && v !== '')
      .map((v) => Number(v))
      .filter((n) => !isNaN(n));
    return aggregateSummary(vals, calc);
  }
  if (type === ColumnType.TIME) {
    const vals = rows
      .map((r) => parseTimeToMinutes((getVal(r, columnId) as string) ?? ''))
      .filter((n): n is number => n !== null);
    return aggregateSummary(vals, calc);
  }
  if (type === ColumnType.TIME_RANGE) {
    const iv = timeRangeIntervals(rows, columnId, getVal);
    if (calc === 'sum') return iv.length ? mergedDays(iv) : null;
    const days = iv.map(({ s, e }) => Math.max(1, Math.round((e - s) / 86_400_000) + 1));
    return aggregateSummary(days, calc);
  }
  return null;
}

/** Aggregate a list of numbers. Returns null when there is nothing to aggregate (except count → 0). */
export function aggregateSummary(vals: number[], calc: SummaryCalc): number | null {
  if (calc === 'count') return vals.length;
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  switch (calc) {
    case 'sum': return sum;
    case 'avg': return sum / vals.length;
    case 'min': return Math.min(...vals);
    case 'max': return Math.max(...vals);
    case 'median': {
      const s = [...vals].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    default: return null;
  }
}

export interface FormulaContext {
  allItems: FormulaRow[];
  columns: FormulaColumn[];
  /** 0-based index of the current item in allItems — required for relative {C}/{ref:...:@} refs */
  currentRowIndex?: number;
  /** Board the formula lives on — lets the engine resolve same-board ID refs from `allItems`/`columns`
   *  directly and tell same-board refs apart from foreign ones. */
  homeBoardId?: string;
  /** Resolver for refs the engine cannot satisfy locally (foreign boards, personal-hub, etc.).
   *  Return a number, `null` if the target is known but empty/non-numeric (contributes 0), or
   *  `undefined` if it cannot be resolved yet (data still loading, or the target no longer exists). */
  resolveRef?: (ref: CellRef) => number | null | undefined;
  /** Called for every ref the engine could not resolve — lets the caller drive loading/error UI. */
  onUnresolvedRef?: (ref: CellRef) => void;
}

/** Parse the inner text of a `{ref:...}` token into a CellRef, or null if malformed.
 *  boardId/columnId/itemId are generated IDs (UUIDs / Firestore auto-ids) and never contain ':'. */
export function parseRefToken(inner: string): CellRef | null {
  const trimmed = inner.trim();
  if (!trimmed.startsWith('ref:')) return null;
  const parts = trimmed.split(':');
  if (parts.length !== 5) return null;
  const [, kind, boardId, columnId, row] = parts;
  if (kind !== 'b' && kind !== 'p') return null;
  // boardId may be empty for Personal Hub "all-groups" columns (no single owning board);
  // 'p' refs resolve by itemId+columnId regardless of board, so an empty boardId is valid.
  if (!columnId || !row) return null;
  // Group-summary refs encode the row slot as `sum#<agg>#<groupId>` (Firestore ids carry no ':'/'#').
  if (row.startsWith('sum#')) {
    const [, agg, groupId] = row.split('#');
    return { kind, boardId, columnId, itemId: null, agg: agg as SummaryCalc, groupId: groupId || undefined };
  }
  return { kind, boardId, columnId, itemId: row === '@' ? null : row };
}

/** Serialize a CellRef back into its `{ref:...}` token form. */
export function serializeRef(ref: CellRef): string {
  const row = ref.agg ? `sum#${ref.agg}#${ref.groupId ?? ''}` : (ref.itemId ?? '@');
  return `{ref:${ref.kind}:${ref.boardId}:${ref.columnId}:${row}}`;
}

class FormulaParser {
  private pos = 0;
  private input: string;
  private values: ColumnValues;
  private context?: FormulaContext;

  constructor(input: string, values: ColumnValues, context?: FormulaContext) {
    this.input = input.trim();
    this.values = values;
    this.context = context;
  }

  parse(): number | null {
    if (!this.input) return null;
    const result = this.parseExpr();
    this.skipWs();
    if (this.pos < this.input.length) return null;
    return result;
  }

  private skipWs() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }

  private parseExpr(): number {
    let left = this.parseTerm();
    this.skipWs();
    while (this.pos < this.input.length && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
      const op = this.input[this.pos++];
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
      this.skipWs();
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseUnary();
    this.skipWs();
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === '*' || ch === '/') {
        this.pos++;
        const right = this.parseUnary();
        left = ch === '*' ? left * right : right !== 0 ? left / right : 0;
      } else if (ch === '{' || ch === '(' || /[\d.]/.test(ch)) {
        // Implicit multiplication: two operands adjacent with no operator between them mean ×
        // (e.g. a clicked cell value {20} immediately followed by a typed 2 → 20 × 2 = 40).
        // A bare number like "202" is still a single literal — the boundary only appears at a
        // `{…}` token or parenthesis, never inside a run of digits.
        const right = this.parseUnary();
        left = left * right;
      } else {
        break;
      }
      this.skipWs();
    }
    return left;
  }

  private parseUnary(): number {
    this.skipWs();
    if (this.pos < this.input.length && this.input[this.pos] === '-') {
      this.pos++;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWs();
    if (this.pos >= this.input.length) return 0;

    if (this.input[this.pos] === '(') {
      this.pos++;
      const val = this.parseExpr();
      this.skipWs();
      if (this.input[this.pos] === ')') this.pos++;
      return val;
    }

    // {…} — ID ref like {ref:b:...}, positional cell ref like {C3}, or numeric literal like {42}
    if (this.input[this.pos] === '{') {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
      const name = this.input.slice(start, this.pos);
      if (this.input[this.pos] === '}') this.pos++;

      const trimmed = name.trim();

      // Stable ID reference: {ref:<kind>:<boardId>:<columnId>:<row>}
      if (trimmed.startsWith('ref:')) {
        const ref = parseRefToken(trimmed);
        if (!ref) return 0;
        return this.resolveStructuredRef(ref);
      }

      // Numeric literal: {42}
      const asNum = Number(trimmed);
      if (trimmed !== '' && !isNaN(asNum)) return asNum;

      // Legacy positional cell reference: {C3} (absolute) or {C} (relative to current row)
      if (this.context && /^[A-Z]+\d*$/i.test(trimmed)) {
        return this.resolveCellRef(trimmed);
      }

      // Fall back: treat as column name (legacy, no longer emitted)
      const v = this.values[trimmed];
      return v != null && !isNaN(Number(v)) ? Number(v) : 0;
    }

    // Number literal
    const numMatch = this.input.slice(this.pos).match(/^(\d+\.?\d*|\.\d+)/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }

    return 0;
  }

  /** Resolve a stable-ID ref: same-board refs are satisfied from local context; anything
   *  else is delegated to context.resolveRef. Unresolved refs contribute 0 and are reported. */
  private resolveStructuredRef(ref: CellRef): number {
    const ctx = this.context;
    // Same-board refs (either kind) resolve from local context: on a regular board `allItems`
    // carry item.values; in the Personal Hub the pseudo-rows carry personalItemValues.
    const isHome = !!ctx?.homeBoardId && ref.boardId === ctx.homeBoardId;

    if (isHome) {
      const local = this.resolveLocalById(ref);
      if (local !== undefined) return local;
    }

    if (ctx?.resolveRef) {
      const v = ctx.resolveRef(ref);
      if (v !== undefined) return v ?? 0;
    }

    ctx?.onUnresolvedRef?.(ref);
    return 0;
  }

  /** Resolve a same-board ID ref from allItems/columns. Returns undefined when it cannot be
   *  satisfied locally (unknown column/item, non-number column, or missing row id for absolute refs). */
  private resolveLocalById(ref: CellRef): number | undefined {
    const ctx = this.context;
    if (!ctx) return undefined;

    if (ref.agg) return this.resolveLocalSummary(ref);

    const col = ctx.columns.find((c) => c.id === ref.columnId);
    if (!col || col.type !== ColumnType.NUMBER) return undefined;

    let item: FormulaRow | undefined;
    if (ref.itemId === null) {
      if (ctx.currentRowIndex === undefined) return undefined;
      item = ctx.allItems[ctx.currentRowIndex];
    } else {
      item = ctx.allItems.find((it) => it.id === ref.itemId);
    }
    if (!item) return undefined;

    const val = item.values[col.id];
    return val != null && !isNaN(Number(val)) ? Number(val) : 0;
  }

  /** Aggregate a NUMBER column across one group from local context. Only NUMBER columns are
   *  summarizable — this is the data-loop guard: a summary never aggregates a formula column,
   *  so a formula → summary → formula cycle cannot form. */
  private resolveLocalSummary(ref: CellRef): number | undefined {
    const ctx = this.context;
    if (!ctx || !ref.agg) return undefined;
    const col = ctx.columns.find((c) => c.id === ref.columnId);
    if (!col || col.type === ColumnType.SIMPLE_FORMULA) return undefined; // loop guard
    // Board summaries aggregate one group; Personal Hub summaries aggregate the whole table
    // (its rows are already the one board's items — personal rows carry no board groupId).
    const rows = ref.kind === 'p' ? ctx.allItems : ctx.allItems.filter((it) => it.groupId === ref.groupId);
    return computeSummaryNumeric(rows, col.type, col.id, ref.agg) ?? 0;
  }

  private resolveCellRef(cellRef: string): number {
    if (!this.context) return 0;

    // {C3} = absolute (column C, row 3); {C} = relative (column C, current row)
    const absMatch = cellRef.match(/^([A-Z]+)(\d+)$/i);
    const relMatch = !absMatch ? cellRef.match(/^([A-Z]+)$/i) : null;
    if (!absMatch && !relMatch) return 0;

    const colLetter = (absMatch ? absMatch[1] : relMatch![1]).toUpperCase();
    const colIndex = this.colLetterToIndex(colLetter);
    if (colIndex < 0 || colIndex >= this.context.columns.length + 1) return 0;
    if (colIndex === 0) return 0; // Column A is the Name — not numeric

    let rowIndex: number;
    if (absMatch) {
      rowIndex = parseInt(absMatch[2], 10) - 1; // 1-based → 0-based
    } else {
      if (this.context.currentRowIndex === undefined) return 0;
      rowIndex = this.context.currentRowIndex;
    }
    if (rowIndex < 0 || rowIndex >= this.context.allItems.length) return 0;

    const item = this.context.allItems[rowIndex];
    if (!item) return 0;

    // Column B is columns[0], Column C is columns[1], etc.
    const col = this.context.columns[colIndex - 1];
    if (!col || col.type !== ColumnType.NUMBER) return 0;

    const val = item.values[col.id];
    return val != null && !isNaN(Number(val)) ? Number(val) : 0;
  }

  private colLetterToIndex(letter: string): number {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
      index = index * 26 + (letter.charCodeAt(i) - 64); // A=1, B=2, ..., Z=26
    }
    return index - 1; // Convert to 0-based
  }
}

export function evaluateFormula(
  formula: string,
  columnValues: ColumnValues,
  context?: FormulaContext,
): number | null {
  if (!formula || !formula.trim()) return null;
  try {
    const parser = new FormulaParser(formula, columnValues, context);
    const result = parser.parse();
    if (result === null || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/** All stable-ID references in a formula (legacy positional refs are not returned — they carry
 *  no board/column/item identity). Used for foreign-data loading and dependency tracking. */
export function extractRefs(formula: string): CellRef[] {
  const refs: CellRef[] = [];
  const re = /\{(ref:[^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const ref = parseRefToken(m[1]);
    if (ref) refs.push(ref);
  }
  return refs;
}

/** Foreign (cross-board) references only — those the local board context cannot resolve. */
export function extractForeignRefs(formula: string, homeBoardId: string): CellRef[] {
  return extractRefs(formula).filter((r) => r.boardId !== homeBoardId);
}

/** Convert a legacy positional formula ({C3}/{C}) into stable-ID refs. Runs on the origin
 *  board at edit-start, where column order + item order are known. Idempotent: existing
 *  {ref:...} tokens, numeric literals, and unconvertible tokens are left untouched.
 *  Column letters map A=Name, B=columns[0], C=columns[1], …; row numbers are 1-based into `items`. */
export function convertLegacyToIdRefs(
  formula: string,
  opts: { boardId: string; kind?: 'b' | 'p'; columns: { id: string }[]; items: { id: string }[] },
): string {
  const { boardId, kind = 'b', columns, items } = opts;
  const colIdForLetter = (letter: string): string | null => {
    let idx = 0;
    for (let i = 0; i < letter.length; i++) idx = idx * 26 + (letter.toUpperCase().charCodeAt(i) - 64);
    // idx is 1-based (A=1). Column A is the Name; B(=2)→columns[0], so columns[idx-2].
    const colArrIndex = idx - 2;
    if (colArrIndex < 0 || colArrIndex >= columns.length) return null;
    return columns[colArrIndex].id;
  };

  return formula.replace(/\{([^}]*)\}/g, (whole, inner: string) => {
    const t = inner.trim();
    if (t.startsWith('ref:')) return whole; // already an ID ref
    if (t !== '' && !isNaN(Number(t))) return whole; // numeric literal

    const abs = t.match(/^([A-Za-z]+)(\d+)$/); // {C3}
    if (abs) {
      const colId = colIdForLetter(abs[1]);
      const item = items[parseInt(abs[2], 10) - 1];
      if (colId && item) return serializeRef({ kind, boardId, columnId: colId, itemId: item.id });
      return whole;
    }
    const rel = t.match(/^([A-Za-z]+)$/); // {C} — relative to current row
    if (rel) {
      const colId = colIdForLetter(rel[1]);
      if (colId) return serializeRef({ kind, boardId, columnId: colId, itemId: null });
      return whole;
    }
    return whole;
  });
}

/** Relativize same-board refs (itemId → '@') so a formula can serve as a column-wide default,
 *  matching the legacy makeRelativeFormula behavior. Foreign refs stay absolute. */
export function makeRelativeIdFormula(formula: string, homeBoardId: string): string {
  return formula.replace(/\{(ref:[^}]*)\}/g, (whole, inner: string) => {
    const ref = parseRefToken(inner);
    if (!ref) return whole;
    // Make same-table references row-relative so the formula fills down correctly. This applies
    // to board ('b') and Personal Hub ('p') cells alike — a personal same-table ref is home when
    // its boardId matches. Cross-board/foreign refs (different boardId) and group-summary refs
    // (already row-agnostic) are left untouched. resolveLocalById handles relative refs of either
    // kind identically via currentRowIndex, so this is safe.
    if (!ref.agg && ref.boardId === homeBoardId) {
      return serializeRef({ ...ref, itemId: null });
    }
    return whole;
  });
}

export function extractColumnRefs(formula: string): string[] {
  const refs: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}
