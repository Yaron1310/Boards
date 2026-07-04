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
 *  `id` is optional but required to resolve absolute ID refs ({ref:...:<itemId>}) locally. */
export interface FormulaRow { id?: string; values: Record<string, unknown> }
export interface FormulaColumn { id: string; type: ColumnType }

/** A structured, stable-ID cell reference. */
export interface CellRef {
  /** Value source: board item.values ('b') or personal-hub value store ('p'). */
  kind: 'b' | 'p';
  boardId: string;
  columnId: string;
  /** null → relative to the current row (only valid for same-board refs); otherwise a specific item id. */
  itemId: string | null;
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
  if (!boardId || !columnId || !row) return null;
  return { kind, boardId, columnId, itemId: row === '@' ? null : row };
}

/** Serialize a CellRef back into its `{ref:...}` token form. */
export function serializeRef(ref: CellRef): string {
  return `{ref:${ref.kind}:${ref.boardId}:${ref.columnId}:${ref.itemId ?? '@'}}`;
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
    while (this.pos < this.input.length && (this.input[this.pos] === '*' || this.input[this.pos] === '/')) {
      const op = this.input[this.pos++];
      const right = this.parseUnary();
      left = op === '*' ? left * right : right !== 0 ? left / right : 0;
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
    const isHome =
      ref.kind === 'b' && !!ctx?.homeBoardId && ref.boardId === ctx.homeBoardId;

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
  return extractRefs(formula).filter((r) => !(r.kind === 'b' && r.boardId === homeBoardId));
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
