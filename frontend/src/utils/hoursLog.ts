import { ColumnType } from '../types';
import type { HoursLogColumnSettings, HoursLogEntry, PersonalColumn } from '../types';

/** Minute increments the duration picker offers — an HOURS_LOG cell only ever stores multiples
 *  of one of these, in either field. */
export const HOURS_LOG_MINUTE_STEPS = [0, 15, 30, 45] as const;

export function sumHoursLogMinutes(entries: HoursLogEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, e) => sum + (typeof e.minutes === 'number' && !isNaN(e.minutes) ? e.minutes : 0), 0);
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
