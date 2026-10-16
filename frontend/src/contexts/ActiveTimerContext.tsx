import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, onSnapshot, type FirestoreError } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { firestoreDb, firebaseAuth } from '../firebase';
import { useAuthSession } from '../hooks/useAuthSession';
import { queryKeys } from '../hooks/queries/queryKeys';
import * as timerApi from '../services/timerService';
import type { StartTimerTarget, StopTimerResult } from '../services/timerService';
import { ActiveTimerContext, type ActiveTimerContextValue, type StopRequest } from './activeTimerContextValue';
import TimerStopPopover from '../components/boards/cells/hoursTimer/TimerStopPopover';

const ACTIVE_TIMER_KEY = ['timers', 'active'] as const;

/** Refreshes whatever shows the cell a timer just logged to. */
function invalidateTimerTarget(qc: ReturnType<typeof useQueryClient>, kind: StopTimerResult['kind']) {
  if (kind === 'board') void qc.invalidateQueries({ queryKey: ['items'] });
  else void qc.invalidateQueries({ queryKey: queryKeys.personalHub.itemValuesRoot });
}

/**
 * Holds the signed-in user's Hours Log stop-clock (at most one running timer) for the whole app,
 * and renders the stop popover. The timer lives on the server (activeTimers/{userId}); this
 * provider fetches it and listens to that doc, so every tab and device shows the same timer.
 */
export const ActiveTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const { user, selectedWorkspace } = useAuthSession();
  const userId = user?.id;
  const orgId = selectedWorkspace?.orgId;
  const enabled = !!userId && !!orgId;

  const { data } = useQuery({
    queryKey: [...ACTIVE_TIMER_KEY, orgId ?? '', userId ?? ''],
    queryFn: async () => {
      const res = await timerApi.getActiveTimer();
      return { timer: res.timer, serverOffsetMs: Date.parse(res.serverNow) - Date.now() };
    },
    enabled,
    staleTime: 30 * 1000,
  });
  const timer = enabled ? data?.timer ?? null : null;
  const serverOffsetMs = data?.serverOffsetMs ?? 0;

  // Live updates: a timer started/stopped in another tab or on another device.
  useEffect(() => {
    if (!userId || !orgId) return;
    let unsub: (() => void) | null = null;
    const open = () => {
      unsub = onSnapshot(
        doc(firestoreDb, `organizations/${orgId}/activeTimers/${userId}`),
        () => { void qc.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY }); },
        (err: FirestoreError) => console.warn('[ActiveTimer] Firestore error:', err.code, err.message),
      );
    };
    const close = () => { unsub?.(); unsub = null; };
    const unsubAuth = onAuthStateChanged(firebaseAuth, (fbUser) => { close(); if (fbUser) open(); });
    return () => { unsubAuth(); close(); };
  }, [userId, orgId, qc]);

  const setTimerCache = useCallback((next: typeof data) => {
    qc.setQueryData([...ACTIVE_TIMER_KEY, orgId ?? '', userId ?? ''], next);
  }, [qc, orgId, userId]);

  const startMutation = useMutation({
    mutationFn: (target: StartTimerTarget) => timerApi.startTimer(target),
    onSuccess: (res) => setTimerCache({ timer: res.timer, serverOffsetMs: Date.parse(res.serverNow) - Date.now() }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY }); },
  });

  // --- Stop popover ---------------------------------------------------------------------------
  const [stopRequest, setStopRequest] = useState<StopRequest | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestStop = useCallback((request: StopRequest) => {
    setStopError(null);
    setStopRequest(request);
  }, []);

  const start = useCallback(async (target: StartTimerTarget, anchorEl: HTMLElement | null) => {
    if (timer) {
      // One timer at a time: settle the running one first, then start this one.
      requestStop({ anchorEl, then: target });
      return;
    }
    await startMutation.mutateAsync(target);
  }, [timer, requestStop, startMutation]);

  const closePopover = useCallback(() => {
    if (busy) return;
    setStopRequest(null);
    setStopError(null);
  }, [busy]);

  const finish = async (then: StartTimerTarget | undefined) => {
    setTimerCache({ timer: null, serverOffsetMs });
    setStopRequest(null);
    if (then) {
      try { await startMutation.mutateAsync(then); } catch { /* the cell shows nothing running — the user can retry */ }
    }
  };

  const handleSave = async (minutes: number) => {
    if (!timer || !stopRequest) return;
    setBusy(true);
    setStopError(null);
    try {
      const result = await timerApi.stopTimer(timer.id, minutes);
      invalidateTimerTarget(qc, result.kind);
      stopRequest.onLogged?.(result);
      await finish(stopRequest.then);
    } catch (err) {
      setStopError(err instanceof Error ? err.message : 'Failed to stop the timer.');
      void qc.invalidateQueries({ queryKey: ACTIVE_TIMER_KEY });
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!timer || !stopRequest) return;
    setBusy(true);
    setStopError(null);
    try {
      await timerApi.discardTimer(timer.id);
      await finish(stopRequest.then);
    } catch (err) {
      setStopError(err instanceof Error ? err.message : 'Failed to discard the timer.');
    } finally {
      setBusy(false);
    }
  };

  // The timer was stopped elsewhere (another tab/device) while the popover was open.
  useEffect(() => {
    if (stopRequest && !timer && !busy) setStopRequest(null);
  }, [stopRequest, timer, busy]);

  const value = useMemo<ActiveTimerContextValue>(() => ({
    timer,
    serverOffsetMs,
    start,
    requestStop,
    isStarting: startMutation.isPending,
  }), [timer, serverOffsetMs, start, requestStop, startMutation.isPending]);

  return (
    <ActiveTimerContext.Provider value={value}>
      {children}
      {stopRequest && timer && (
        <TimerStopPopover
          key={timer.id}
          timer={timer}
          serverOffsetMs={serverOffsetMs}
          anchorEl={stopRequest.anchorEl}
          switching={!!stopRequest.then}
          busy={busy}
          error={stopError}
          onSave={(m) => { void handleSave(m); }}
          onDiscard={() => { void handleDiscard(); }}
          onKeepRunning={closePopover}
        />
      )}
    </ActiveTimerContext.Provider>
  );
};

export default ActiveTimerProvider;
