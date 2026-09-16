import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

// The app ships in English only. i18next is still used for all UI strings so the
// copy stays in one catalog rather than scattered through components, but there is
// no language detection, no language switching and no RTL layout: the document is
// always en/ltr, set once below.
//
// Note this is the *interface* language. Direction of user-entered content is a
// separate concern handled per value by utils/textDir.ts and the rich-text editor,
// so a board cell containing Hebrew or Arabic still renders right-to-left.
i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en'],
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    },
    interpolation: {
      escapeValue: false,
    },
  });

document.documentElement.dir = 'ltr';
document.documentElement.lang = 'en';

export default i18n;
