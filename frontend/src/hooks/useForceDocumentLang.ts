import { useEffect } from 'react';
import { setDocumentDirOverride, clearDocumentDirOverride } from '../i18n';

/**
 * Forces the HTML element to lang="en" dir="ltr" while the component is mounted.
 * Restores the i18n-driven language on unmount.
 * Used by auth pages (login, register, reset password) and the public
 * board view to prevent RTL/Hebrew from being applied to those pages.
 *
 * i18n.ts re-applies the detected language's dir/lang on its
 * 'languageChanged'/'initialized' events, which can fire asynchronously (the
 * HttpBackend translation fetch, or the LanguageDetector resolving) *after*
 * this effect runs. The override registered here is sticky: i18n.ts checks it
 * before applying those events, so the forced en/ltr wins regardless of timing.
 */
export function useForceDocumentLang(): void {
  useEffect(() => {
    setDocumentDirOverride({ dir: 'ltr', lang: 'en' });
    return () => {
      clearDocumentDirOverride();
    };
  }, []);
}
