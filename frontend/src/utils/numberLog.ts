import type { NumberLogEntry } from '../types';

/**
 * NUMBER_LOG cells store a history of values, each stamped with the moment it was typed. The
 * newest entry at or before a given moment is the value "in effect" then — unlike HOURS_LOG,
 * entries replace each other rather than add up.
 *
 * Optional bounds: the first entry may carry `startsOn` and the last `endsOn` (local calendar
 * days, 'YYYY-MM-DD'). The cell has no value before the start of `startsOn` or after the end of
 * `endsOn` — it counts as 0 there. With a start date, the first value applies from that day
 * (earlier or later than when it was typed).
 */

/** The cell's entries with a valid timestamp and value, oldest first. Accepts any stored value. */
export function numberLogEntries(value: unknown): NumberLogEntry[] {
  if (!Array.isArray(value)) return [];
  return (value as NumberLogEntry[])
    .filter((e) => e && typeof e.value === 'number' && !isNaN(e.value) && !isNaN(Date.parse(e.loggedAt)))
    .sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

const dayParts = (day: string | undefined) => day?.match(/^(\d{4})-(\d{2})-(\d{2})/);

/** Start of the given local calendar day ('YYYY-MM-DD') as epoch ms. */
export function startOfLocalDay(day: string | undefined): number | undefined {
  const m = dayParts(day);
  if (!m) return undefined;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return isNaN(t) ? undefined : t;
}

/** End of the given local calendar day ('YYYY-MM-DD') as epoch ms — the "as of" moment a board
 *  date filter stands for. Undefined for an unparseable day. */
export function endOfLocalDay(day: string | undefined): number | undefined {
  const m = dayParts(day);
  if (!m) return undefined;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
  return isNaN(t) ? undefined : t;
}

/** The local calendar day ('YYYY-MM-DD') of an ISO timestamp. */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The cell's start / end bounds as epoch ms (undefined when not set). */
export function numberLogBounds(entries: NumberLogEntry[]): { start?: number; end?: number } {
  if (entries.length === 0) return {};
  return {
    start: startOfLocalDay(entries[0].startsOn),
    end: endOfLocalDay(entries[entries.length - 1].endsOn),
  };
}

/**
 * The value in effect at `at` (epoch ms; undefined = now), or null when there is none: before
 * the start date, after the end date, or — with no start date — before the first entry, unless
 * `fallbackToFirst` (used when pricing work logged before the first value was entered, so it
 * isn't priced at 0; a start date replaces that fallback).
 */
export function numberLogValueAt(value: unknown, at?: number, fallbackToFirst = false): number | null {
  const entries = numberLogEntries(value);
  if (entries.length === 0) return null;
  const t = at ?? Date.now();
  const { start, end } = numberLogBounds(entries);
  if (start !== undefined && t < start) return null;
  if (end !== undefined && t > end) return null;
  let found: NumberLogEntry | undefined;
  for (const e of entries) {
    if (Date.parse(e.loggedAt) <= t) found = e;
    else break;
  }
  if (found) return found.value;
  // Before the first entry: a start date (already passed above) extends the first value back.
  if (start !== undefined || fallbackToFirst) return entries[0].value;
  // "Now" a hair before a just-typed entry's timestamp (clock skew) still means its value.
  return at === undefined ? entries[entries.length - 1].value : null;
}

/** The newest value, ignoring any start/end dates — what the cell holds, for type conversion. */
export function numberLogLatestValue(value: unknown): number | null {
  const entries = numberLogEntries(value);
  return entries.length > 0 ? entries[entries.length - 1].value : null;
}

/** The moments (epoch ms, ascending, de-duplicated) the cell's value changed, up to `until`:
 *  every entry, plus the start date and the moment right after the end date. */
export function numberLogChangeTimes(value: unknown, until?: number): number[] {
  const entries = numberLogEntries(value);
  const { start, end } = numberLogBounds(entries);
  const times = entries.map((e) => Date.parse(e.loggedAt));
  if (start !== undefined) times.push(start);
  if (end !== undefined) times.push(end + 1);
  return [...new Set(times.filter((t) => until === undefined || t <= until))].sort((a, b) => a - b);
}

/** Whether the cell had a value in effect at any moment within [from, to] (epoch ms). */
export function numberLogHasValueDuring(value: unknown, from: number, to: number): boolean {
  const entries = numberLogEntries(value);
  if (entries.length === 0) return false;
  const { start, end } = numberLogBounds(entries);
  const effectiveStart = start ?? Date.parse(entries[0].loggedAt);
  const effectiveEnd = end ?? Infinity;
  return effectiveStart <= to && effectiveEnd >= from;
}
