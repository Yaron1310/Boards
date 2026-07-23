import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { Column, TimeRangeValue } from '../../../types';
import type { PersonalCellProps } from './types';

// Same date-range picker UX as the real board's TimeRangeCell (hotel-style click
// start then end), minus dependency-link drawing — personal columns have no
// dependency concept, since they're annotations on top of items, not real columns.

const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatDate = (val: Date | null | undefined): string => {
  if (!val) return '';
  return `${SHORT_MONTHS[val.getMonth()]} ${val.getDate()}`;
};

interface DateRangeLabels { startLabel: string; endLabel: string; sameDay: boolean }
const formatDateRange = (start: Date | null, end: Date | null): DateRangeLabels => {
  if (!start) return { startLabel: '?', endLabel: '?', sameDay: false };
  const startLabel = `${SHORT_MONTHS[start.getMonth()]} ${start.getDate()}`;
  if (!end) return { startLabel, endLabel: '?', sameDay: false };
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
  if (sameDay) return { startLabel, endLabel: '', sameDay: true };
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  const endLabel = sameMonth ? `${end.getDate()}` : `${SHORT_MONTHS[end.getMonth()]} ${end.getDate()}`;
  return { startLabel, endLabel, sameDay: false };
};

const toDate = (val: string | Date | null | undefined): Date | null => {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val as string);
  return isNaN(d.getTime()) ? null : d;
};

const isoFromParts = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MS_PER_DAY = 86_400_000;
const inclusiveDays = (start: Date, end: Date): number => Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
const pluralDays = (n: number) => `${n} day${n !== 1 ? 's' : ''}`;
const getDurationText = (start: Date | null, end: Date | null): string => {
  if (!start || !end) return '';
  const total = inclusiveDays(start, end);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const left = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  return left > 0 ? `${pluralDays(total)} (${pluralDays(left)} left)` : pluralDays(total);
};

interface DateRangePickerProps {
  initialStart: string;
  initialEnd: string;
  anchorEl: HTMLElement | null;
  onCommit: (start: string, end: string) => void;
  onCancel: () => void;
  onRemove: () => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({ initialStart, initialEnd, anchorEl, onCommit, onCancel, onRemove }) => {
  const [selStart, setSelStart] = useState(initialStart);
  const [selEnd, setSelEnd] = useState(initialEnd);
  const [phase, setPhase] = useState<'start' | 'end'>('start');
  const [hoverIso, setHoverIso] = useState('');
  const [viewYear, setViewYear] = useState(() => (initialStart ? new Date(initialStart).getFullYear() : new Date().getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (initialStart ? new Date(initialStart).getMonth() : new Date().getMonth()));
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const selStartRef = useRef(selStart);
  selStartRef.current = selStart;

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        if (phaseRef.current === 'end' && selStartRef.current) onCommit(selStartRef.current, initialEnd);
        else onCancel();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onCancel, onCommit, initialEnd]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);

  const goToPrevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1); };
  const goToNextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1); };

  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
  const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
  const daysInPrevMonth = new Date(prevY, prevM + 1, 0).getDate();
  const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
  const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
  const trailingCount = (firstDayOffset + daysInMonth) % 7 === 0 ? 0 : 7 - ((firstDayOffset + daysInMonth) % 7);

  interface DayCell { iso: string; day: number; outside: boolean }
  const dayCells: DayCell[] = [
    ...Array.from({ length: firstDayOffset }, (_, i) => {
      const day = daysInPrevMonth - firstDayOffset + i + 1;
      return { iso: isoFromParts(prevY, prevM, day), day, outside: true };
    }),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ iso: isoFromParts(viewYear, viewMonth, i + 1), day: i + 1, outside: false })),
    ...Array.from({ length: trailingCount }, (_, i) => ({ iso: isoFromParts(nextY, nextM, i + 1), day: i + 1, outside: true })),
  ];

  const handleDayClick = (iso: string, outside: boolean) => {
    if (outside) {
      const d = new Date(iso + 'T12:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    if (phase === 'start') {
      setSelStart(iso);
      setSelEnd('');
      setPhase('end');
    } else if (selStart && iso < selStart) {
      setSelStart(iso);
      setSelEnd('');
    } else {
      onCommit(selStart, iso);
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
      <div className="flex items-center justify-between mb-1">
        <button type="button" onClick={goToPrevMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none" aria-label="Previous month">‹</button>
        <span className="text-sm font-semibold text-gray-700">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={goToNextMonth} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none" aria-label="Next month">›</button>
      </div>
      <p className="text-[10px] text-center text-indigo-400 font-medium mb-2">
        {phase === 'start' ? 'Select start date' : selStart ? `${formatDate(new Date(selStart + 'T12:00:00'))} → select end date` : 'Select end date'}
      </p>
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_NAMES.map((d) => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dayCells.map(({ iso, day, outside }) => (
          <button
            key={iso}
            type="button"
            className={`h-8 w-full text-[12px] font-medium text-center transition-colors ${getDayClass(iso, outside)}`}
            onClick={() => handleDayClick(iso, outside)}
            onMouseEnter={() => { if (phase === 'end') setHoverIso(iso); }}
            onMouseLeave={() => setHoverIso('')}
            aria-pressed={iso === selStart || iso === selEnd}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onRemove} className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 transition-colors" aria-label="Remove dates">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path d="M6 2a1 1 0 0 0-1 1H3a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2h-2a1 1 0 0 0-1-1H6zM3.5 6a.5.5 0 0 1 .5.5V12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6.5a.5.5 0 0 1 1 0V12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a.5.5 0 0 1 .5-.5z"/>
            <path d="M6.5 7.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V8a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V8a.5.5 0 0 1 .5-.5z"/>
          </svg>
          Remove dates
        </button>
        <button type="button" onClick={onCancel} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cancel date selection">Cancel</button>
      </div>
    </div>
  );
};

const PersonalTimeRangeCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable, userId }) => {
  const rawValue = value as TimeRangeValue | null | undefined;
  const { mutate } = useUpdatePersonalItemValue(userId);
  const { push: pushUndo } = useUndo();
  const [start, setStart] = useState(toDateInput(rawValue?.start));
  const [end, setEnd] = useState(toDateInput(rawValue?.end));
  const [hovered, setHovered] = useState(false);
  const cellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setStart(toDateInput(rawValue?.start)); setEnd(toDateInput(rawValue?.end)); }, [rawValue]);

  const displayStart = toDate(rawValue?.start);
  const displayEnd = toDate(rawValue?.end);

  const commitValues = (s: string, e: string, stopEdit: () => void) => {
    const prevValue = rawValue;
    const nextStart = s ? new Date(s).toISOString() : null;
    const nextEnd = e ? new Date(e).toISOString() : null;
    const durationDays = nextStart && nextEnd ? inclusiveDays(new Date(nextStart), new Date(nextEnd)) : (rawValue?.durationDays ?? 1);
    pushUndo({ label: `Changed date range on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: prevValue ?? null }) });
    mutate({ itemId, columnId: column.id, value: { start: nextStart, end: nextEnd, durationDays } });
    setHovered(false);
    stopEdit();
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => (
        <div
          ref={cellRef}
          className="px-1 py-0.5 flex justify-center w-full overflow-visible relative"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label={`${column.name} for ${itemName}`}
        >
          {isEditing ? (
            <>
              <div className="h-7 w-full" aria-hidden="true" />
              {createPortal(
                <DateRangePicker
                  initialStart={start}
                  initialEnd={end}
                  anchorEl={cellRef.current}
                  onCommit={(s, e) => { setStart(s); setEnd(e); commitValues(s, e, stopEdit); }}
                  onCancel={stopEdit}
                  onRemove={() => {
                    const prevValue = rawValue;
                    pushUndo({ label: `Removed date range on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: prevValue ?? null }) });
                    mutate({ itemId, columnId: column.id, value: null });
                    setStart('');
                    setEnd('');
                    stopEdit();
                  }}
                />,
                document.body,
              )}
            </>
          ) : (() => {
            const isEmpty = !displayStart && !displayEnd;
            const durationText = getDurationText(displayStart, displayEnd);
            if (isEmpty) {
              return <div className="px-3 py-2 text-xs text-gray-300 text-center w-full italic">Set range</div>;
            }
            const { startLabel, endLabel, sameDay: isSameDay } = formatDateRange(displayStart, displayEnd);
            return (
              <div
                className="flex items-center justify-center w-full gap-[2px] px-3 h-[26px] rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-[0_2px_8px_rgba(0,0,0,0.1)] cursor-default"
                style={{ background: '#6366f1' }}
                aria-label={hovered && durationText ? durationText : isSameDay ? startLabel : `${startLabel} to ${endLabel}`}
              >
                {hovered && durationText ? (
                  <span className="text-center leading-tight">{durationText}</span>
                ) : isSameDay ? (
                  <span>{startLabel}</span>
                ) : (
                  <>
                    <span>{startLabel}</span>
                    <span className="mx-1 flex items-center">
                      <svg viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-none stroke-white stroke-[2.5]">
                        <line x1="1" y1="12" x2="19" y2="12" />
                        <polyline points="13 6 19 12 13 18" />
                      </svg>
                    </span>
                    <span>{endLabel}</span>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </CellWrapper>
  );
};

export default React.memo(PersonalTimeRangeCell);
