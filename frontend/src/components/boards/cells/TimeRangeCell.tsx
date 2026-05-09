import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TimeRangeValue, TimeRangeDependency } from '../../../types';
import { useDependency } from '../../../contexts/DependencyContext';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const formatDate = (val: Date | null | undefined): string => {
  if (!val) return '';
  return `${val.getDate()}.${val.getMonth() + 1}.${val.getFullYear()}`;
};

const toDate = (val: string | Date | null | undefined): Date | null => {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
};

const isoFromParts = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const pluralDays = (n: number) => `${n} day${n !== 1 ? 's' : ''}`;

const getDurationText = (start: Date | null, end: Date | null): string => {
  if (!start || !end) return '';
  const total = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const left = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  return left > 0 ? `${pluralDays(total)} (${pluralDays(left)} left)` : pluralDays(total);
};

// ---------------------------------------------------------------------------
// Date range picker (hotel-style: click start then end in one flow)
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DateRangePickerProps {
  initialStart: string;
  initialEnd: string;
  anchorEl: HTMLElement | null;
  onCommit: (start: string, end: string) => void;
  onCancel: () => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  initialStart, initialEnd, anchorEl, onCommit, onCancel,
}) => {
  // Phase ALWAYS starts at 'start' so the first click is always the start date,
  // even when the cell already has dates set.
  const [selStart, setSelStart] = useState(initialStart);
  const [selEnd, setSelEnd] = useState(initialEnd);
  const [phase, setPhase] = useState<'start' | 'end'>('start');
  const [hoverIso, setHoverIso] = useState('');
  const [viewYear, setViewYear] = useState(() =>
    initialStart ? new Date(initialStart).getFullYear() : new Date().getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    initialStart ? new Date(initialStart).getMonth() : new Date().getMonth()
  );
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);

  // Keep refs for the outside-click handler so it reads latest state
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selStartRef = useRef(selStart);
  selStartRef.current = selStart;

  // Position below (or above if no space) the anchor cell
  useEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const pickerH = 320;
    const pickerW = 264;
    let top = r.bottom + 6;
    let left = r.left;
    if (top + pickerH > window.innerHeight - 8) top = Math.max(8, r.top - pickerH - 6);
    if (left + pickerW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pickerW - 8);
    setPos({ top, left });
  }, [anchorEl]);

  // Outside click: if user already picked a new start (phase=end), commit with
  // new start + original end so they don't have to re-select the end date.
  // If no start was picked yet, just cancel.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        if (phaseRef.current === 'end' && selStartRef.current) {
          onCommit(selStartRef.current, initialEnd);
        } else {
          onCancel();
        }
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onCancel, onCommit, initialEnd]);

  // Esc always cancels
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Build full grid: leading days from prev month, current month, trailing days from next month
  const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
  const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
  const daysInPrevMonth = new Date(prevY, prevM + 1, 0).getDate();
  const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
  const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
  const trailingCount = (firstDayOffset + daysInMonth) % 7 === 0
    ? 0
    : 7 - ((firstDayOffset + daysInMonth) % 7);

  interface DayCell { iso: string; day: number; outside: boolean }
  const dayCells: DayCell[] = [
    ...Array.from({ length: firstDayOffset }, (_, i) => {
      const day = daysInPrevMonth - firstDayOffset + i + 1;
      return { iso: isoFromParts(prevY, prevM, day), day, outside: true };
    }),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      iso: isoFromParts(viewYear, viewMonth, i + 1), day: i + 1, outside: false,
    })),
    ...Array.from({ length: trailingCount }, (_, i) => ({
      iso: isoFromParts(nextY, nextM, i + 1), day: i + 1, outside: true,
    })),
  ];

  const handleDayClick = (iso: string, outside: boolean) => {
    if (outside) {
      // Navigate to the other month, then select
      const d = new Date(iso + 'T12:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    if (phase === 'start') {
      setSelStart(iso);
      setSelEnd('');
      setPhase('end');
    } else {
      if (selStart && iso < selStart) {
        setSelStart(iso);
        setSelEnd('');
      } else {
        onCommit(selStart, iso);
      }
    }
  };

  const todayIso = isoFromParts(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const getDayClass = (iso: string, outside: boolean): string => {
    const isStart = iso === selStart;
    const effectiveEnd = selEnd || (phase === 'end' && hoverIso && hoverIso > selStart ? hoverIso : '');
    const isEnd = !!effectiveEnd && iso === effectiveEnd;
    const inRange = !!selStart && !!effectiveEnd && iso > selStart && iso < effectiveEnd;
    const isHoverEnd = isEnd && !selEnd;

    if (isStart && isEnd) return `bg-indigo-500 text-white rounded-full${outside ? ' opacity-50' : ''}`;
    if (isStart) return `bg-indigo-500 text-white ${effectiveEnd ? 'rounded-l-full' : 'rounded-full'}${outside ? ' opacity-50' : ''}`;
    if (isEnd) return `${isHoverEnd ? 'bg-indigo-200 text-indigo-900' : 'bg-indigo-500 text-white'} rounded-r-full${outside ? ' opacity-50' : ''}`;
    if (inRange) return `bg-indigo-100 text-indigo-900${outside ? ' opacity-60' : ''}`;

    if (outside) return 'text-gray-300 rounded-full hover:bg-gray-50 hover:text-gray-400';
    return `${iso === todayIso ? 'font-bold text-indigo-600' : 'text-gray-700'} rounded-full hover:bg-gray-100`;
  };

  return (
    <div
      ref={pickerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10002, width: 264 }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 select-none"
      onClick={(e) => e.stopPropagation()}
      aria-label="Date range picker"
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
          aria-label="Previous month"
        >‹</button>
        <span className="text-sm font-semibold text-gray-700">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
          aria-label="Next month"
        >›</button>
      </div>

      {/* Phase hint */}
      <p className="text-[10px] text-center text-indigo-400 font-medium mb-2">
        {phase === 'start'
          ? 'Select start date'
          : selStart
            ? `${formatDate(new Date(selStart + 'T12:00:00'))} → select end date`
            : 'Select end date'}
      </p>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells — includes leading/trailing days from adjacent months */}
      <div className="grid grid-cols-7">
        {dayCells.map(({ iso, day, outside }) => (
          <button
            key={iso}
            type="button"
            className={`h-8 w-full text-[12px] font-medium text-center transition-colors ${getDayClass(iso, outside)}`}
            onClick={() => handleDayClick(iso, outside)}
            onMouseEnter={() => { if (phase === 'end') setHoverIso(iso); }}
            onMouseLeave={() => setHoverIso('')}
            aria-label={`${day} ${MONTH_NAMES[outside ? (iso < isoFromParts(viewYear, viewMonth, 1) ? prevM : nextM) : viewMonth]} ${outside ? (iso < isoFromParts(viewYear, viewMonth, 1) ? prevY : nextY) : viewYear}`}
            aria-pressed={iso === selStart || iso === selEnd}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Cancel link */}
      <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cancel date selection"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dependency formula helpers
// ---------------------------------------------------------------------------

// Recursively resolves the effective (computed) start/end for any cell in a
// dependency chain, so that C uses B's computed end (not B's raw stored end).
const resolveChainedEffective = (
  itemId: string,
  columnId: string,
  allItems: Item[],
  visited: Set<string>,
): { start: Date | null; end: Date | null } => {
  const key = `${itemId}::${columnId}`;
  if (visited.has(key)) return { start: null, end: null };
  visited.add(key);

  const srcItem = allItems.find((i) => i.id === itemId);
  if (!srcItem) return { start: null, end: null };

  const rawValue = srcItem.values[columnId] as TimeRangeValue | null | undefined;
  const rawStart = toDate(rawValue?.start);
  const rawEnd = toDate(rawValue?.end);

  const depsIn = (srcItem.dependencies ?? []).filter(
    (d) => d.targetItemId === itemId && d.targetColumnId === columnId,
  );

  if (!rawStart) return { start: rawStart, end: rawEnd };

  for (const dep of depsIn) {
    const srcEffective = resolveChainedEffective(dep.sourceItemId, dep.sourceColumnId, allItems, visited);
    const srcEnd = srcEffective.end;
    if (!srcEnd) continue;

    const newStart = new Date(srcEnd);
    newStart.setDate(newStart.getDate() + dep.offsetDays);

    const durMs = rawEnd ? Math.max(0, rawEnd.getTime() - rawStart.getTime()) : 0;
    const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

    return { start: newStart, end: newEnd };
  }

  return { start: rawStart, end: rawEnd };
};

const resolveEffectiveDates = (
  rawValue: TimeRangeValue | null | undefined,
  depsIn: TimeRangeDependency[],
  allItems: Item[],
): { start: Date | null; end: Date | null; isComputed: boolean } => {
  const rawStart = toDate(rawValue?.start);
  const rawEnd = toDate(rawValue?.end);

  if (!rawStart) return { start: rawStart, end: rawEnd, isComputed: false };

  for (const dep of depsIn) {
    const srcEffective = resolveChainedEffective(dep.sourceItemId, dep.sourceColumnId, allItems, new Set());
    const srcEnd = srcEffective.end;
    if (!srcEnd) continue;

    const newStart = new Date(srcEnd);
    newStart.setDate(newStart.getDate() + dep.offsetDays);

    const durMs = rawEnd ? Math.max(0, rawEnd.getTime() - rawStart.getTime()) : 0;
    const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

    return { start: newStart, end: newEnd, isComputed: true };
  }
  return { start: rawStart, end: rawEnd, isComputed: false };
};

interface ComputedTarget {
  dep: TimeRangeDependency;
  targetItemId: string;
  targetColumnId: string;
  start: string;
  end: string | null;
  durationDays: number;
}

const computeTargetEffective = (dep: TimeRangeDependency, allItems: Item[]): ComputedTarget | null => {
  const srcEffective = resolveChainedEffective(dep.sourceItemId, dep.sourceColumnId, allItems, new Set());
  const srcEnd = srcEffective.end;
  if (!srcEnd) return null;

  const tgtItem = allItems.find((i) => i.id === dep.targetItemId);
  if (!tgtItem) return null;
  const tgtVal = tgtItem.values[dep.targetColumnId] as TimeRangeValue | null | undefined;

  if (!toDate(tgtVal?.start)) return null;

  const newStart = new Date(srcEnd);
  newStart.setDate(newStart.getDate() + dep.offsetDays);

  const rawStart = toDate(tgtVal?.start);
  const rawEnd = toDate(tgtVal?.end);
  const durMs = rawStart && rawEnd ? Math.max(0, rawEnd.getTime() - rawStart.getTime()) : 0;
  const newEnd = durMs > 0 ? new Date(newStart.getTime() + durMs) : null;

  return {
    dep,
    targetItemId: dep.targetItemId,
    targetColumnId: dep.targetColumnId,
    start: newStart.toISOString(),
    end: newEnd?.toISOString() ?? null,
    durationDays: durMs > 0 ? Math.round(durMs / 86_400_000) : (tgtVal?.durationDays ?? 1),
  };
};

// ---------------------------------------------------------------------------
// Traffic light
// ---------------------------------------------------------------------------

const TrafficLight: React.FC<{ date: Date | null; type: 'start' | 'end' }> = ({ date: _date, type }) => {
  let red = '#666666';
  let green = '#666666';
  if (type === 'start') green = '#22c55e';
  else red = '#ef4444';

  return (
    <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] -ml-1">
      <rect x="7" y="3" width="10" height="18" rx="3" fill="#000000" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
      <circle cx="12" cy="7" r="2" fill={red} />
      <circle cx="12" cy="12" r="2" fill="#666666" />
      <circle cx="12" cy="17" r="2" fill={green} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TimeRangeCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as TimeRangeValue | null | undefined;
  const { mutate } = useUpdateItem();
  const [start, setStart] = useState(toDateInput(rawValue?.start));
  const [end, setEnd] = useState(toDateInput(rawValue?.end));
  const [hovered, setHovered] = useState(false);
  const [showDepMenu, setShowDepMenu] = useState<'in' | 'out' | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{
    depsToRemove: TimeRangeDependency[];
    computedTargets: ComputedTarget[];
  } | null>(null);
  const cellRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => { setShowDepMenu(null); setRemoveConfirm(null); };

  const openDepMenu = (type: 'in' | 'out', btn: EventTarget & HTMLButtonElement) => {
    const r = btn.getBoundingClientRect();
    setMenuAnchor({ x: r.left + r.width / 2, y: r.top });
    setRemoveConfirm(null);
    setShowDepMenu((v) => (v === type ? null : type));
  };

  useEffect(() => {
    if (!showDepMenu) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showDepMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    drawState,
    startDraw,
    cancelDraw,
    setHoveredTarget,
    confirmDraw,
    hoveredCell,
    setHoveredCell,
    getDepsFrom,
    getDepsTo,
    removeDependency,
    registerCellRect,
    items: allItems,
  } = useDependency();

  // Recursively collect all downstream deps in the chain starting from itemId/colId
  const collectChainDeps = (itemId: string, colId: string, visited = new Set<string>()): TimeRangeDependency[] => {
    const key = `${itemId}::${colId}`;
    if (visited.has(key)) return [];
    visited.add(key);
    const direct = getDepsFrom(itemId, colId);
    const result: TimeRangeDependency[] = [...direct];
    for (const dep of direct) {
      result.push(...collectChainDeps(dep.targetItemId, dep.targetColumnId, visited));
    }
    return result;
  };

  const cellRefId = { itemId: item.id, columnId: column.id };
  const isDrawing = drawState !== null;
  const isSource = drawState?.source.itemId === item.id && drawState?.source.columnId === column.id;
  const isValidTarget = isDrawing && !isSource;
  const hasDepsOut = getDepsFrom(item.id, column.id).length > 0;
  const hasDepsIn = getDepsTo(item.id, column.id).length > 0;
  const isHoveredCell = hoveredCell?.itemId === item.id && hoveredCell?.columnId === column.id;

  useEffect(() => {
    registerCellRect(cellRefId, cellRef.current);
    return () => registerCellRect(cellRefId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCellRect]);

  useEffect(() => {
    setStart(toDateInput(rawValue?.start));
    setEnd(toDateInput(rawValue?.end));
  }, [rawValue]);

  const depsIn = getDepsTo(item.id, column.id);
  const { start: displayStart, end: displayEnd, isComputed } = resolveEffectiveDates(rawValue, depsIn, allItems);

  const isDependentCell = hasDepsIn;

  // ---------------------------------------------------------------------------
  // Commit — accepts values directly so it works with the async picker flow
  // ---------------------------------------------------------------------------

  const commitValues = (s: string, e: string, stopEdit: () => void) => {
    const nextStart = s ? new Date(s).toISOString() : null;
    const nextEnd = e ? new Date(e).toISOString() : null;
    const durationDays =
      nextStart && nextEnd
        ? Math.max(0, Math.round((new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 86_400_000))
        : (rawValue?.durationDays ?? 1);

    // When this cell is formula-driven, update each incoming dep's offsetDays so
    // the formula produces the user's new start date going forward.
    let updatedDependencies: typeof item.dependencies | undefined;
    if (nextStart && depsIn.length > 0) {
      updatedDependencies = (item.dependencies ?? []).map((dep) => {
        const incoming = depsIn.find((d) => d.id === dep.id);
        if (!incoming) return dep;
        const srcEnd = (allItems.find((i) => i.id === incoming.sourceItemId)
          ?.values[incoming.sourceColumnId] as { end?: string | Date } | null | undefined)?.end;
        if (!srcEnd) return dep;
        const newOffset = Math.round(
          (new Date(nextStart).getTime() - new Date(srcEnd as string).getTime()) / 86_400_000,
        );
        return { ...dep, offsetDays: newOffset };
      });
    }

    mutate({
      id: item.id,
      patch: {
        values: { [column.id]: { start: nextStart, end: nextEnd, durationDays } },
        ...(updatedDependencies ? { dependencies: updatedDependencies } : {}),
      },
    });
    setHovered(false);
    stopEdit();
  };

  // ---------------------------------------------------------------------------
  // Removal helpers
  // ---------------------------------------------------------------------------

  const triggerRemoveIn = (dep: TimeRangeDependency) => {
    if (isComputed && displayStart) {
      const durMs = displayEnd ? Math.max(0, displayEnd.getTime() - displayStart.getTime()) : 0;
      setRemoveConfirm({
        depsToRemove: [dep],
        computedTargets: [{
          dep,
          targetItemId: item.id,
          targetColumnId: column.id,
          start: displayStart.toISOString(),
          end: displayEnd?.toISOString() ?? null,
          durationDays: durMs > 0 ? Math.round(durMs / 86_400_000) : (rawValue?.durationDays ?? 1),
        }],
      });
    } else {
      removeDependency(dep);
      closeMenu();
    }
  };

  const triggerRemoveOut = (scope: 'one' | 'all') => {
    const deps = scope === 'all' ? collectChainDeps(item.id, column.id) : getDepsFrom(item.id, column.id);
    const computedTargets = deps
      .map((dep) => computeTargetEffective(dep, allItems))
      .filter((x): x is ComputedTarget => x !== null);
    if (computedTargets.length > 0) {
      setRemoveConfirm({ depsToRemove: deps, computedTargets });
    } else {
      deps.forEach((d) => removeDependency(d));
      closeMenu();
    }
  };

  const handleKeepDates = () => {
    if (!removeConfirm) return;
    for (const t of removeConfirm.computedTargets) {
      mutate({ id: t.targetItemId, patch: { values: { [t.targetColumnId]: { start: t.start, end: t.end, durationDays: t.durationDays } } } });
    }
    removeConfirm.depsToRemove.forEach((d) => removeDependency(d));
    closeMenu();
  };

  const handleRevertDates = () => {
    if (!removeConfirm) return;
    removeConfirm.depsToRemove.forEach((d) => removeDependency(d));
    closeMenu();
  };

  // ---------------------------------------------------------------------------
  // Draw-mode handlers
  // ---------------------------------------------------------------------------

  const handleConnectorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDrawing ? cancelDraw() : startDraw(cellRefId, e.clientX, e.clientY);
  };

  const handleCellClick = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    if (isSource) { cancelDraw(); return; }
    e.stopPropagation();
    confirmDraw(cellRefId);
  };

  const handleMouseEnter = () => {
    setHoveredCell(cellRefId);
    setHovered(true);
    if (isValidTarget) setHoveredTarget(cellRefId);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
    setHovered(false);
    if (isValidTarget) setHoveredTarget(null);
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => (
        // Outer div always rendered so cellRef stays valid (needed by dependency overlay)
        <div
          ref={cellRef}
          className={`px-1 py-0.5 flex justify-center w-full overflow-visible relative ${
            isSource ? 'ring-2 ring-inset ring-blue-500 rounded' : ''
          }`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={isDrawing ? handleCellClick : undefined}
          style={isDrawing && isValidTarget ? { cursor: 'crosshair' } : undefined}
          aria-label={`${column.name} for ${item.name}`}
        >
          {isEditing ? (
            // While picker is open keep a height placeholder so the cell doesn't collapse
            <>
              <div className="h-7 w-full" aria-hidden="true" />
              {createPortal(
                <DateRangePicker
                  initialStart={isComputed ? toDateInput(displayStart) : start}
                  initialEnd={isComputed ? toDateInput(displayEnd) : end}
                  anchorEl={cellRef.current}
                  onCommit={(s, e) => {
                    setStart(s);
                    setEnd(e);
                    commitValues(s, e, stopEdit);
                  }}
                  onCancel={stopEdit}
                />,
                document.body
              )}
            </>
          ) : (
            <>
              {(() => {
                const isEmpty = !displayStart && !displayEnd;
                const durationText = getDurationText(displayStart, displayEnd);
                return isEmpty ? (
                  <div className="px-3 py-2 text-xs text-gray-300 text-center w-full italic">
                    Set range
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center w-full gap-[2px] px-3 h-[26px] rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
                    style={{
                      background: isDependentCell
                        ? 'linear-gradient(90deg, #8b5cf6, #6366f1)'
                        : 'linear-gradient(90deg, #6366f1, #3b82f6)',
                    }}
                    aria-label={hovered && durationText ? durationText : `${formatDate(displayStart)} to ${formatDate(displayEnd)}`}
                  >
                    {hovered && durationText ? (
                      <span className="text-center leading-tight">{durationText}</span>
                    ) : (
                      <>
                        <span>{formatDate(displayStart) || '?'}</span>
                        <span className="mx-1 flex items-center">
                          <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-none stroke-white stroke-[2.5]">
                            <line x1="1" y1="12" x2="19" y2="12" />
                            <polyline points="13 6 19 12 13 18" />
                          </svg>
                        </span>
                        <span>{formatDate(displayEnd) || '?'}</span>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Incoming dependency dot */}
              {hasDepsIn && !isDrawing && (
                <button
                  type="button"
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 border border-white shadow hover:scale-125 transition-transform flex items-center justify-center"
                  style={{ zIndex: 10000 }}
                  aria-label="Incoming dependency — click to remove"
                  title="Click to remove incoming dependency"
                  onClick={(e) => { e.stopPropagation(); openDepMenu('in', e.currentTarget); }}
                >
                  <svg viewBox="0 0 8 8" className="w-[6px] h-[6px]" aria-hidden="true">
                    <line x1="1" y1="1" x2="7" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7" y1="1" x2="1" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}

              {/* Outgoing dependency dot */}
              {hasDepsOut && !isDrawing && (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border border-white shadow hover:scale-125 transition-transform flex items-center justify-center"
                  style={{ zIndex: 10000 }}
                  aria-label="Outgoing dependency — click to remove all"
                  title="Click to remove all outgoing dependencies"
                  onClick={(e) => { e.stopPropagation(); openDepMenu('out', e.currentTarget); }}
                >
                  <svg viewBox="0 0 8 8" className="w-[6px] h-[6px]" aria-hidden="true">
                    <line x1="1" y1="1" x2="7" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="7" y1="1" x2="1" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}

              {/* Connector handle */}
              {(hovered || isHoveredCell || isSource) && !isDrawing && (
                <button
                  type="button"
                  className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow transition-all z-20 bg-white border-indigo-400 hover:bg-indigo-100 hover:scale-125"
                  onClick={handleConnectorClick}
                  aria-label="Start dependency from this cell"
                  title="Draw dependency"
                />
              )}

              {/* Source cancel handle */}
              {isSource && (
                <button
                  type="button"
                  className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 shadow transition-all z-20 bg-blue-500 border-blue-600 scale-125"
                  onClick={handleConnectorClick}
                  aria-label="Cancel dependency drawing"
                  title="Click to cancel"
                />
              )}
            </>
          )}

          {/* Dependency removal popover */}
          {showDepMenu && menuAnchor && createPortal(
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                onClick={closeMenu}
                aria-hidden="true"
              />
              <div
                style={{
                  position: 'fixed',
                  left: menuAnchor.x,
                  top: menuAnchor.y,
                  transform: 'translate(-50%, calc(-100% - 8px))',
                  zIndex: 10001,
                }}
                className="bg-white border border-gray-200 rounded-lg shadow-xl min-w-[200px] py-1"
                role="menu"
                aria-label="Dependency options"
                onClick={(e) => e.stopPropagation()}
              >
                {removeConfirm ? (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-700 leading-snug">
                      {removeConfirm.computedTargets.length === 1 && removeConfirm.computedTargets[0].targetItemId === item.id
                        ? 'This cell shows formula-driven dates.'
                        : `${removeConfirm.computedTargets.length} target cell(s) show formula-driven dates.`}
                    </p>
                    <p className="px-3 pb-2 text-[10px] text-gray-400">
                      Keep the current dates or revert to the original?
                    </p>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 font-medium"
                      onClick={handleKeepDates}
                      aria-label="Keep formula-computed dates after removing link"
                    >
                      Keep current dates
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      onClick={handleRevertDates}
                      aria-label="Revert to original dates after removing link"
                    >
                      Revert to original dates
                    </button>
                    <div className="border-t border-gray-100 mt-1">
                      <button
                        type="button"
                        className="w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                        onClick={closeMenu}
                        aria-label="Cancel removal"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="px-3 pt-1 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                      {showDepMenu === 'in' ? 'Incoming' : 'Outgoing'} dependencies
                    </p>
                    {showDepMenu === 'out' ? (
                      (() => {
                        const directDeps = getDepsFrom(item.id, column.id);
                        const chainDeps = collectChainDeps(item.id, column.id);
                        return (
                          <>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                              onClick={() => triggerRemoveOut('one')}
                              aria-label={`Remove outgoing link (${directDeps.length})`}
                            >
                              <span className="text-red-400">✕</span>
                              Remove just this link ({directDeps.length})
                            </button>
                            {chainDeps.length > directDeps.length && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                onClick={() => triggerRemoveOut('all')}
                                aria-label={`Remove all downstream links (${chainDeps.length})`}
                              >
                                <span className="text-red-400">✕</span>
                                Remove all below ({chainDeps.length})
                              </button>
                            )}
                          </>
                        );
                      })()
                    ) : (
                      getDepsTo(item.id, column.id).map((dep) => (
                        <button
                          key={dep.id}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                          onClick={() => triggerRemoveIn(dep)}
                        >
                          <span className="text-red-400">✕</span>
                          Remove link
                        </button>
                      ))
                    )}
                    <div className="border-t border-gray-100 mt-1">
                      <button
                        type="button"
                        className="w-full text-center px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                        onClick={closeMenu}
                        aria-label="Cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>,
            document.body
          )}
        </div>
      )}
    </CellWrapper>
  );
};

export default TimeRangeCell;
