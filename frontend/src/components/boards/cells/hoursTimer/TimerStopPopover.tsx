import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertTriangle } from 'react-icons/fi';
import { sanitizeNumberDraft } from '../../../../utils/numberFormat';
import {
  HOURS_LOG_MAX_HOURS,
  HOURS_LOG_MAX_MINUTES,
  HOURS_TIMER_LONG_RUN_MINUTES,
  formatTimerRange,
} from '../../../../utils/hoursLog';
import type { ActiveTimer } from '../../../../types';

interface Props {
  timer: ActiveTimer;
  serverOffsetMs: number;
  anchorEl: HTMLElement | null;
  /** Window to show the popover in (the floating timer window); defaults to the app window. */
  targetWindow?: Window;
  /** True when a new timer will start once this one is saved/discarded (the "switch" flow). */
  switching: boolean;
  busy: boolean;
  error: string | null;
  onSave: (minutes: number) => void;
  onDiscard: () => void;
  /** Closes the popover; the timer keeps running. Also what Esc / clicking outside do, so a long
   *  run is never lost by accident. */
  onKeepRunning: () => void;
}

const WIDTH = 290;

/** Whole number typed in a box, kept within 0–max (empty or unreadable reads as 0). */
const clamp = (text: string, max: number): number => {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

/**
 * Shown when a running Hours Log timer is stopped. The hours/minutes boxes are prefilled with the
 * time the timer measured (exact minutes) and stay editable, so a forgotten timer can be
 * corrected before saving; Save logs whatever the boxes show.
 */
const TimerStopPopover: React.FC<Props> = ({
  timer, serverOffsetMs, anchorEl, targetWindow, switching, busy, error, onSave, onDiscard, onKeepRunning,
}) => {
  // Frozen at opening — the boxes are prefilled with, and the range ends at, the moment Stop was
  // clicked, not a moving "now".
  const [stoppedAt] = useState(() => new Date(Date.now() + serverOffsetMs));
  const elapsedSeconds = Math.max(0, (stoppedAt.getTime() - Date.parse(timer.startedAt)) / 1000);
  const measuredMinutes = Math.min(HOURS_LOG_MAX_MINUTES, Math.floor(elapsedSeconds / 60));
  const [hoursText, setHoursText] = useState(String(Math.floor(measuredMinutes / 60)));
  const [minutesText, setMinutesText] = useState(String(measuredMinutes % 60).padStart(2, '0'));
  const hours = clamp(hoursText, HOURS_LOG_MAX_HOURS);
  const minutes = clamp(minutesText, 59);
  const total = hours * 60 + minutes;
  const isLongRun = elapsedSeconds / 60 > HOURS_TIMER_LONG_RUN_MINUTES;

  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const win = targetWindow ?? window;

  useEffect(() => {
    const h = isLongRun ? 240 : 190;
    if (!anchorEl) {
      setPos({ top: Math.max(8, win.innerHeight / 2 - h / 2), left: Math.max(8, win.innerWidth / 2 - WIDTH / 2) });
      return;
    }
    const r = anchorEl.getBoundingClientRect();
    let top = r.bottom + 6;
    let left = r.left;
    if (top + h > win.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    if (left + WIDTH > win.innerWidth - 8) left = Math.max(8, win.innerWidth - WIDTH - 8);
    setPos({ top, left });
  }, [anchorEl, isLongRun, win]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onKeepRunning();
    };
    const t = setTimeout(() => win.document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); win.document.removeEventListener('mousedown', handler); };
  }, [onKeepRunning, win]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onKeepRunning(); };
    win.addEventListener('keydown', h);
    return () => win.removeEventListener('keydown', h);
  }, [onKeepRunning, win]);

  const save = () => { if (total > 0 && !busy) onSave(total); };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  };

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10003, width: WIDTH }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 select-none"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="false"
      aria-labelledby="hours-timer-stop-title"
    >
      <p id="hours-timer-stop-title" className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide truncate">
        {switching ? 'Stop current timer' : 'Stop timer'}
        {timer.itemName ? <span className="normal-case font-normal"> — “{timer.itemName}”</span> : null}
      </p>
      <p className="text-xs text-gray-500 mt-0.5 mb-2">{formatTimerRange(timer.startedAt, stoppedAt)}</p>

      <div className="flex items-center justify-center gap-1.5">
        {/* Plain text boxes (not type="number") so the mouse wheel can't change the value. */}
        <input
          type="text"
          inputMode="numeric"
          value={hoursText}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setHoursText(sanitizeNumberDraft(e.target.value, { allowDecimal: false, allowNegative: false }))}
          onBlur={() => setHoursText(String(hours))}
          onKeyDown={onEnter}
          className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center select-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={`Hours, 0 to ${HOURS_LOG_MAX_HOURS}`}
        />
        <span className="text-gray-400 font-semibold" aria-hidden="true">:</span>
        <input
          type="text"
          inputMode="numeric"
          value={minutesText}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setMinutesText(sanitizeNumberDraft(e.target.value, { allowDecimal: false, allowNegative: false }))}
          onBlur={() => setMinutesText(String(minutes).padStart(2, '0'))}
          onKeyDown={onEnter}
          className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center select-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Minutes, 0 to 59"
        />
      </div>

      {isLongRun && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-md px-2 py-1.5" role="note">
          <FiAlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>Timer ran over {HOURS_TIMER_LONG_RUN_MINUTES / 60} hours. Forgot to stop it? Fix the time above before saving.</span>
        </p>
      )}
      {total === 0 && (
        <p className="mt-2 text-[11px] text-gray-400">Less than a minute — nothing to log.</p>
      )}
      {error && (
        <p className="mt-2 text-[11px] text-red-600" role="alert">{error}</p>
      )}

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 gap-2">
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="text-[11px] text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
          aria-label="Discard timer without logging"
        >
          Discard
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onKeepRunning}
            disabled={busy}
            className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
            aria-label="Keep the timer running"
          >
            Keep running
          </button>
          <button
            type="button"
            onClick={save}
            disabled={total === 0 || busy}
            className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
            aria-label="Save logged time"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    win.document.body,
  );
};

export default TimerStopPopover;
