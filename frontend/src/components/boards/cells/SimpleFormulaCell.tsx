import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useUpdateColumn } from '../../../hooks/queries/useColumnQueries';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useAuth } from '../../../hooks/useAuth';
import { useFormulaRecording } from '../../../contexts/FormulaRecordingContext';
import { useBoardRender } from '../../../contexts/BoardRenderContext';
import { useForeignCellValues } from '../../../hooks/queries/useForeignCellValues';
import {
  convertLegacyToIdRefs,
  evaluateFormula,
  extractForeignRefs,
  formulaRefDomKey,
  makeRelativeIdFormula,
} from '../../../utils/formulaEngine';
import type { Item, Column, SimpleFormulaColumnSettings } from '../../../types';
import { calculateColumnWidth } from '../../../utils/columnWidths';
import { formatGroupedNumber } from '../../../utils/numberFormat';

interface Props { item: Item; column: Column }

const SimpleFormulaCellInner: React.FC<Props> = ({ item, column }) => {
  const { mutate: updateItem } = useUpdateItem();
  const { mutateAsync: updateColumn } = useUpdateColumn(item.boardId);
  const { push: pushUndo } = useUndo();
  const { user, selectedWorkspace } = useAuth();
  const orgId = selectedWorkspace?.orgId ?? (user as { orgId?: string } | null | undefined)?.orgId;
  const { begin, endSession, isRecording, insertRef, session } = useFormulaRecording();
  const { visibleItems, columns: boardColumns, groupsComplete } = useBoardRender();
  const colWidth = calculateColumnWidth(column.name, column.type);

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  const storedRaw = item.values[column.id];
  const storedValue: string | null = typeof storedRaw === 'string' ? storedRaw : null;
  const cellFormula: string = storedValue === null ? defaultFormula : storedValue;

  const homeBoardId = item.boardId;
  const rowIndex = visibleItems.findIndex((it) => it.id === item.id);

  const isOrigin = session?.origin.itemId === item.id && session?.origin.columnId === column.id;
  const isRecordingHere = isRecording && isOrigin && session?.phase === 'recording';
  const awaitingHere = isOrigin && session?.phase === 'awaiting-origin';

  const [pendingFormula, setPendingFormula] = useState<string | null>(null);
  const finishGuard = useRef(false);
  // Always-current session so the outside-click handler (whose effect only re-subscribes when
  // recording starts/stops) reads the latest draft, not the draft from when recording began.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Load cross-board values referenced by the saved formula so the result stays live.
  const foreignRefs = useMemo(
    () => extractForeignRefs(cellFormula, homeBoardId, groupsComplete),
    [cellFormula, homeBoardId, groupsComplete],
  );
  const { resolve: resolveForeign, isLoading: foreignLoading } = useForeignCellValues(foreignRefs, orgId);

  const formulaContext = useMemo(
    () => ({
      allItems: visibleItems,
      columns: boardColumns,
      currentRowIndex: rowIndex,
      homeBoardId,
      groupsComplete,
      resolveRef: (ref: Parameters<typeof resolveForeign>[0]) => resolveForeign(ref, item.id),
    }),
    [visibleItems, boardColumns, rowIndex, homeBoardId, groupsComplete, resolveForeign, item.id],
  );

  const { result, hasUnresolved } = useMemo(() => {
    if (!cellFormula) return { result: null as number | null, hasUnresolved: false };
    let missing = false;
    const v = evaluateFormula(cellFormula, {}, {
      ...formulaContext,
      onUnresolvedRef: () => { missing = true; },
    });
    return { result: v, hasUnresolved: missing };
  }, [cellFormula, formulaContext]);

  const formatNumber = (n: number) => {
    const isPercent = settings?.unit === '%';
    const displayValue = isPercent && settings?.percentAutoMultiply !== false ? n * 100 : n;
    const formatted = formatGroupedNumber(displayValue, 2);
    return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
  };

  const persistValue = (newValue: string | null) => {
    if (newValue !== storedValue) {
      pushUndo({
        label: `Changed "${column.name}" on "${item.name}"`,
        undo: () => updateItem({ id: item.id, patch: { values: { [column.id]: storedValue } } }),
      });
      updateItem({ id: item.id, patch: { values: { [column.id]: newValue } } });
    }
  };

  /** Turn the recorded draft into a stored value, matching the single-board commit semantics.
   *  When the column has no default yet, defer to the apply-to-all / just-this choice. */
  const commitDraft = (draft: string, forceScopeChoice = false) => {
    const trimmed = draft.trim();
    // Ask "all cells / just this cell" only the first time this column ever gets a formula
    // (no scope decision recorded yet), or when the user explicitly reopens the choice via the
    // recording bar's edit icon or the column's Formula Settings toggle. Once a scope is chosen
    // it's remembered on the column so the question never resurfaces on its own.
    const isFirstFormula = !settings?.applyScope;
    if (trimmed && (isFirstFormula || forceScopeChoice)) {
      setPendingFormula(trimmed);
      return;
    }
    let newValue: string | null;
    if (!trimmed) newValue = defaultFormula ? '' : null;
    else if (trimmed === defaultFormula.trim()) newValue = null;
    else newValue = trimmed;
    persistValue(newValue);
  };

  /** End the recording session and commit the current draft. Guarded against double-invocation. */
  const finish = () => {
    if (finishGuard.current) return;
    const draft = sessionRef.current?.draft ?? '';
    const forceScopeChoice = sessionRef.current?.chooseScopeOnSave ?? false;
    finishGuard.current = true;
    endSession();
    commitDraft(draft, forceScopeChoice);
  };

  const startRecording = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    finishGuard.current = false;
    // Convert legacy positional refs to stable IDs now, while this board's column/row order
    // is known (conversion is impossible once the user navigates away).
    const idFormula = convertLegacyToIdRefs(cellFormula, {
      boardId: homeBoardId,
      kind: 'b',
      columns: boardColumns,
      items: visibleItems,
    });
    begin(
      {
        boardId: homeBoardId,
        itemId: item.id,
        columnId: column.id,
        columnName: column.name,
        itemName: item.name,
        isPersonal: false,
      },
      idFormula,
    );
  };

  // Save pressed (here or on another board) → navigated back here → finish now that the origin
  // cell is mounted. Saving is explicit (Save button / Enter); clicking elsewhere never saves,
  // so the user can freely navigate to other boards to pick cells.
  useEffect(() => {
    if (awaitingHere) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingHere]);

  const hasOverride = storedValue !== null;
  const active = isRecordingHere || awaitingHere;

  const clearOverride = (e: React.MouseEvent) => {
    e.stopPropagation();
    persistValue(null);
  };

  const handleApplyToAll = async () => {
    if (pendingFormula === null) return;
    const relativeFormula = makeRelativeIdFormula(pendingFormula, homeBoardId);
    setPendingFormula(null);
    try {
      await updateColumn({ id: column.id, patch: { settings: { ...settings, defaultFormula: relativeFormula, applyScope: 'all' } } });
      persistValue(null);
    } catch {
      persistValue(pendingFormula);
    }
  };

  const handleApplyJustThis = async () => {
    if (pendingFormula === null) return;
    const formula = pendingFormula;
    setPendingFormula(null);
    persistValue(formula);
    if (settings?.applyScope !== 'perCell') {
      try {
        await updateColumn({ id: column.id, patch: { settings: { ...settings, applyScope: 'perCell' } } });
      } catch {
        // Non-fatal: the value still saved; the scope just won't be remembered this time.
      }
    }
  };

  // While another cell is recording, this formula cell (any cell except the recording origin)
  // is selectable — clicking inserts a reference to it, resolving to its live computed value.
  // Works same-board and cross-board: a cross-board formula reference is evaluated by the
  // foreign-value resolver, which loads the target board's items + columns and computes it.
  // Without this branch, a click would start a new recording session instead of feeding the current one.
  if (isRecording && !isOrigin) {
    return (
      <div
        role="gridcell"
        style={{ width: `${colWidth}px` }}
        className="flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 bg-gray-50/60 cursor-pointer hover:bg-indigo-100/60 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          insertRef({ kind: 'b', boardId: homeBoardId, columnId: column.id, itemId: item.id });
        }}
        title="Add this formula's value to the formula"
        aria-label={`Add ${column.name} for ${item.name} to the formula`}
        data-formula-insertable="true"
        data-formula-cell-key={formulaRefDomKey({ kind: 'b', boardId: homeBoardId, columnId: column.id, itemId: item.id })}
      >
        <span className="text-sm text-gray-600 px-3 text-center truncate">
          {result != null ? formatNumber(result) : <span className="text-gray-300 text-xs">—</span>}
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        role="gridcell"
        data-formula-origin={active ? 'true' : undefined}
        aria-label={`${column.name}: ${result != null ? formatNumber(result) : storedValue === '' ? 'empty' : 'no value'}`}
        style={{ width: `${colWidth}px` }}
        className={`relative flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 cursor-pointer group/formula ${
          active ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50' : 'bg-gray-50/60 hover:bg-indigo-50/30'
        }`}
        onClick={active ? undefined : startRecording}
        tabIndex={0}
        onKeyDown={(e) => { if (!active && (e.key === 'Enter' || e.key === ' ')) startRecording(e); }}
        title={active ? 'Recording — click cells on any board, then Save' : cellFormula ? '= (formula)' : 'Click to enter formula'}
      >
        <span className={`text-sm text-gray-600 px-3 text-center ${active ? 'whitespace-normal break-words leading-tight' : 'truncate'}`}>
          {active
            ? <span className="text-xs text-indigo-500 font-medium">Formula top row enabled <span className="text-sm">🠉</span></span>
            : hasUnresolved && foreignLoading
              ? <span className="text-gray-300 text-xs">…</span>
              : hasUnresolved
                ? <span className="text-amber-500 text-xs" title="A referenced cell is unavailable or no longer exists">#ref</span>
                : result != null
                  ? formatNumber(result)
                  : <span className="text-gray-300 text-xs">—</span>}
        </span>
        {hasOverride && !active && (
          <button
            type="button"
            onClick={clearOverride}
            className="absolute right-1 opacity-0 group-hover/formula:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
            aria-label={storedValue === '' ? `Restore default formula for ${column.name}` : `Reset ${column.name} to column default formula`}
            title={storedValue === '' ? 'Restore default formula' : 'Reset to column default formula'}
          >
            <FiX size={11} aria-hidden="true" />
          </button>
        )}
      </div>

      {pendingFormula !== null && ReactDOM.createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="formula-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 id="formula-modal-title" className="text-base font-semibold text-gray-800">
              Apply formula
            </h2>
            <p className="text-sm text-gray-600">
              Apply this formula to:
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleApplyToAll()}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                aria-label="Apply formula to all cells in this column"
              >
                All cells in this column
              </button>
              <button
                type="button"
                onClick={() => void handleApplyJustThis()}
                className="w-full px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                aria-label="Apply formula to just this cell"
              >
                Just this cell
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

const SimpleFormulaCell = React.memo(SimpleFormulaCellInner);
export default SimpleFormulaCell;
