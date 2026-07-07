/**
 * Matches Hebrew (U+0590-U+05FF), Arabic (U+0600-U+06FF, U+0750-U+077F,
 * U+08A0-U+08FF), and Arabic/Hebrew presentation forms
 * (U+FB1D-U+FB4F, U+FB50-U+FDFF, U+FE70-U+FEFF) characters.
 */
const RTL_CHAR_RE = new RegExp(
  '[\\u0590-\\u05FF\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF' +
    '\\uFB1D-\\uFB4F\\uFB50-\\uFDFF\\uFE70-\\uFEFF]'
);

/** Returns 'rtl' if the text contains a Hebrew or Arabic character, otherwise 'ltr'. */
export function getTextDir(text: string): 'rtl' | 'ltr' {
  return RTL_CHAR_RE.test(text) ? 'rtl' : 'ltr';
}
