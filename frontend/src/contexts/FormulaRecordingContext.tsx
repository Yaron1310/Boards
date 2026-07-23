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
  /** Index into `draft` where the next typed char / inserted ref / backspace applies. Lets the
   *  user navigate within the formula with arrow keys or a mouse click instead of always
   *  editing at the end. */
  cursor: number;
  /** Set when the user saved via the "choose where to apply" control — forces the origin cell
   *  to re-show the all-cells / just-this chooser even if it normally wouldn't. */
  chooseScopeOnSave?: boolean;
}

interface FormulaRecordingContextValue {
  isRecording: boolean;
  session: RecordingSession | null;
  /** Enter record mode for a formula cell (or replace an active session). */
  begin: (origin: RecordingOrigin, initialDraft: string) => void;
  /** Replace the working draft (bar/cell input typing). */
  setDraft: (draft: string) => void;
  /** Move the cursor to an explicit position (e.g. after a mouse click). Clamped to the draft's bounds. */
  setCursor: (cursor: number) => void;
  /** Insert a clicked cell's reference at the current cursor position. */
  insertRef: (ref: CellRef) => void;
  /** Discard the session without saving. */
  cancel: () => void;
  /** User pressed Save: switch to 'awaiting-origin' so the origin cell finishes on its board. */
  requestSave: () => void;
  /** Save, but force the origin cell to re-show the all-cells / just-this-cell scope chooser. */
  requestSaveWithScopeChoice: () => void;
  /** Called by the origin cell once it has committed (or the user cancelled the finish). */
  endSession: () => void;
}

/** Text immediately before the cursor completes an operand — a number, a ref token close `}`,
 *  or a closing paren — meaning a newly inserted value must be joined with an explicit `*`. */
const endsWithOperand = (before: string): boolean => /[0-9)}.]$/.test(before.trimEnd());

const REF_TOKEN_G = /\{ref:[^}]*\}/g;

/** Start/end offsets (in `draft`) of every `{ref:...}` token, so cursor movement, backspace and
 *  delete can treat a whole token as one atomic unit instead of stepping through its characters. */
function tokenRanges(draft: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  REF_TOKEN_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_TOKEN_G.exec(draft))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

const clampCursor = (cursor: number, len: number): number => Math.max(0, Math.min(cursor, len));

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
    setSession({ origin, draft: initialDraft, phase: 'recording', cursor: initialDraft.length });
  }, []);

  const setDraft = useCallback((draft: string) => {
    setSession((s) => (s ? { ...s, draft, cursor: clampCursor(s.cursor, draft.length) } : s));
  }, []);

  const setCursor = useCallback((cursor: number) => {
    setSession((s) => (s ? { ...s, cursor: clampCursor(cursor, s.draft.length) } : s));
  }, []);

  const insertRef = useCallback((ref: CellRef) => {
    setSession((s) => {
      if (!s) return s;
      // A ref placed right after another value auto-multiplies — {20} then {3} → {20}*{3}.
      const before = s.draft.slice(0, s.cursor);
      const after = s.draft.slice(s.cursor);
      const sep = endsWithOperand(before) ? '*' : '';
      const inserted = sep + serializeRef(ref);
      return { ...s, draft: before + inserted + after, cursor: before.length + inserted.length };
    });
  }, []);

  const cancel = useCallback(() => setSession(null), []);

  const requestSave = useCallback(() => {
    setSession((s) => (s ? { ...s, phase: 'awaiting-origin' } : s));
  }, []);

  const requestSaveWithScopeChoice = useCallback(() => {
    setSession((s) => (s ? { ...s, phase: 'awaiting-origin', chooseScopeOnSave: true } : s));
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
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSession((s) => {
          if (!s || s.cursor <= 0) return s;
          const tokenEndingHere = tokenRanges(s.draft).find(([, end]) => end === s.cursor);
          return { ...s, cursor: tokenEndingHere ? tokenEndingHere[0] : s.cursor - 1 };
        });
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSession((s) => {
          if (!s || s.cursor >= s.draft.length) return s;
          const tokenStartingHere = tokenRanges(s.draft).find(([start]) => start === s.cursor);
          return { ...s, cursor: tokenStartingHere ? tokenStartingHere[1] : s.cursor + 1 };
        });
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setSession((s) => (s ? { ...s, cursor: 0 } : s));
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setSession((s) => (s ? { ...s, cursor: s.draft.length } : s));
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setSession((s) => {
          if (!s || s.cursor <= 0) return s;
          const tokenEndingHere = tokenRanges(s.draft).find(([, end]) => end === s.cursor);
          const [start, end] = tokenEndingHere ?? [s.cursor - 1, s.cursor];
          return { ...s, draft: s.draft.slice(0, start) + s.draft.slice(end), cursor: start };
        });
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        setSession((s) => {
          if (!s || s.cursor >= s.draft.length) return s;
          const tokenStartingHere = tokenRanges(s.draft).find(([start]) => start === s.cursor);
          const [start, end] = tokenStartingHere ?? [s.cursor, s.cursor + 1];
          return { ...s, draft: s.draft.slice(0, start) + s.draft.slice(end), cursor: start };
        });
        return;
      }
      if (e.key.length === 1 && /[0-9.+\-*/()%\s]/.test(e.key)) {
        e.preventDefault();
        setSession((s) => {
          if (!s) return s;
          const before = s.draft.slice(0, s.cursor).trimEnd();
          const after = s.draft.slice(s.cursor);
          // Auto-insert `*` when a new value abuts a completed operand with no operator between:
          //  • a digit/`.` right after a ref `}` or `)` starts a NEW operand (a digit after a
          //    digit just continues the same number, so no `*` there);
          //  • a `(` right after any operand (number, `}`, `)`).
          let sep = '';
          if (/[0-9.]/.test(e.key)) { if (/[)}]$/.test(before)) sep = '*'; }
          else if (e.key === '(') { if (/[0-9)}.]$/.test(before)) sep = '*'; }
          const inserted = sep + e.key;
          return { ...s, draft: s.draft.slice(0, s.cursor) + inserted + after, cursor: s.cursor + inserted.length };
        });
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
      setCursor,
      insertRef,
      cancel,
      requestSave,
      requestSaveWithScopeChoice,
      endSession,
    }),
    [session, begin, setDraft, setCursor, insertRef, cancel, requestSave, requestSaveWithScopeChoice, endSession],
  );

  return <FormulaRecordingContext.Provider value={value}>{children}</FormulaRecordingContext.Provider>;
};
