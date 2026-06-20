/** Returns 'rtl' if the text starts with a Hebrew character, otherwise 'ltr'. */
export function getTextDir(text: string): 'rtl' | 'ltr' {
  return /^[֐-׿]/.test(text.trimStart()) ? 'rtl' : 'ltr';
}
