/**
 * Safe arithmetic formula evaluator.
 * Supports: numeric literals, {ColumnName} references, +, -, *, /, ()
 * No eval() — uses a recursive-descent parser.
 *
 * Example: "{Price} * {Qty} + 10"
 */

export type ColumnValues = Record<string, number | null | undefined>;

class FormulaParser {
  private pos = 0;
  private input: string;
  private values: ColumnValues;

  constructor(input: string, values: ColumnValues) {
    this.input = input.trim();
    this.values = values;
  }

  parse(): number | null {
    if (!this.input) return null;
    const result = this.parseExpr();
    this.skipWs();
    if (this.pos < this.input.length) return null; // leftover chars → invalid
    return result;
  }

  private skipWs() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }

  // expr = term (('+' | '-') term)*
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

  // term = unary (('*' | '/') unary)*
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

  // unary = '-' unary | primary
  private parseUnary(): number {
    this.skipWs();
    if (this.pos < this.input.length && this.input[this.pos] === '-') {
      this.pos++;
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  // primary = '(' expr ')' | number | '{' colName '}'
  private parsePrimary(): number {
    this.skipWs();
    if (this.pos >= this.input.length) return 0;

    // Parentheses
    if (this.input[this.pos] === '(') {
      this.pos++;
      const val = this.parseExpr();
      this.skipWs();
      if (this.input[this.pos] === ')') this.pos++;
      return val;
    }

    // {…} — either a numeric literal like {42} or a column reference like {Price}
    if (this.input[this.pos] === '{') {
      this.pos++;
      const start = this.pos;
      while (this.pos < this.input.length && this.input[this.pos] !== '}') this.pos++;
      const name = this.input.slice(start, this.pos);
      if (this.input[this.pos] === '}') this.pos++;
      // If the content is a plain number, treat it as a literal value
      const asNum = Number(name.trim());
      if (name.trim() !== '' && !isNaN(asNum)) return asNum;
      // Otherwise look up as a column reference
      const v = this.values[name];
      return v != null && !isNaN(Number(v)) ? Number(v) : 0;
    }

    // Number literal (including leading dot like .5)
    const numMatch = this.input.slice(this.pos).match(/^(\d+\.?\d*|\.\d+)/);
    if (numMatch) {
      this.pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }

    return 0;
  }
}

/**
 * Evaluates a formula string with the given column values.
 * Returns null if the formula is empty or invalid.
 */
export function evaluateFormula(formula: string, columnValues: ColumnValues): number | null {
  if (!formula || !formula.trim()) return null;
  try {
    const parser = new FormulaParser(formula, columnValues);
    const result = parser.parse();
    if (result === null || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Extracts all {ColumnName} references from a formula string.
 */
export function extractColumnRefs(formula: string): string[] {
  const refs: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}
