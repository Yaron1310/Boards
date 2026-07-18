import { useEffect } from 'react';
import i18n, { getLanguageDir } from '../i18n';

/**
 * Forces the HTML element to lang="en" dir="ltr" while the component is mounted.
 * Restores the i18n-driven language on unmount.
 * Used by auth pages (login, register, reset password) to prevent RTL/Hebrew
 * from being applied to those pages.
 *
 * i18n.ts also listens for 'languageChanged'/'initialized' and re-applies the
 * detected language's dir/lang — those events can fire asynchronously (the
 * HttpBackend translation fetch, or the LanguageDetector resolving) *after*
 * this effect runs, clobbering the forced en/ltr. Re-forcing on those same
 * events for as long as this hook is mounted closes that race.
 */
export function useForceDocumentLang(): void {
  useEffect(() => {
    const force = () => {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    };
    force();
    i18n.on('languageChanged', force);
    i18n.on('initialized', force);
    return () => {
      i18n.off('languageChanged', force);
      i18n.off('initialized', force);
      const currentLng = i18n.language;
      document.documentElement.lang = currentLng;
      document.documentElement.dir = getLanguageDir(currentLng);
    };
  }, []);
}
