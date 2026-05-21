import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { Item, Column, Group } from '../../types';
import { ColumnType } from '../../types';

// ─── Constants ───────────────────────────────────────────────────────────────
const WEEK_PX = 120;
const DAY_PX = 38;
const ROW_H = 36;
const FULL_SCOPE_H = ROW_H * 2; // 72px — mini-map overview row
const NAME_W = 282;
const HANDLE_W = 8;
const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const DAY_ABBREVS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeUnit = 'weeks' | 'days';

interface DragState {
  itemId: string;
  groupId: string;
  colId: string;
  edge: 'start' | 'end' | 'move';
  origStart: Date;
  origEnd: Date;
  mouseX: number;
  pxPerDay: number;
  currentStart: Date;
  currentEnd: Date;
}

interface TooltipState {
  x: number;
  y: number;
  startDate: Date;
  endDate: Date;
}

interface GanttViewProps {
  groups: Group[];
  itemsByGroup: Record<string, Item[]>;
  columns: Column[];
  onItemUpdate: (itemId: string, groupId: string, colId: string, start: string, end: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const datePart = s.includes('T') ? s.slice(0, 10) : s;
  const d = new Date(datePart + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addLocalDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
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

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTooltipDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDragDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────
const GanttView: React.FC<GanttViewProps> = ({ groups, itemsByGroup, columns, onItemUpdate }) => {
  const timeRangeCol = columns.find((c) => c.type === ColumnType.TIME_RANGE);

  const [timeUnit, setTimeUnit] = useState<TimeUnit>('weeks');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [preview, setPreview] = useState<Record<string, { start: Date; end: Date }>>({});
  const [dragLabel, setDragLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const [showFullScope, setShowFullScope] = useState(false);
  const [containerScrollLeft, setContainerScrollLeft] = useState(0);
  const [containerClientWidth, setContainerClientWidth] = useState(0);

  const dragRef = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTimeUnitRef = useRef<TimeUnit | null>(null);

  // Keep mutable refs in sync so global event handlers can access current values
  const timeRangeColRef = useRef(timeRangeCol);
  timeRangeColRef.current = timeRangeCol;

  const onItemUpdateRef = useRef(onItemUpdate);
  onItemUpdateRef.current = onItemUpdate;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── Timeline date range (unit-independent) ──────────────────────────────
  const { timelineStart, timelineEnd } = useMemo(() => {
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

    const base = weekStart(minDate ?? today);
    const tStart = addWeeks(base, -1);
    const tEnd = maxDate
      ? addWeeks(new Date(maxDate.getTime()), 3)
      : addWeeks(tStart, 12);

    return { timelineStart: tStart, timelineEnd: tEnd };
  }, [timeRangeCol, itemsByGroup, today]);

  // ── Column array (week starts or individual days) ───────────────────────
  const timeColumns = useMemo<Date[]>(() => {
    if (timeUnit === 'weeks') {
      const count = Math.max(8, Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / MS_PER_WEEK) + 2);
      return Array.from({ length: count }, (_, i) => addWeeks(timelineStart, i));
    }
    const count = Math.max(56, Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / MS_PER_DAY) + 14);
    return Array.from({ length: count }, (_, i) => addLocalDays(timelineStart, i));
  }, [timeUnit, timelineStart, timelineEnd]);

  // ── Layout metrics ──────────────────────────────────────────────────────
  const columnPx = timeUnit === 'weeks' ? WEEK_PX : DAY_PX;
  const pxPerDay = timeUnit === 'weeks' ? WEEK_PX / 7 : DAY_PX;
  const timelineWidth = timeColumns.length * columnPx;
  const totalWidth = NAME_W + timelineWidth;
  const todayOffset = (today.getTime() - timelineStart.getTime()) / MS_PER_DAY * pxPerDay;
  const showToday = todayOffset >= 0 && todayOffset <= timelineWidth;

  // ── Bar geometry ────────────────────────────────────────────────────────
  function getBarGeometry(startDate: Date, endDate: Date) {
    const left = (startDate.getTime() - timelineStart.getTime()) / MS_PER_DAY * pxPerDay;
    const width = Math.max(pxPerDay * 0.5, (endDate.getTime() - startDate.getTime() + MS_PER_DAY) / MS_PER_DAY * pxPerDay);
    return { left, width };
  }

  // ── Display dates with preview override ────────────────────────────────
  function getItemDates(item: Item): { start: Date; end: Date } | null {
    if (preview[item.id]) return preview[item.id];
    if (!timeRangeCol) return null;
    const val = item.values[timeRangeCol.id] as { start?: string; end?: string } | null;
    const start = parseDate(val?.start);
    const end = parseDate(val?.end);
    return start && end ? { start, end } : null;
  }

  // ── All items with resolved dates (for full scope mini-map) ────────────
  const allItemsWithDates = useMemo(() => {
    if (!timeRangeCol) return [];
    return groups.flatMap((group) =>
      (itemsByGroup[group.id] ?? [])
        .map((item) => {
          const p = preview[item.id];
          if (p) return { item, group, dates: p };
          const val = item.values[timeRangeCol.id] as { start?: string; end?: string } | null;
          const start = parseDate(val?.start);
          const end = parseDate(val?.end);
          return start && end ? { item, group, dates: { start, end } } : null;
        })
        .filter((x): x is { item: Item; group: Group; dates: { start: Date; end: Date } } => x !== null),
    );
  }, [groups, itemsByGroup, timeRangeCol, preview]);

  // ── Full scope scale factor and viewport rect ───────────────────────────
  const fullScopeAvailW = Math.max(0, containerClientWidth - NAME_W);
  const scaleFactor = timelineWidth > 0 && fullScopeAvailW > 0 ? fullScopeAvailW / timelineWidth : 0;
  const viewportTimelineOffset = Math.max(0, containerScrollLeft - NAME_W);
  const viewportRectLeft = viewportTimelineOffset * scaleFactor;
  const viewportRectWidth = Math.max(6, (containerClientWidth - NAME_W) * scaleFactor);

  // ── Mini-bar layout in full scope ───────────────────────────────────────
  const innerH = FULL_SCOPE_H - 16; // 8px padding top and bottom
  const itemBarH = Math.max(1, Math.min(8, innerH / Math.max(allItemsWithDates.length, 1)));

  // ── Track container scroll position and client width ───────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => setContainerScrollLeft(container.scrollLeft);
    const onResize = () => setContainerClientWidth(container.clientWidth);
    setContainerClientWidth(container.clientWidth);
    setContainerScrollLeft(container.scrollLeft);
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // ── Resize drag start ───────────────────────────────────────────────────
  function handleResizeStart(
    e: React.MouseEvent,
    item: Item,
    edge: 'start' | 'end',
    startDate: Date,
    endDate: Date,
  ) {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    dragRef.current = {
      itemId: item.id,
      groupId: item.groupId,
      colId: timeRangeColRef.current?.id ?? '',
      edge,
      origStart: startDate,
      origEnd: endDate,
      mouseX: e.clientX,
      pxPerDay,
      currentStart: startDate,
      currentEnd: endDate,
    };
  }

  // ── Move drag start (shift entire bar) ─────────────────────────────────
  function handleMoveStart(
    e: React.MouseEvent,
    item: Item,
    startDate: Date,
    endDate: Date,
  ) {
    e.preventDefault();
    e.stopPropagation();
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
    dragRef.current = {
      itemId: item.id,
      groupId: item.groupId,
      colId: timeRangeColRef.current?.id ?? '',
      edge: 'move',
      origStart: startDate,
      origEnd: endDate,
      mouseX: e.clientX,
      pxPerDay,
      currentStart: startDate,
      currentEnd: endDate,
    };
  }

  // ── Global mouse move / up (stable effect — all data via refs) ──────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      const deltaX = e.clientX - d.mouseX;
      const deltaDays = Math.round(deltaX / d.pxPerDay);

      let newStart = d.origStart;
      let newEnd = d.origEnd;

      if (d.edge === 'move') {
        newStart = addLocalDays(d.origStart, deltaDays);
        newEnd = addLocalDays(d.origEnd, deltaDays);
      } else if (d.edge === 'start') {
        const candidate = addLocalDays(d.origStart, deltaDays);
        newStart = candidate < d.origEnd ? candidate : addLocalDays(d.origEnd, -1);
      } else {
        const candidate = addLocalDays(d.origEnd, deltaDays);
        newEnd = candidate > d.origStart ? candidate : addLocalDays(d.origStart, 1);
      }

      d.currentStart = newStart;
      d.currentEnd = newEnd;

      setPreview((prev) => ({ ...prev, [d.itemId]: { start: newStart, end: newEnd } }));
      setDragLabel({
        x: e.clientX,
        y: e.clientY,
        text: d.edge === 'move'
          ? `${formatDragDate(newStart)} → ${formatDragDate(newEnd)}`
          : d.edge === 'start' ? formatDragDate(newStart) : formatDragDate(newEnd),
      });
    };

    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { itemId, groupId, colId, currentStart, currentEnd } = d;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPreview({});
      setDragLabel(null);
      // Update tooltip immediately with the final dates so it shows correctly on release
      setTooltip((prev) => prev
        ? { ...prev, x: e.clientX, y: e.clientY, startDate: currentStart, endDate: currentEnd }
        : null);

      if (colId) {
        onItemUpdateRef.current(
          itemId,
          groupId,
          colId,
          toDateString(currentStart),
          toDateString(currentEnd),
        );
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []); // stable: everything accessed via refs or stable setters

  // ── Auto-scroll to center on today on mount and when timeUnit changes ──
  // Guard against re-running when timelineStart shifts due to item edits —
  // that would cause the scroll to jump after every drag-and-drop.
  useEffect(() => {
    if (prevTimeUnitRef.current === timeUnit) return;
    prevTimeUnitRef.current = timeUnit;
    const container = containerRef.current;
    if (!container) return;
    const todayPx = NAME_W + (today.getTime() - timelineStart.getTime()) / MS_PER_DAY * pxPerDay;
    container.scrollLeft = Math.max(0, todayPx - container.clientWidth / 2);
  }, [timeUnit, today, timelineStart, pxPerDay]);

  // ── Click on full scope to navigate main Gantt ─────────────────────────
  const handleFullScopeClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || scaleFactor === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timelineClickPx = clickX / scaleFactor;
    const newScrollLeft = NAME_W + timelineClickPx - (container.clientWidth - NAME_W) / 2;
    container.scrollLeft = Math.max(0, newScrollLeft);
  }, [scaleFactor]);

  // ──────────────────────────────────────────────────────────────────────────
  if (!timeRangeCol) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No time range column found on this board.
      </div>
    );
  }

  const isCurrentlyDragging = Object.keys(preview).length > 0;

  return (
    <>
      {/* ── Scrollable gantt ─────────────────────────────────────────────── */}
      <div ref={containerRef} className="h-full overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-20 flex bg-gray-50 border-b border-[#d2d2d4] select-none"
          style={{ width: totalWidth }}
          role="row"
          aria-label="Gantt timeline header"
        >
          <div
            className="sticky left-0 z-20 flex-shrink-0 bg-gray-50 border-r border-[#d2d2d4] flex items-center justify-between px-3 text-sm font-semibold text-gray-600"
            style={{ width: NAME_W, minWidth: NAME_W, height: ROW_H }}
            role="columnheader"
          >
            <span>Item</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowFullScope((v) => !v)}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors select-none ${
                  showFullScope
                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    : 'bg-gray-200 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700'
                }`}
                aria-label="Toggle full scope overview"
                aria-pressed={showFullScope}
              >
                Full Scope
              </button>
              <button
                type="button"
                onClick={() => setTimeUnit((u) => u === 'weeks' ? 'days' : 'weeks')}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-200 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 transition-colors select-none"
                aria-label={`Switch to ${timeUnit === 'weeks' ? 'days' : 'weeks'} view`}
                aria-pressed={timeUnit === 'days'}
              >
                {timeUnit === 'weeks' ? 'Weeks' : 'Days'}
              </button>
            </div>
          </div>
          <div className="flex" style={{ width: timelineWidth }}>
            {timeUnit === 'weeks'
              ? timeColumns.map((col, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 flex items-center px-2 text-xs text-gray-500 border-r border-[#d2d2d4]"
                    style={{ width: WEEK_PX, height: ROW_H }}
                    role="columnheader"
                    aria-label={`Week of ${formatWeekLabel(col)}`}
                  >
                    {formatWeekLabel(col)}
                  </div>
                ))
              : timeColumns.map((col, i) => {
                  const isNewMonth = i === 0 || col.getMonth() !== timeColumns[i - 1].getMonth();
                  const isWeekStart = col.getDay() === 1;
                  const isWeekend = col.getDay() === 0 || col.getDay() === 6;
                  const isToday = col.toDateString() === today.toDateString();
                  return (
                    <div
                      key={i}
                      className={`flex-shrink-0 flex flex-col items-center justify-center border-r ${
                        isWeekStart ? 'border-[#b8b8bc]' : 'border-[#e8e8ea]'
                      } ${isWeekend ? 'bg-gray-100/60' : ''}`}
                      style={{ width: DAY_PX, height: ROW_H }}
                      role="columnheader"
                      aria-label={col.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    >
                      <span
                        className={`text-[9px] leading-none mb-0.5 ${
                          isNewMonth
                            ? 'text-indigo-500 font-semibold uppercase tracking-wide'
                            : 'text-gray-400'
                        }`}
                      >
                        {isNewMonth
                          ? col.toLocaleDateString('en-US', { month: 'short' })
                          : DAY_ABBREVS[col.getDay()]}
                      </span>
                      <span
                        className={`text-[11px] font-medium leading-none ${
                          isToday ? 'text-red-500 font-bold' : 'text-gray-600'
                        }`}
                      >
                        {col.getDate()}
                      </span>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* ── Full scope mini-map ────────────────────────────────────────── */}
        {showFullScope && (
          <div
            style={{
              position: 'sticky',
              top: ROW_H,
              left: 0,
              zIndex: 19,
              width: containerClientWidth || '100%',
              height: FULL_SCOPE_H,
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #d2d2d4',
              overflow: 'hidden',
              flexShrink: 0,
            }}
            role="img"
            aria-label="Full scope timeline overview"
          >
            {/* Left label column */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: NAME_W,
                height: FULL_SCOPE_H,
                borderRight: '1px solid #d2d2d4',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 14,
                backgroundColor: '#f9fafb',
                zIndex: 1,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Full Scope
              </span>
            </div>

            {/* Timeline area — clickable for navigation */}
            <div
              style={{
                position: 'absolute',
                left: NAME_W,
                top: 0,
                right: 0,
                bottom: 0,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={handleFullScopeClick}
              aria-label="Click to navigate timeline"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleFullScopeClick(e as unknown as React.MouseEvent<HTMLDivElement>); }}
            >
              {/* Item bars */}
              {allItemsWithDates.map(({ item, group, dates }, idx) => {
                const geom = getBarGeometry(dates.start, dates.end);
                const scaledLeft = geom.left * scaleFactor;
                const scaledWidth = Math.max(2, geom.width * scaleFactor);
                const barTop = 8 + idx * itemBarH;
                return (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      left: scaledLeft,
                      width: scaledWidth,
                      top: barTop,
                      height: Math.max(1, itemBarH - 1),
                      backgroundColor: group.color ?? '#6366f1',
                      borderRadius: 2,
                      opacity: 0.75,
                    }}
                  />
                );
              })}

              {/* Viewport rectangle */}
              {scaleFactor > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: viewportRectLeft,
                    width: viewportRectWidth,
                    top: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(99,102,241,0.08)',
                    border: '2px solid rgba(99,102,241,0.45)',
                    borderRadius: 3,
                    pointerEvents: 'none',
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div role="rowgroup" style={{ width: totalWidth }}>
          {groups.map((group) => {
            const items = itemsByGroup[group.id] ?? [];
            if (items.length === 0) return null;

            return (
              <React.Fragment key={group.id}>
                {/* Group header */}
                <div
                  className="flex border-b border-[#d2d2d4]"
                  style={{ height: 28 }}
                  role="row"
                  aria-label={`Group: ${group.name}`}
                >
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2 px-4 bg-gray-50 flex-shrink-0"
                    style={{ width: NAME_W, minWidth: NAME_W }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: group.color ?? '#6366f1' }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-semibold text-gray-600 truncate">{group.name}</span>
                  </div>
                  <div className="flex-1 bg-gray-50" aria-hidden="true" />
                </div>

                {/* Item rows */}
                {items.map((item) => {
                  const dates = getItemDates(item);
                  const barGeom = dates ? getBarGeometry(dates.start, dates.end) : null;
                  const isBeingDragged = !!preview[item.id];

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
                        className="sticky left-0 z-10 flex items-center bg-white group-hover:bg-indigo-50/30 border-r border-[#d2d2d4] flex-shrink-0 text-sm text-gray-800"
                        style={{ width: NAME_W, minWidth: NAME_W, paddingLeft: 25 }}
                        role="gridcell"
                      >
                        <span className="truncate">{item.name}</span>
                      </div>

                      {/* Timeline area */}
                      <div
                        className="relative flex-shrink-0"
                        style={{ width: timelineWidth }}
                        role="gridcell"
                        aria-label={dates ? `${toDateString(dates.start)} to ${toDateString(dates.end)}` : 'No date set'}
                      >
                        {/* Grid lines + weekend shading */}
                        {timeColumns.map((col, i) => {
                          const isWeekend = timeUnit === 'days' && (col.getDay() === 0 || col.getDay() === 6);
                          const isWeekBoundary = timeUnit === 'days' && col.getDay() === 1;
                          return (
                            <React.Fragment key={i}>
                              {isWeekend && (
                                <div
                                  className="absolute top-0 bottom-0 bg-gray-100/50"
                                  style={{ left: i * columnPx, width: columnPx }}
                                  aria-hidden="true"
                                />
                              )}
                              <div
                                className={`absolute top-0 bottom-0 w-px ${
                                  isWeekBoundary ? 'bg-gray-300' : 'bg-[#ebebed]'
                                }`}
                                style={{ left: (i + 1) * columnPx - 1 }}
                                aria-hidden="true"
                              />
                            </React.Fragment>
                          );
                        })}

                        {/* Today marker */}
                        {showToday && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                            style={{ left: Math.round(todayOffset) }}
                            aria-hidden="true"
                          />
                        )}

                        {/* Gantt bar */}
                        {barGeom && dates && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 select-none"
                            style={{
                              left: barGeom.left,
                              width: barGeom.width,
                              height: 22,
                              borderRadius: 6,
                              background: isBeingDragged
                                ? 'linear-gradient(90deg, #4f46e5, #2563eb)'
                                : 'linear-gradient(90deg, #6366f1, #3b82f6)',
                              boxShadow: isBeingDragged
                                ? '0 4px 16px rgba(99,102,241,0.45)'
                                : '0 2px 8px rgba(0,0,0,0.1)',
                              cursor: 'move',
                              zIndex: 5,
                              transition: isBeingDragged ? 'none' : 'left 0.15s, width 0.15s',
                            }}
                            aria-label={`${item.name}: ${formatTooltipDate(dates.start)} to ${formatTooltipDate(dates.end)}`}
                            onMouseDown={(e) => handleMoveStart(e, item, dates.start, dates.end)}
                            onMouseEnter={(e) => {
                              if (!isCurrentlyDragging) {
                                setTooltip({ x: e.clientX, y: e.clientY, startDate: dates.start, endDate: dates.end });
                              }
                            }}
                            onMouseMove={(e) => {
                              if (!isCurrentlyDragging) {
                                setTooltip({ x: e.clientX, y: e.clientY, startDate: dates.start, endDate: dates.end });
                              }
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          >
                            {/* Left edge handle — changes start date */}
                            <div
                              className="absolute top-0 bottom-0 z-10 flex items-center justify-center rounded-l-[6px]"
                              style={{ left: 0, width: HANDLE_W, cursor: 'ew-resize' }}
                              onMouseDown={(e) => handleResizeStart(e, item, 'start', dates.start, dates.end)}
                              role="slider"
                              aria-label={`${item.name} start date`}
                              aria-valuenow={dates.start.getTime()}
                            >
                              <div className="w-px h-3 bg-white/70 rounded-full pointer-events-none" />
                            </div>

                            {/* Right edge handle — changes end date */}
                            <div
                              className="absolute top-0 bottom-0 z-10 flex items-center justify-center rounded-r-[6px]"
                              style={{ right: 0, width: HANDLE_W, cursor: 'ew-resize' }}
                              onMouseDown={(e) => handleResizeStart(e, item, 'end', dates.start, dates.end)}
                              role="slider"
                              aria-label={`${item.name} end date`}
                              aria-valuenow={dates.end.getTime()}
                            >
                              <div className="w-px h-3 bg-white/70 rounded-full pointer-events-none" />
                            </div>
                          </div>
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

      {/* Hover tooltip (hidden during drag) */}
      {tooltip && !isCurrentlyDragging && (() => {
        const days = Math.round((tooltip.endDate.getTime() - tooltip.startDate.getTime()) / MS_PER_DAY) + 1;
        return (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: tooltip.x + 14, top: tooltip.y - 52 }}
            role="tooltip"
          >
            <div className="bg-white border border-gray-200 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.12)] px-3 py-2 flex items-center gap-2 whitespace-nowrap">
              <span className="text-xs font-medium text-gray-700">{formatTooltipDate(tooltip.startDate)}</span>
              <svg
                width="14" height="8" viewBox="0 0 14 8" fill="none"
                className="flex-shrink-0 text-indigo-400"
                aria-hidden="true"
              >
                <line x1="0" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <polyline points="7 1 11 4 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span className="text-xs font-medium text-gray-700">{formatTooltipDate(tooltip.endDate)}</span>
              <span className="text-xs font-semibold text-indigo-500 ml-0.5">({days}d)</span>
            </div>
          </div>
        );
      })()}

      {/* Drag date label — follows cursor during resize */}
      {dragLabel && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: dragLabel.x + 12, top: dragLabel.y - 36 }}
          aria-hidden="true"
        >
          <div className="bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap">
            {dragLabel.text}
          </div>
        </div>
      )}
    </>
  );
};

export default GanttView;
