/**
 * Console tracing for formula references — why a token shows a number, a 0, or stays at "…".
 *
 * Off by default to keep the console clean in normal use. Turn it on from the console with
 * `formulaDebug.on()` (and `formulaDebug.off()` to silence it again) when diagnosing a formula
 * issue; the choice is remembered per browser.
 */

const PREFIX = '%c[formula]';
const STYLE = 'color:#6366f1;font-weight:bold';
const STORAGE_KEY = 'formulaDebug';

let enabled: boolean | null = null;

export function formulaDebugEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      enabled = false;
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
    reset: () => { tracedLines.clear(); formulaDebugReset(); },
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
const tracedLines = new Set<string>();

export function sameColumnTrace(step: string, detail: Record<string, unknown>): void {
  if (!formulaDebugEnabled()) return;
  const flat = Object.entries(detail)
    .map(([k, v]) => `${k}=${v === undefined ? 'undefined' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ');
  const line = `[formula-trace] ${step}  ${flat}`;
  // Re-renders repeat the same evaluation verbatim. An identical line carries no new information,
  // and dozens of them bury the handful that do — but a line whose VALUES changed still prints,
  // which is the part worth seeing.
  if (tracedLines.has(line)) return;
  tracedLines.add(line);
  // console.log rather than warn: Chrome staples a stack trace to every warning, and those stacks
  // were the bulk of the noise.
  console.log(line);
}
