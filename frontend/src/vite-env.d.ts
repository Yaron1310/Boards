/// <reference types="vite/client" />

interface RecaptchaEnterprise {
  ready: (callback: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

interface Window {
  grecaptcha: {
    enterprise: RecaptchaEnterprise;
  };
}

/** The app's release version, from package.json (injected at build time by vite.config.ts). */
declare const __APP_VERSION__: string;

/** Unique id of this build (version + build time), also written to /version.json. */
declare const __BUILD_ID__: string;
