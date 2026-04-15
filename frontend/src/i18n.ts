import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'he', name: 'עברית', dir: 'rtl' },
] as const;

export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export const RTL_LANGUAGES: SupportedLanguageCode[] = ['he'];

export function getLanguageDir(code: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(code as SupportedLanguageCode) ? 'rtl' : 'ltr';
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'he'],
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Keep the <html> dir and lang attributes in sync with the active language.
// This drives the global RTL layout via CSS [dir="rtl"] selectors.
function applyDocumentDir(lng: string) {
  const dir = getLanguageDir(lng);
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
}

i18n.on('languageChanged', applyDocumentDir);

// Apply immediately for the language resolved during init
i18n.on('initialized', () => applyDocumentDir(i18n.language));

export default i18n;
