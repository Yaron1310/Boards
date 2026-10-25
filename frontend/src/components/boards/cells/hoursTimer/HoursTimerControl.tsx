import React, { useEffect, useRef, useState } from 'react';
import { FiExternalLink, FiPlay, FiSquare } from 'react-icons/fi';
import { useActiveTimer, useTimerElapsedSeconds } from '../../../../hooks/useActiveTimer';
import { formatTimerClock } from '../../../../utils/hoursLog';
import type { ActiveTimer } from '../../../../types';
import type { StopTimerResult } from '../../../../services/timerService';

interface Props {
  kind: ActiveTimer['kind'];
  itemId: string;
  columnId: string;
  itemName: string;
  /** What the cell shows when its timer isn't running (the logged total / "Log hours"). */
  idleContent: React.ReactNode;
  /** False on read-only cells — the ▶ button is hidden (a running timer can still be stopped). */
  canStart: boolean;
  /** Called after the running timer on this cell is saved, so the cell can offer Undo. */
  onLogged?: (result: StopTimerResult) => void;
}

/** True when `timer` is the one running on this exact cell. */
const isThisCell = (timer: ActiveTimer | null, kind: Props['kind'], itemId: string, columnId: string) =>
  !!timer && timer.kind === kind && timer.itemId === itemId && timer.columnId === columnId;

/**
 * The stop-clock part of an Hours Log cell. Idle: the cell's normal content, with a ▶ that shows
 * on hover. Running here: a pulsing dot, the live H:MM:SS and a ■ that opens the stop popover.
 * The ▶/■ clicks never open the cell's manual-entry picker.
 */
const HoursTimerControl: React.FC<Props> = ({ kind, itemId, columnId, itemName, idleContent, canStart, onLogged }) => {
  const { timer, serverOffsetMs, start, requestStop, isStarting, pipSupported, pipEnabled, setPipEnabled } = useActiveTimer();
  const running = isThisCell(timer, kind, itemId, columnId);
  const elapsed = useTimerElapsedSeconds(running ? timer : null, serverOffsetMs);
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  const stopClick = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    requestStop({ anchorEl: rootRef.current, onLogged });
  };

  const playClick = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setError(null);
    start({ kind, itemId, columnId }, rootRef.current).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not start the timer.');
    });
  };

  if (running) {
    const clock = formatTimerClock(elapsed);
    return (
      <div ref={rootRef} className="relative w-full h-full flex items-center justify-center gap-1.5 px-2">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
        {/* Not a live region: announcing every second would flood screen readers — the ■ button's
            label carries the elapsed time. */}
        <span role="timer" aria-live="off" aria-label={`Timer running for ${itemName}`} className="text-sm font-medium text-gray-800 tabular-nums">
          {clock}
        </span>
        <button
          type="button"
          onClick={stopClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          className="ml-0.5 p-1 rounded text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
          title="Stop timer"
          aria-label={`Stop timer on ${itemName}, elapsed ${clock}`}
        >
          <FiSquare size={12} fill="currentColor" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="group/timer relative w-full h-full flex items-center justify-center">
      {idleContent}
      {canStart && pipSupported && !pipEnabled && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPipEnabled(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          className="absolute right-7 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-500 bg-white/90 shadow-sm opacity-0 group-hover/timer:opacity-100 focus:opacity-100 hover:bg-gray-100 transition-opacity"
          title="Open the floating timer window when starting a timer"
          aria-label="Turn the floating timer window back on"
        >
          <FiExternalLink size={11} aria-hidden="true" />
        </button>
      )}
      {canStart && (
        <button
          type="button"
          onClick={playClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          disabled={isStarting}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full text-indigo-600 bg-white/90 shadow-sm opacity-0 group-hover/timer:opacity-100 focus:opacity-100 hover:bg-indigo-50 transition-opacity disabled:opacity-40"
          title={timer ? 'Start a timer here (stops the one running now)' : 'Start timer'}
          aria-label={`Start timer on ${itemName}`}
        >
          <FiPlay size={11} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      {error && (
        <span role="alert" className="absolute left-1 right-1 -bottom-0.5 text-[10px] leading-tight text-red-600 truncate text-center bg-white/90">
          {error}
        </span>
      )}
    </div>
  );
};

export default HoursTimerControl;
