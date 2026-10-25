/** Minimal typing for the Document Picture-in-Picture API (Chromium 116+; not in TypeScript's DOM lib). */
interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
}

const getPipApi = (): DocumentPictureInPicture | null =>
  (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;

export const isTimerPipSupported = (): boolean => getPipApi() !== null;

export const PIP_WIDTH = 320;
export const PIP_HEIGHT = 96;
/** Taller size while the stop popover is shown inside the window. */
export const PIP_HEIGHT_STOPPING = 260;

/**
 * Opens the floating timer window. Must run synchronously inside a click handler (the browser
 * requires a user gesture). Resolves to null if the browser refuses or has no support.
 */
export function openTimerPipWindow(): Promise<Window | null> {
  const api = getPipApi();
  if (!api) return Promise.resolve(null);
  return api.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT }).then(
    (win) => {
      win.document.title = 'Timer';
      copyStyles(win);
      const { dir, lang } = document.documentElement;
      win.document.documentElement.dir = dir;
      win.document.documentElement.lang = lang;
      return win;
    },
    () => null,
  );
}

/** Copies the app's stylesheets so Tailwind classes render in the new window. */
function copyStyles(win: Window): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = win.document.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      win.document.head.appendChild(style);
    } catch {
      // Cross-origin sheet: its rules are unreadable, so link it instead.
      if (sheet.href) {
        const link = win.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        win.document.head.appendChild(link);
      }
    }
  }
}

const PIP_DISABLED_KEY = 'logyx.timerPip.disabled';

/** Opens by default — only an explicit opt-out is stored. */
export const readTimerPipEnabled = (): boolean => {
  try { return localStorage.getItem(PIP_DISABLED_KEY) !== '1'; } catch { return true; }
};

export const writeTimerPipEnabled = (enabled: boolean): void => {
  try {
    if (enabled) localStorage.removeItem(PIP_DISABLED_KEY);
    else localStorage.setItem(PIP_DISABLED_KEY, '1');
  } catch { /* storage blocked — the choice just won't persist */ }
};
