

// With the new firebase.json hosting rewrites, we no longer need complex logic
// to determine the backend URL. In production, requests to `/api/...` will be
// automatically forwarded to the backend function by Firebase Hosting.

// const DEVELOPMENT_BACKEND_URL = 'http://localhost:8080'; // For local dev with `firebase emulators:start`
const DEVELOPMENT_BACKEND_URL = 'https://api-72zxe6vfjq-uc.a.run.app'; // Live Production Backend

// `process.env.NODE_ENV` is a standard variable injected by many bundlers, including Vite.
// Vite replaces this with 'production' or 'development' at build time.
const isProduction = process.env.NODE_ENV === 'production';

// In production, the URL is relative (''), because hosting serves the API at the same domain.
// In development, it points to the local emulator.
export const BACKEND_API_URL = isProduction ? '' : DEVELOPMENT_BACKEND_URL;

// This log will appear in the browser's developer console to confirm the environment.
console.log(
    `%c[App Environment] Using backend root: ${isProduction ? window.location.origin : BACKEND_API_URL}`,
    'background: #1d4ed8; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
    `(Production Mode: ${isProduction})`
);

export const APP_NAME = 'Logyx';


// Default workspaces can still be defined here if needed for frontend fallbacks or initial setup,
// but primary source should be the backend.
export const DEFAULT_WORKSPACES = [
  { id: 'org1', name: 'Mindful Solutions Inc.' },
  { id: 'org2', name: 'Wellness Hub Co.' },
  { id: 'org3', name: 'Serene Paths LLC' },
];

// System prompts are now managed on the backend in /backend/src/config/prompts.ts

export const SUPPORTED_LANGUAGES_FOR_TRIGGERS = [
  { code: 'en', name: 'English' },
  { code: 'he', name: 'Hebrew' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ru', name: 'Russian' },
  // Add more languages as needed
];