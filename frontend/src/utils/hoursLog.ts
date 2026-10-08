import { ColumnType } from '../types';
import type { HoursLogColumnSettings, HoursLogEntry, PersonalColumn } from '../types';

/** Minute increments the duration picker offers — an HOURS_LOG cell only ever stores multiples
 *  of one of these, in either field. */
export const HOURS_LOG_MINUTE_STEPS = [0, 15, 30, 45] as const;

export function sumHoursLogMinutes(entries: HoursLogEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, e) => sum + (typeof e.minutes === 'number' && !isNaN(e.minutes) ? e.minutes : 0), 0);
}

/**
 * A time period an hours reference is limited to: an inclusive range of calendar days
 * ('YYYY-MM-DD'), judged in the viewer's local time against each entry's `loggedAt` (when the
 * entry was added). A year is 1 Jan – 31 Dec, a month its first to last day.
 */
export interface HoursPeriod {
  from: string;
  to: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const localDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The entries logged within `period` (all of them when there is no period). Accepts any stored
 *  cell value — a non-array (an empty cell) yields no entries. */
export function filterHoursLogByPeriod(value: unknown, period?: HoursPeriod): HoursLogEntry[] {
  const entries = Array.isArray(value) ? (value as HoursLogEntry[]) : [];
  if (!period) return entries;
  return entries.filter((e) => {
    const d = new Date(e.loggedAt);
    if (isNaN(d.getTime())) return false;
    const day = localDay(d);
    return day >= period.from && day <= period.to;
  });
}

export const yearPeriod = (year: number): HoursPeriod => ({ from: `${year}-01-01`, to: `${year}-12-31` });

/** `month` is 1–12. */
export const monthPeriod = (year: number, month: number): HoursPeriod => {
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(last)}` };
};

/** Token form used inside a formula reference: `YYYYMMDD-YYYYMMDD` (no ':' or '#', which the
 *  reference syntax reserves). */
export const encodeHoursPeriod = (p: HoursPeriod): string => `${p.from.replace(/-/g, '')}-${p.to.replace(/-/g, '')}`;

export function decodeHoursPeriod(token: string | undefined): HoursPeriod | undefined {
  const m = token?.match(/^(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  return { from: `${m[1]}-${m[2]}-${m[3]}`, to: `${m[4]}-${m[5]}-${m[6]}` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** Short human label: "2026", "Mar 2026", or "1 Mar 2026 – 15 Apr 2026". */
export function describeHoursPeriod(p: HoursPeriod): string {
  const [fy, fm] = p.from.split('-').map(Number);
  if (p.from === yearPeriod(fy).from && p.to === yearPeriod(fy).to) return String(fy);
  const month = monthPeriod(fy, fm);
  if (p.from === month.from && p.to === month.to) return `${MONTHS[fm - 1]} ${fy}`;
  return p.from === p.to ? dayLabel(p.from) : `${dayLabel(p.from)} – ${dayLabel(p.to)}`;
}

/** Formats a minute count as "H:MM" (e.g. 975 -> "16:15"). */
export function formatHoursLogDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Formats an entry's logged-at timestamp as "dd.mm.yyyy HH:MM". */
export function formatHoursLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The HOURS_LOG columns marked "Subitems only" among the given columns. */
export function subitemsOnlyHoursLogColumnIds(columns: ReadonlyArray<Pick<PersonalColumn, 'id' | 'type' | 'settings'>>): string[] {
  return columns
    .filter((c) => c.type === ColumnType.HOURS_LOG && (c.settings as HoursLogColumnSettings | undefined)?.subitemsOnly === true)
    .map((c) => c.id);
}

/**
 * A "Subitems only" hours cell on a parent item shows the parent's own hours plus those of its
 * subitems assigned to the hub owner (see PersonalHoursLogCell). Everything else that reads the
 * cell — summary rows, formulas — sums the stored entries, so fold the subitems' entries into the
 * parent's value for those readers to arrive at the same total. Returns a new map; the stored
 * values (which the cell itself edits) are left untouched.
 */
export function foldSubitemHoursIntoParents(
  valuesByItem: Record<string, Record<string, unknown>>,
  parentBySubitem: ReadonlyMap<string, string>,
  columnIds: readonly string[],
): Record<string, Record<string, unknown>> {
  if (columnIds.length === 0 || parentBySubitem.size === 0) return valuesByItem;
  const out: Record<string, Record<string, unknown>> = { ...valuesByItem };
  const copied = new Set<string>();
  for (const [subitemId, parentId] of parentBySubitem) {
    for (const columnId of columnIds) {
      const subEntries = valuesByItem[subitemId]?.[columnId];
      if (!Array.isArray(subEntries) || subEntries.length === 0) continue;
      if (!copied.has(parentId)) {
        out[parentId] = { ...(valuesByItem[parentId] ?? {}) };
        copied.add(parentId);
      }
      const parentRow = out[parentId];
      const own = parentRow[columnId];
      parentRow[columnId] = [...(Array.isArray(own) ? (own as HoursLogEntry[]) : []), ...(subEntries as HoursLogEntry[])];
      out[parentId] = parentRow;
    }
  }
  return out;
}

/** What the "User hub" menu's period picker holds for one Hours Log column. */
export type HoursPeriodChoice =
  | { mode: 'all' }
  | { mode: 'year'; year: number }
  | { mode: 'month'; year: number; month: number }
  | { mode: 'custom'; from: string; to: string };

/** The period a choice stands for: undefined for "All time", null while a custom range is
 *  missing a date. A custom range entered backwards is read the right way round. */
export function choiceToPeriod(choice: HoursPeriodChoice): HoursPeriod | undefined | null {
  switch (choice.mode) {
    case 'all': return undefined;
    case 'year': return yearPeriod(choice.year);
    case 'month': return monthPeriod(choice.year, choice.month);
    case 'custom':
      if (!choice.from || !choice.to) return null;
      return choice.from <= choice.to ? { from: choice.from, to: choice.to } : { from: choice.to, to: choice.from };
  }
}
