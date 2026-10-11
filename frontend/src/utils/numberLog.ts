import type { NumberLogEntry } from '../types';

/**
 * NUMBER_LOG cells store a history of values, each stamped with the moment it was typed. The
 * newest entry at or before a given moment is the value "in effect" then — unlike HOURS_LOG,
 * entries replace each other rather than add up.
 */

/** The cell's entries with a valid timestamp and value, oldest first. Accepts any stored value. */
export function numberLogEntries(value: unknown): NumberLogEntry[] {
  if (!Array.isArray(value)) return [];
  return (value as NumberLogEntry[])
    .filter((e) => e && typeof e.value === 'number' && !isNaN(e.value) && !isNaN(Date.parse(e.loggedAt)))
    .sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

/**
 * The value in effect at `at` (epoch ms; undefined = now): the newest entry logged at or before
 * it. Before the first entry there is no value (null) — unless `fallbackToFirst`, used when
 * pricing work logged before the first value was entered, so it isn't priced at 0.
 */
export function numberLogValueAt(value: unknown, at?: number, fallbackToFirst = false): number | null {
  const entries = numberLogEntries(value);
  if (entries.length === 0) return null;
  if (at === undefined) return entries[entries.length - 1].value;
  let found: NumberLogEntry | undefined;
  for (const e of entries) {
    if (Date.parse(e.loggedAt) <= at) found = e;
    else break;
  }
  if (found) return found.value;
  return fallbackToFirst ? entries[0].value : null;
}

/** The moments (epoch ms, ascending, de-duplicated) the cell's value changed, up to `until`. */
export function numberLogChangeTimes(value: unknown, until?: number): number[] {
  const times = numberLogEntries(value)
    .map((e) => Date.parse(e.loggedAt))
    .filter((t) => until === undefined || t <= until);
  return [...new Set(times)];
}

/** End of the given local calendar day ('YYYY-MM-DD') as epoch ms — the "as of" moment a board
 *  date filter stands for. Undefined for an unparseable day. */
export function endOfLocalDay(day: string): number | undefined {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return isNaN(d.getTime()) ? undefined : d.getTime();
}
