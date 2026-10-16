import type { ActiveTimer, HoursLogEntry } from '../types';
import { fetchWithAuth } from './authFetch';

// Hours Log stop-clock — see backend timer.controller for the model (one running timer per user,
// elapsed time always derived from its server-side start time).

export interface ActiveTimerResponse {
  timer: ActiveTimer | null;
  /** Server clock at response time — used to correct for a skewed client clock. */
  serverNow: string;
}

export interface StartTimerTarget {
  kind: ActiveTimer['kind'];
  itemId: string;
  columnId: string;
}

export interface StopTimerResult {
  kind: ActiveTimer['kind'];
  itemId: string;
  columnId: string;
  entry: HoursLogEntry;
  /** The cell's full entry list after the append. */
  value: HoursLogEntry[];
}

export const getActiveTimer = (): Promise<ActiveTimerResponse> =>
  fetchWithAuth('/api/timers/active');

export const startTimer = (target: StartTimerTarget): Promise<{ timer: ActiveTimer; serverNow: string }> =>
  fetchWithAuth('/api/timers/start', { method: 'POST', body: JSON.stringify(target) });

export const stopTimer = (timerId: string, minutes: number): Promise<StopTimerResult> =>
  fetchWithAuth('/api/timers/stop', { method: 'POST', body: JSON.stringify({ timerId, minutes }) });

export const discardTimer = (timerId: string): Promise<{ message: string }> =>
  fetchWithAuth('/api/timers/discard', { method: 'POST', body: JSON.stringify({ timerId }) });
