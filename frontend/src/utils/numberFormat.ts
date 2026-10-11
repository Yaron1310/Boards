/**
 * Formats a number with comma thousand separators (e.g. 5000 -> "5,000",
 * 500000000 -> "500,000,000"), preserving up to `fractionDigits` decimal
 * places for non-integers.
 */
export function formatGroupedNumber(value: number, fractionDigits = 2): string {
  const digits = Number.isInteger(value) ? 0 : fractionDigits;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Keeps only the characters of a numeric draft typed into a plain text box
 * (digits, one leading minus, one decimal point). Number cells use text inputs
 * instead of `type="number"` so the mouse wheel can never change a value while
 * the user is just trying to scroll the page.
 */
export function sanitizeNumberDraft(
  text: string,
  { allowDecimal = true, allowNegative = true }: { allowDecimal?: boolean; allowNegative?: boolean } = {},
): string {
  let out = '';
  let seenDot = false;
  for (const ch of text.trim()) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '-' && allowNegative && out === '') out += ch;
    else if ((ch === '.' || ch === ',') && allowDecimal && !seenDot) { out += '.'; seenDot = true; }
  }
  return out;
}
