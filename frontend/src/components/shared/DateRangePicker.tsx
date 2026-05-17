import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const isoFromParts = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const formatDateLabel = (iso: string): string => {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

export interface DateRangePickerProps {
  initialStart: string;
  initialEnd: string;
  anchorEl: HTMLElement | null;
  onCommit: (start: string, end: string) => void;
  onCancel: () => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  initialStart, initialEnd, anchorEl, onCommit, onCancel,
}) => {
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

  return createPortal(
    <div
      ref={pickerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10002, width: 264 }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 select-none"
      onClick={(e) => e.stopPropagation()}
      aria-label="Date range picker"
    >
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

      <p className="text-[10px] text-center text-indigo-400 font-medium mb-2">
        {phase === 'start'
          ? 'Select start date'
          : selStart
            ? `${formatDateLabel(selStart)} → select end date`
            : 'Select end date'}
      </p>

      <div className="grid grid-cols-7 mb-0.5">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-0.5">{d}</div>
        ))}
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
            aria-label={`${day} ${MONTH_NAMES[outside ? (iso < isoFromParts(viewYear, viewMonth, 1) ? prevM : nextM) : viewMonth]} ${outside ? (iso < isoFromParts(viewYear, viewMonth, 1) ? prevY : nextY) : viewYear}`}
            aria-pressed={iso === selStart || iso === selEnd}
          >
            {day}
          </button>
        ))}
      </div>

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
    </div>,
    document.body,
  );
};

export default DateRangePicker;
