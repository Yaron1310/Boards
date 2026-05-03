/**
 * Safe arithmetic formula evaluator.
 * Supports: numeric literals, cell references like {C3}, +, -, *, /, ()
 * No eval() — uses a recursive-descent parser.
 *
 * Example: "{B2} * {C2} + 10"
 */

import type { Item, Column } from '../types';
import { ColumnType } from '../types';

export type ColumnValues = Record<string, number | null | undefined>;

export interface FormulaContext {
  allItems: Item[];
  columns: Column[];
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

    // {…} — cell reference like {C3}, numeric literal like {42}
    if (this.input[this.pos] === '{') {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
      const name = this.input.slice(start, this.pos);
      if (this.input[this.pos] === '}') this.pos++;

      const trimmed = name.trim();

      // Try to parse as numeric literal
      const asNum = Number(trimmed);
      if (trimmed !== '' && !isNaN(asNum)) return asNum;

      // Try to parse as cell reference {C3}
      if (this.context && /^[A-Z]+\d+$/i.test(trimmed)) {
        const val = this.resolveCellRef(trimmed);
        return val;
      }

      // Fall back: treat as column name (for backward compat, though we're not using this now)
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

  private resolveCellRef(cellRef: string): number {
    if (!this.context) return 0;

    // Parse {C3} → column C (index 2), row 3 (index 2, 0-based)
    const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return 0;

    const colLetter = match[1].toUpperCase();
    const rowNum = parseInt(match[2], 10);

    // Convert column letter to 0-based index
    const colIndex = this.colLetterToIndex(colLetter);
    if (colIndex < 0 || colIndex >= this.context.columns.length + 1) return 0; // +1 for Name column

    // Convert row number to 0-based index
    const rowIndex = rowNum - 1;
    if (rowIndex < 0 || rowIndex >= this.context.allItems.length) return 0;

    const item = this.context.allItems[rowIndex];
    if (!item) return 0;

    if (colIndex === 0) return 0; // Column A is the Name, which is not numeric

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

export function extractColumnRefs(formula: string): string[] {
  const refs: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}
