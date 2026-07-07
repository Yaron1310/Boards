import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiX } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { useForeignCellValues } from '../../hooks/queries/useForeignCellValues';
import { useFormulaRefMeta, type RefMeta } from '../../hooks/queries/useFormulaRefMeta';
import { evaluateFormula, extractRefs, parseRefToken, type CellRef } from '../../utils/formulaEngine';
import { formatGroupedNumber } from '../../utils/numberFormat';

const formatNumber = (n: number) => formatGroupedNumber(n, 2);

const REF_TOKEN_RE = /(\{ref:[^}]*\})/g;

const AGG_LABEL: Record<string, string> = {
  sum: 'Sum', avg: 'Average', median: 'Median', min: 'Min', max: 'Max', count: 'Count',
};

function metaToTooltip(meta: RefMeta | undefined): string {
  if (!meta) return 'Loading…';
  const board = meta.boardName ?? '—';
  const group = meta.groupName ?? '—';
  const root = meta.isPersonal ? (meta.userName ? `${meta.userName}’s Personal Hub` : 'Personal Hub') : null;
  const path = meta.agg
    ? `${board} › ${group} › ${AGG_LABEL[meta.agg] ?? meta.agg} of ${meta.columnName ?? '—'}`
    : `${board} › ${group} › ${meta.itemName ?? '—'} › ${meta.columnName ?? '—'}`;
  return root ? `${root} › ${path}` : path;
}

interface RefTokenProps {
  cellRef: CellRef;
  currentItemId: string | null;
  resolve: (ref: CellRef, currentItemId?: string | null) => number | null | undefined;
  resolveMeta: (ref: CellRef, currentItemId?: string | null) => RefMeta | undefined;
}

/** One resolved value inside the formula preview — hover shows a light-blue highlight
 *  plus an instant (no-delay) tooltip naming the value's source, since the native
 *  `title` attribute both has a delay and can't be styled. */
const RefToken: React.FC<RefTokenProps> = ({ cellRef, currentItemId, resolve, resolveMeta }) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

  const v = resolve(cellRef, currentItemId);
  const display = v === undefined ? '…' : v === null ? '0' : formatNumber(v);
  const tooltip = metaToTooltip(resolveMeta(cellRef, currentItemId));

  return (
    <>
      <span
        ref={spanRef}
        className="rounded px-0.5 -mx-0.5 hover:bg-blue-100 transition-colors"
        onMouseEnter={() => {
          const rect = spanRef.current?.getBoundingClientRect();
          if (rect) setHoverPos({ top: rect.top, left: rect.left + rect.width / 2 });
        }}
        onMouseLeave={() => setHoverPos(null)}
      >
        {display}
      </span>
      {hoverPos && ReactDOM.createPortal(
        <div
          className="fixed z-[9999] pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ top: hoverPos.top - 6, left: hoverPos.left }}
        >
          <div className="bg-gray-800 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap">
            {tooltip}
          </div>
          <div className="w-2 h-2 bg-gray-800 rotate-45 mx-auto -mt-1" />
        </div>,
        document.body,
      )}
    </>
  );
};

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
  const { resolveMeta } = useFormulaRefMeta(refs, currentItemId);

  // Split into literal text and {ref:...} tokens so each resolved value can be rendered as its
  // own hoverable element (a plain string replace, like before, can't attach per-value hover).
  const segments = useMemo(() => {
    return draft
      .split(REF_TOKEN_RE)
      .filter((part) => part !== '')
      .map((part, idx) => {
        const isToken = /^\{ref:[^}]*\}$/.test(part);
        const ref = isToken ? parseRefToken(part.slice(1, -1)) : null;
        return ref ? { key: idx, ref } : { key: idx, text: part };
      });
  }, [draft]);

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
      <div className="flex items-center gap-3 px-4 py-4">
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
          className="flex-1 min-w-0 flex items-center font-mono text-gray-800 bg-white/80 rounded px-2 py-1 ring-1 ring-inset ring-indigo-200 overflow-hidden"
          style={{ fontSize: '1rem', lineHeight: '2em' }}
          aria-label="Formula being recorded"
        >
          <span className="truncate">
            {segments.length === 0
              ? <span className="text-gray-400">Click cells on any board and type operators (+ − × ÷)…</span>
              : segments.map((seg) =>
                  seg.ref
                    ? <RefToken key={seg.key} cellRef={seg.ref} currentItemId={currentItemId} resolve={resolve} resolveMeta={resolveMeta} />
                    : <span key={seg.key}>{seg.text}</span>,
                )}
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
