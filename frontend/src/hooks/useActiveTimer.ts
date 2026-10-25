import { useContext, useEffect, useState } from 'react';
import { ActiveTimerContext, type ActiveTimerContextValue } from '../contexts/activeTimerContextValue';
import type { ActiveTimer } from '../types';

const NO_TIMER: ActiveTimerContextValue = {
  timer: null,
  serverOffsetMs: 0,
  start: async () => {},
  requestStop: () => {},
  isStarting: false,
  pipSupported: false,
  pipEnabled: false,
  setPipEnabled: () => {},
  pipOpen: false,
  openPip: () => {},
};

/** The Hours Log stop-clock state. Outside an ActiveTimerProvider (e.g. a public view link)
 *  there is never a timer and starting one does nothing. */
export const useActiveTimer = (): ActiveTimerContextValue => useContext(ActiveTimerContext) ?? NO_TIMER;

/**
 * Seconds the given timer has been running, re-rendering once a second while it runs.
 * Always recomputed from the timer's server start time, so a tab the browser throttled or put to
 * sleep shows the right value the moment it is visible again (no drift, nothing lost).
 */
export function useTimerElapsedSeconds(timer: ActiveTimer | null, serverOffsetMs: number): number {
  const compute = () => (timer ? Math.max(0, (Date.now() + serverOffsetMs - Date.parse(timer.startedAt)) / 1000) : 0);
  const [elapsed, setElapsed] = useState(compute);

  useEffect(() => {
    if (!timer) { setElapsed(0); return; }
    const startMs = Date.parse(timer.startedAt);
    const tick = () => setElapsed(Math.max(0, (Date.now() + serverOffsetMs - startMs) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    // Background tabs throttle intervals — catch up immediately on return.
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [timer, serverOffsetMs]);

  return elapsed;
}
