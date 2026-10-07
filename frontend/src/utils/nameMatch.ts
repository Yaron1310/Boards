/** Lower-cased words of a name, ignoring punctuation, dashes, emoji and any other symbol. */
const nameWords = (name: string): Set<string> =>
  new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

/** Word-for-word match regardless of order, case or separators: "Company-xwz" ≡ "xwz company".
 *  Every word has to appear on both sides, so "xwz" alone does not match "xwz company". */
export function namesMatchByWords(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.size === 0 || wa.size !== wb.size) return false;
  for (const w of wa) if (!wb.has(w)) return false;
  return true;
}
