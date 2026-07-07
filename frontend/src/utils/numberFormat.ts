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
