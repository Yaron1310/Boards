import { useEffect } from 'react';
import { setDocumentDirOverride, clearDocumentDirOverride } from '../i18n';

/**
 * Forces the HTML element to lang="en" dir="ltr" while the component is mounted.
 * The override is sticky: it also wins over i18n's async 'initialized' and
 * 'languageChanged' events, which would otherwise re-apply an RTL language
 * detected from localStorage after this hook has run.
 * Restores the i18n-driven language on unmount.
 * Used by auth pages (login, register, reset password) and the public
 * board view to prevent RTL/Hebrew from being applied to those pages.
 */
export function useForceDocumentLang(): void {
  useEffect(() => {
    setDocumentDirOverride({ dir: 'ltr', lang: 'en' });
    return () => {
      clearDocumentDirOverride();
    };
  }, []);
}
