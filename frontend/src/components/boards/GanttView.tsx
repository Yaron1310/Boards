import React, { useMemo } from 'react';
import type { Item, Column, Group } from '../../types';
import { ColumnType } from '../../types';

interface GanttViewProps {
  groups: Group[];
  itemsByGroup: Record<string, Item[]>;
  columns: Column[];
}

const WEEK_PX = 120;
const ROW_H = 36;
const NAME_W = 282;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function weekStart(d: Date): Date {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const r = new Date(d.getTime() + offset * MS_PER_DAY);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addWeeks(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_WEEK);
}

function formatWeek(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const GanttView: React.FC<GanttViewProps> = ({ groups, itemsByGroup, columns }) => {
  const timeRangeCol = columns.find((c) => c.type === ColumnType.TIME_RANGE);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { weeks, timelineStart } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    if (timeRangeCol) {
      for (const items of Object.values(itemsByGroup)) {
        for (const item of items) {
          const val = item.values[timeRangeCol.id] as { start?: string; end?: string } | null;
          const s = parseDate(val?.start);
          const e = parseDate(val?.end);
          if (s && (!minDate || s < minDate)) minDate = s;
          if (e && (!maxDate || e > maxDate)) maxDate = e;
        }
      }
    }

    const start = weekStart(minDate ?? today);
    const effectiveStart = addWeeks(start, -1);
    const effectiveEnd = maxDate ? new Date(maxDate.getTime() + MS_PER_DAY) : addWeeks(effectiveStart, 9);
    const rawWeeks = Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / MS_PER_WEEK);
    const totalWeeks = Math.max(8, rawWeeks + 2);

    const ws: Date[] = [];
    for (let i = 0; i < totalWeeks; i++) ws.push(addWeeks(effectiveStart, i));

    return { weeks: ws, timelineStart: effectiveStart };
  }, [timeRangeCol, itemsByGroup, today]);

  const timelineWidth = weeks.length * WEEK_PX;
  const todayOffset = (today.getTime() - timelineStart.getTime()) / MS_PER_WEEK * WEEK_PX;
  const showToday = todayOffset >= 0 && todayOffset <= timelineWidth;

  if (!timeRangeCol) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No time range column found on this board.
      </div>
    );
  }

  const totalWidth = NAME_W + timelineWidth;

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex bg-gray-50 border-b border-[#d2d2d4] select-none"
        style={{ width: totalWidth }}
        role="row"
        aria-label="Gantt timeline header"
      >
        <div
          className="sticky left-0 z-20 flex-shrink-0 bg-gray-50 border-r border-[#d2d2d4] flex items-center px-4 text-sm font-semibold text-gray-600"
          style={{ width: NAME_W, minWidth: NAME_W, height: 36 }}
          role="columnheader"
        >
          Item
        </div>
        <div className="flex" style={{ width: timelineWidth }}>
          {weeks.map((week, i) => (
            <div
              key={i}
              className="flex-shrink-0 flex items-center px-2 text-xs text-gray-500 border-r border-[#d2d2d4]"
              style={{ width: WEEK_PX, height: 36 }}
              role="columnheader"
              aria-label={`Week of ${formatWeek(week)}`}
            >
              {formatWeek(week)}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div role="rowgroup" style={{ width: totalWidth }}>
        {groups.map((group) => {
          const items = itemsByGroup[group.id] ?? [];
          if (items.length === 0) return null;
          return (
            <React.Fragment key={group.id}>
              {/* Group header */}
              <div
                className="flex items-center gap-2 px-4 bg-gray-50 border-b border-[#d2d2d4]"
                style={{ height: 28 }}
                role="row"
                aria-label={`Group: ${group.name}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: group.color ?? '#6366f1' }}
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-gray-600 truncate">{group.name}</span>
              </div>

              {/* Item rows */}
              {items.map((item) => {
                const val = item.values[timeRangeCol.id] as { start?: string; end?: string } | null;
                const startDate = parseDate(val?.start);
                const endDate = parseDate(val?.end);

                let barLeft: number | null = null;
                let barWidth: number | null = null;
                if (startDate && endDate) {
                  barLeft = (startDate.getTime() - timelineStart.getTime()) / MS_PER_WEEK * WEEK_PX;
                  barWidth = Math.max(8, (endDate.getTime() - startDate.getTime() + MS_PER_DAY) / MS_PER_WEEK * WEEK_PX);
                }

                return (
                  <div
                    key={item.id}
                    className="flex border-b border-[#d2d2d4] group hover:bg-indigo-50/30"
                    style={{ height: ROW_H }}
                    role="row"
                    aria-label={item.name}
                  >
                    {/* Sticky name column */}
                    <div
                      className="sticky left-0 z-10 flex items-center px-4 bg-white group-hover:bg-indigo-50/30 border-r border-[#d2d2d4] flex-shrink-0 text-sm text-gray-800"
                      style={{ width: NAME_W, minWidth: NAME_W }}
                      role="gridcell"
                    >
                      <span className="truncate">{item.name}</span>
                    </div>

                    {/* Timeline area */}
                    <div
                      className="relative flex-shrink-0"
                      style={{ width: timelineWidth }}
                      role="gridcell"
                      aria-label={startDate && endDate ? `${val?.start} to ${val?.end}` : 'No date set'}
                    >
                      {/* Week grid lines */}
                      {weeks.map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-r border-[#ebebed]"
                          style={{ left: (i + 1) * WEEK_PX - 1 }}
                          aria-hidden="true"
                        />
                      ))}

                      {/* Today marker */}
                      {showToday && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                          style={{ left: Math.round(todayOffset) }}
                          aria-hidden="true"
                        />
                      )}

                      {/* Gantt bar */}
                      {barLeft !== null && barWidth !== null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{
                            left: barLeft,
                            width: barWidth,
                            height: 22,
                            borderRadius: 6,
                            background: 'linear-gradient(90deg, #6366f1, #3b82f6)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default GanttView;
