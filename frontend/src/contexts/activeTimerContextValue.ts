import { createContext } from 'react';
import type { ActiveTimer } from '../types';
import type { StartTimerTarget, StopTimerResult } from '../services/timerService';

/** Asks the stop popover to open for the running timer. */
export interface StopRequest {
  /** Element the popover is placed next to (the cell or the floating indicator). */
  anchorEl: HTMLElement | null;
  /** Called once the entry is saved — the board/Personal Hub cell uses it to offer Undo. */
  onLogged?: (result: StopTimerResult) => void;
  /** The "switch" flow: start this timer once the running one is saved or discarded. */
  then?: StartTimerTarget;
  /** Window the popover is shown in — the floating timer window, when Stop was clicked there. */
  window?: Window;
}

export interface ActiveTimerContextValue {
  /** The signed-in user's running timer, or null. */
  timer: ActiveTimer | null;
  /** Server clock minus client clock (ms) — added to Date.now() so a skewed client clock can't
   *  distort elapsed time. */
  serverOffsetMs: number;
  /** Starts a timer on the given cell. If another timer is already running, opens the stop
   *  popover for it first and starts this one after it is saved or discarded. */
  start: (target: StartTimerTarget, anchorEl: HTMLElement | null) => Promise<void>;
  requestStop: (request: StopRequest) => void;
  isStarting: boolean;
  /** Whether this browser supports the floating (Picture-in-Picture) timer window. */
  pipSupported: boolean;
  /** Whether starting a timer opens the floating window (on by default). */
  pipEnabled: boolean;
  setPipEnabled: (enabled: boolean) => void;
  /** True while the floating timer window is open. */
  pipOpen: boolean;
  /** Opens the floating window on demand (needs a user click), regardless of the auto-open setting. */
  openPip: () => void;
}

export const ActiveTimerContext = createContext<ActiveTimerContextValue | null>(null);
