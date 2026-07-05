import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { serializeRef, type CellRef } from '../utils/formulaEngine';

/** Identity of the formula cell being recorded. Kept in a route-independent context so the
 *  session survives navigation to other boards while the user picks cells. */
export interface RecordingOrigin {
  boardId: string;
  itemId: string;
  columnId: string;
  columnName: string;
  itemName: string;
  /** True when the formula lives on a Personal Hub column. */
  isPersonal: boolean;
}

/**
 * 'recording'      — user is building the formula, possibly on another board.
 * 'awaiting-origin' — user pressed Save; we navigate back to the origin board and the origin
 *                     cell finishes (commits, or shows the apply-to-all/just-this choice).
 */
export type RecordingPhase = 'recording' | 'awaiting-origin';

export interface RecordingSession {
  origin: RecordingOrigin;
  draft: string;
  phase: RecordingPhase;
}

interface FormulaRecordingContextValue {
  isRecording: boolean;
  session: RecordingSession | null;
  /** Enter record mode for a formula cell (or replace an active session). */
  begin: (origin: RecordingOrigin, initialDraft: string) => void;
  /** Replace the working draft (bar/cell input typing). */
  setDraft: (draft: string) => void;
  /** Append a clicked cell's reference to the draft. */
  insertRef: (ref: CellRef) => void;
  /** Discard the session without saving. */
  cancel: () => void;
  /** User pressed Save: switch to 'awaiting-origin' so the origin cell finishes on its board. */
  requestSave: () => void;
  /** Called by the origin cell once it has committed (or the user cancelled the finish). */
  endSession: () => void;
}

const FormulaRecordingContext = createContext<FormulaRecordingContextValue | null>(null);

export const useFormulaRecording = (): FormulaRecordingContextValue => {
  const ctx = useContext(FormulaRecordingContext);
  if (!ctx) throw new Error('useFormulaRecording must be used within a FormulaRecordingProvider');
  return ctx;
};

export const FormulaRecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<RecordingSession | null>(null);

  const endSession = useCallback(() => setSession(null), []);

  const begin = useCallback((origin: RecordingOrigin, initialDraft: string) => {
    setSession({ origin, draft: initialDraft, phase: 'recording' });
  }, []);

  const setDraft = useCallback((draft: string) => {
    setSession((s) => (s ? { ...s, draft } : s));
  }, []);

  const insertRef = useCallback((ref: CellRef) => {
    setSession((s) => (s ? { ...s, draft: s.draft + serializeRef(ref) } : s));
  }, []);

  const cancel = useCallback(() => setSession(null), []);

  const requestSave = useCallback(() => {
    setSession((s) => (s ? { ...s, phase: 'awaiting-origin' } : s));
  }, []);

  // Global keyboard while recording: Esc cancels; Enter saves; digits/operators/parens build the
  // formula from anywhere (no need to focus a field); Backspace deletes the last token or char.
  // Ignored when the user is typing into a real input/textarea/select so normal typing still works.
  useEffect(() => {
    if (!session) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSession(null); return; }
      if (session.phase !== 'recording') return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        setSession((s) => (s ? { ...s, phase: 'awaiting-origin' } : s));
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setSession((s) => {
          if (!s) return s;
          const d = s.draft;
          if (d.endsWith('}')) {
            const i = d.lastIndexOf('{');
            return { ...s, draft: i >= 0 ? d.slice(0, i) : d.slice(0, -1) };
          }
          return { ...s, draft: d.slice(0, -1) };
        });
        return;
      }
      if (e.key.length === 1 && /[0-9.+\-*/()%\s]/.test(e.key)) {
        e.preventDefault();
        setSession((s) => (s ? { ...s, draft: s.draft + e.key } : s));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session]);

  const value = useMemo<FormulaRecordingContextValue>(
    () => ({
      isRecording: session !== null,
      session,
      begin,
      setDraft,
      insertRef,
      cancel,
      requestSave,
      endSession,
    }),
    [session, begin, setDraft, insertRef, cancel, requestSave, endSession],
  );

  return <FormulaRecordingContext.Provider value={value}>{children}</FormulaRecordingContext.Provider>;
};
