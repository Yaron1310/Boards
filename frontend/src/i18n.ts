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

// While set, the <html> dir/lang are pinned to these values regardless of the
// active i18n language. i18n init is async (localStorage detection + HTTP-loaded
// translations), so a plain one-time write of dir="ltr" can be overwritten when
// the 'initialized'/'languageChanged' events fire afterwards — the override
// must win over those events too.
let documentDirOverride: { dir: 'ltr' | 'rtl'; lang: string } | null = null;

export function setDocumentDirOverride(override: { dir: 'ltr' | 'rtl'; lang: string }): void {
  documentDirOverride = override;
  document.documentElement.dir = override.dir;
  document.documentElement.lang = override.lang;
}

export function clearDocumentDirOverride(): void {
  documentDirOverride = null;
  applyDocumentDir(i18n.language);
}

// Keep the <html> dir and lang attributes in sync with the active language.
// This drives the global RTL layout via CSS [dir="rtl"] selectors.
function applyDocumentDir(lng: string) {
  if (documentDirOverride) {
    document.documentElement.dir = documentDirOverride.dir;
    document.documentElement.lang = documentDirOverride.lang;
    return;
  }
  const dir = getLanguageDir(lng);
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
}

i18n.on('languageChanged', applyDocumentDir);

// Apply immediately for the language resolved during init
i18n.on('initialized', () => applyDocumentDir(i18n.language));

export default i18n;
