import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiX } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { useForeignCellValues } from '../../hooks/queries/useForeignCellValues';
import { evaluateFormula, extractRefs } from '../../utils/formulaEngine';

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Persistent, route-independent bar shown while a formula cell is recording. Lets the user see
 * and edit the formula, and finish from any board via Save — which navigates back to the origin
 * board so the origin cell can commit (and, when needed, show the apply-to-all/just-this choice).
 * Rendered inside the router so Save can navigate.
 */
const FormulaRecordingBar: React.FC = () => {
  const { session, setDraft, requestSave, cancel } = useFormulaRecording();
  const { user, selectedWorkspace } = useAuth();
  const navigate = useNavigate();
  const orgId = selectedWorkspace?.orgId ?? (user as { orgId?: string } | null | undefined)?.orgId;

  const draft = session?.draft ?? '';
  const refs = useMemo(() => extractRefs(draft), [draft]);
  const { resolve, isLoading } = useForeignCellValues(refs, orgId);

  const currentItemId = session?.origin.itemId ?? null;
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

  // Only visible while actively recording; during 'awaiting-origin' the origin cell takes over.
  if (!session || session.phase !== 'recording') return null;
  const { origin } = session;

  const handleSave = () => {
    requestSave();
    navigate(origin.isPersonal ? '/personal-hub' : `/boards/${origin.boardId}`);
  };

  return (
    <div
      role="region"
      aria-label="Formula recording"
      data-formula-bar="true"
      className="fixed top-0 inset-x-0 z-[60] border-b border-indigo-300 bg-indigo-50/95 backdrop-blur shadow-sm"
    >
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-indigo-500 font-semibold">
            Editing formula
          </span>
          <span className="text-xs text-indigo-700 truncate" title={`${origin.columnName} · ${origin.itemName}`}>
            {origin.columnName} · {origin.itemName}
          </span>
        </div>

        <span className="text-sm font-mono text-indigo-500 select-none">=</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
          }}
          className="flex-1 min-w-0 text-xs font-mono text-gray-800 bg-white/80 rounded px-2 py-1 outline-none ring-1 ring-inset ring-indigo-200 focus:ring-indigo-400"
          placeholder="Click number cells on any board, or type — e.g. add, subtract, * 2"
          aria-label="Formula being recorded"
          spellCheck={false}
        />

        <span className="text-xs text-gray-500 whitespace-nowrap">
          ={' '}
          <span className={preview != null ? 'text-indigo-600 font-medium' : 'text-gray-400'}>
            {preview != null ? formatNumber(preview) : isLoading ? '…' : '—'}
          </span>
        </span>

        <button
          type="button"
          onClick={handleSave}
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

      <p className="px-4 pb-1.5 text-[10px] text-indigo-400">
        Navigate to any board and click Number cells to add them. Values recalculate live.
      </p>
    </div>
  );
};

export default FormulaRecordingBar;
