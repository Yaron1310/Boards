import React, { useEffect, useRef, useState } from 'react';
import { FiSquare } from 'react-icons/fi';
import { formatTimerClock } from '../../utils/hoursLog';
import type { ActiveTimer } from '../../types';

interface Props {
  timer: ActiveTimer;
  serverOffsetMs: number;
  /** The Picture-in-Picture window this view is rendered into. */
  win: Window;
  /** True when the user opted out of the window opening automatically. */
  autoOpenDisabled: boolean;
  onAutoOpenDisabledChange: (disabled: boolean) => void;
  onStop: (anchorEl: HTMLElement | null) => void;
}

/** Contents of the floating timer window: item name, live clock, Stop, and the opt-out setting. */
const TimerPipView: React.FC<Props> = ({ timer, serverOffsetMs, win, autoOpenDisabled, onAutoOpenDisabledChange, onStop }) => {
  const compute = () => Math.max(0, (Date.now() + serverOffsetMs - Date.parse(timer.startedAt)) / 1000);
  const [elapsed, setElapsed] = useState(compute);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ticks on the PiP window's own timer: the main tab is usually hidden (and throttled) while this is open.
  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, (Date.now() + serverOffsetMs - Date.parse(timer.startedAt)) / 1000));
    tick();
    const interval = win.setInterval(tick, 1000);
    return () => win.clearInterval(interval);
  }, [timer.startedAt, serverOffsetMs, win]);

  const clock = formatTimerClock(elapsed);
  const name = timer.itemName || 'Untitled item';

  return (
    <div ref={rootRef} role="region" aria-label="Running timer" className="p-3 bg-white min-h-screen select-none">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" aria-hidden="true" />
        <span className="text-xs text-gray-600 truncate flex-1 min-w-0" title={name}>{name}</span>
        <span role="timer" aria-live="off" aria-label={`Elapsed ${clock}`} className="text-lg font-semibold text-gray-800 tabular-nums">
          {clock}
        </span>
        <button
          type="button"
          onClick={() => onStop(rootRef.current)}
          className="p-2 rounded-full text-red-600 hover:bg-red-50 transition-colors"
          title="Stop timer"
          aria-label={`Stop timer on ${name}, elapsed ${clock}`}
        >
          <FiSquare size={14} fill="currentColor" aria-hidden="true" />
        </button>
      </div>
      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
        <input
          type="checkbox"
          checked={autoOpenDisabled}
          onChange={(e) => onAutoOpenDisabledChange(e.target.checked)}
          className="rounded border-gray-300"
          aria-label="Don't open this floating timer window automatically"
        />
        Don&apos;t open this window automatically
      </label>
    </div>
  );
};

export default TimerPipView;
