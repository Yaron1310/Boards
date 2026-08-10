/**
 * Console tracing for formula references — why a token shows a number, a 0, or stays at "…".
 *
 * On by default so a deployed build can be diagnosed without a rebuild. Silence it from the
 * console with `formulaDebug.off()` (and `formulaDebug.on()` to bring it back); the choice is
 * remembered per browser.
 */

const PREFIX = '%c[formula]';
const STYLE = 'color:#6366f1;font-weight:bold';
const STORAGE_KEY = 'formulaDebug';

let enabled: boolean | null = null;

export function formulaDebugEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

function setEnabled(next: boolean) {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Private mode / storage disabled — the in-memory flag still applies for this session.
  }
}

export function formulaLog(label: string, detail?: unknown): void {
  if (!formulaDebugEnabled()) return;
  if (detail === undefined) console.log(PREFIX, STYLE, label);
  else console.log(PREFIX, STYLE, label, detail);
}

/** How a reference ended up. `ok` carries a number; `empty` contributes 0; `unresolved` is "…". */
export type RefOutcome = 'ok' | 'empty' | 'unresolved';

// `resolve` runs on every render, so the same reference would otherwise log on a loop. Keyed by
// ref + outcome + reason, so a token that starts unresolved and later resolves still reports the
// change — only genuine repeats are dropped.
const seen = new Set<string>();

export function formulaRefLog(
  token: string,
  outcome: RefOutcome,
  reason: string,
  detail?: Record<string, unknown>,
): void {
  if (!formulaDebugEnabled()) return;
  const key = `${token}|${outcome}|${reason}`;
  if (seen.has(key)) return;
  seen.add(key);
  const icon = outcome === 'ok' ? '✓' : outcome === 'empty' ? '0' : '…';
  console.log(PREFIX, STYLE, `${icon} ${token}`, { outcome, reason, ...(detail ?? {}) });
}

/** Forget what has already been logged, so the next render reports the full picture again. */
export function formulaDebugReset(): void {
  seen.clear();
  formulaLog('trace reset — interact with the formula again to see fresh output');
}

interface FormulaDebugWindow extends Window {
  formulaDebug?: { on: () => void; off: () => void; reset: () => void };
}

if (typeof window !== 'undefined') {
  (window as FormulaDebugWindow).formulaDebug = {
    on: () => { setEnabled(true); seen.clear(); console.log('[formula] tracing on'); },
    off: () => { setEnabled(false); console.log('[formula] tracing off'); },
    reset: () => formulaDebugReset(),
  };
}

/**
 * Verbose, undeduplicated trace for one narrow case: a reference to a cell in a SIMPLE_FORMULA
 * column on the reference's own board — "the cell I clicked in the column I'm recording".
 *
 * Deliberately unlike `formulaRefLog`: every call prints, nothing is collapsed into an object the
 * console can hide, and it goes to console.warn so it survives a default log-level filter. Every
 * exit on that path reports, including the ones that return a bare 0 with nothing else to show
 * for it.
 */
export function sameColumnTrace(step: string, detail: Record<string, unknown>): void {
  if (!formulaDebugEnabled()) return;
  const flat = Object.entries(detail)
    .map(([k, v]) => `${k}=${v === undefined ? 'undefined' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ');
  console.warn(`[formula-trace] ${step}  ${flat}`);
}
