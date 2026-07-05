import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiX } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { useForeignCellValues } from '../../hooks/queries/useForeignCellValues';
import { evaluateFormula, extractRefs, parseRefToken } from '../../utils/formulaEngine';

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Bar shown while a formula cell is recording. It lives inside the page's content column (not
 * over the sidebar) and persists across board navigation via the global recording context.
 * The formula is built by clicking cells and typing operators (captured globally by the
 * provider) — the display shows resolved values, never the underlying {ref:...} tokens.
 * Save navigates back to the origin board so the origin cell commits.
 */
const FormulaRecordingBar: React.FC = () => {
  const { session, requestSave, cancel } = useFormulaRecording();
  const { user, selectedWorkspace } = useAuth();
  const navigate = useNavigate();
  const orgId = selectedWorkspace?.orgId ?? (user as { orgId?: string } | null | undefined)?.orgId;

  const draft = session?.draft ?? '';
  const refs = useMemo(() => extractRefs(draft), [draft]);
  const { resolve, isLoading } = useForeignCellValues(refs, orgId);

  const currentItemId = session?.origin.itemId ?? null;

  // Human-readable formula: each {ref:...} token replaced by its resolved value.
  const pretty = useMemo(
    () =>
      draft.replace(/\{ref:[^}]*\}/g, (tok) => {
        const ref = parseRefToken(tok.slice(1, -1));
        if (!ref) return tok;
        const v = resolve(ref, currentItemId);
        if (v === undefined) return '…';
        if (v === null) return '0';
        return formatNumber(v);
      }),
    [draft, resolve, currentItemId],
  );

  const preview = useMemo(
    () =>
      session
        ? evaluateFormula(draft, {}, {
            allItems: [],
            columns: [],
            resolveRef: (ref) => resolve(ref, currentItemId),
          })
        : null,
    [session, draft, resolve, currentItemId],
  );

  // On save, navigate back to the origin so its cell can commit (and show the apply choice).
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!session) { navigatedRef.current = false; return; }
    if (session.phase === 'awaiting-origin' && !navigatedRef.current) {
      navigatedRef.current = true;
      navigate(session.origin.isPersonal ? '/personal-hub' : `/boards/${session.origin.boardId}`);
    }
  }, [session, navigate]);

  if (!session || session.phase !== 'recording') return null;
  const { origin } = session;

  return (
    <div
      role="region"
      aria-label="Formula recording"
      data-formula-bar="true"
      className="relative z-40 w-full border-b border-indigo-300 bg-indigo-50/95 shadow-sm"
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">
            Recording formula for
          </span>
          <span className="text-xs text-indigo-700 truncate" title={`Item "${origin.itemName}", column "${origin.columnName}"`}>
            “{origin.itemName}” · {origin.columnName}
          </span>
        </div>

        <span className="text-sm font-mono text-indigo-500 select-none">=</span>
        <div
          className="flex-1 min-w-0 flex items-center text-sm font-mono text-gray-800 bg-white/80 rounded px-2 py-1 ring-1 ring-inset ring-indigo-200 overflow-hidden"
          aria-label="Formula being recorded"
          title={pretty}
        >
          <span className="truncate">
            {pretty || <span className="text-gray-400">Click cells on any board and type operators (+ − × ÷)…</span>}
          </span>
          {/* Blinking caret signals the field is capturing input (digits/operators typed anywhere). */}
          <span className="inline-block w-[2px] h-4 bg-indigo-500 ml-0.5 flex-shrink-0 animate-pulse" aria-hidden="true" />
        </div>

        <span className="text-xs text-gray-500 whitespace-nowrap">
          ={' '}
          <span className={preview != null ? 'text-indigo-600 font-medium' : 'text-gray-400'}>
            {preview != null ? formatNumber(preview) : isLoading ? '…' : '—'}
          </span>
        </span>

        <button
          type="button"
          onClick={requestSave}
          className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
          aria-label="Save formula and return to its board"
        >
          <FiCheck size={13} aria-hidden="true" /> Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Cancel formula recording"
        >
          <FiX size={13} aria-hidden="true" /> Cancel
        </button>
      </div>
    </div>
  );
};

export default FormulaRecordingBar;
