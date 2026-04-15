import { useEffect } from 'react';
import i18n, { getLanguageDir } from '../i18n';

/**
 * Forces the HTML element to lang="en" dir="ltr" while the component is mounted.
 * Restores the i18n-driven language on unmount.
 * Used by auth pages (login, register, reset password) to prevent RTL/Hebrew
 * from being applied to those pages.
 */
export function useForceDocumentLang(): void {
  useEffect(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    return () => {
      const currentLng = i18n.language;
      document.documentElement.lang = currentLng;
      document.documentElement.dir = getLanguageDir(currentLng);
    };
  }, []);
}
