import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useUpdatePersonalItemValue, useUpdatePersonalColumn } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useAuth } from '../../../hooks/useAuth';
import { useFormulaRecording } from '../../../contexts/FormulaRecordingContext';
import { useForeignCellValues } from '../../../hooks/queries/useForeignCellValues';
import {
  convertLegacyToIdRefs,
  evaluateFormula,
  extractForeignRefs,
  makeRelativeIdFormula,
  type FormulaRow,
} from '../../../utils/formulaEngine';
import type { SimpleFormulaColumnSettings } from '../../../types';
import type { PersonalCellProps, PersonalGridContext } from './types';
import { formatGroupedNumber } from '../../../utils/numberFormat';

interface Props extends PersonalCellProps {
  gridContext: PersonalGridContext;
}

/**
 * Personal Hub formula cell. Same cross-board recording flow as the real board's
 * SimpleFormulaCell: clicking enters record mode (a global session shown in the sticky bar),
 * cells on any board can be clicked to add references, and Save returns here to commit.
 * Personal-hub values are stored via personalItemValues; references to them use kind 'p'.
 */
const PersonalFormulaCell: React.FC<Props> = ({ column, itemId, itemName, value, editable, gridContext, userId }) => {
  const { mutate: mutateItemValue } = useUpdatePersonalItemValue(userId);
  const { mutateAsync: updateColumn } = useUpdatePersonalColumn(userId);
  const { push: pushUndo } = useUndo();
  const { user, selectedWorkspace } = useAuth();
  const orgId = selectedWorkspace?.orgId ?? (user as { orgId?: string } | null | undefined)?.orgId;
  const { begin, endSession, isRecording, session } = useFormulaRecording();

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  const storedValue: string | null = typeof value === 'string' ? value : null;
  const cellFormula: string = storedValue === null ? defaultFormula : storedValue;

  const homeBoardId = gridContext.boardId ?? '';
  const rowIndex = gridContext.rowOrder.indexOf(itemId);

  const isOrigin = session?.origin.itemId === itemId && session?.origin.columnId === column.id;
  const isRecordingHere = isRecording && isOrigin && session?.phase === 'recording';
  const awaitingHere = isOrigin && session?.phase === 'awaiting-origin';

  const [pendingFormula, setPendingFormula] = useState<string | null>(null);
  const finishGuard = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const allItems: FormulaRow[] = useMemo(
    () => gridContext.rowOrder.map((id) => ({ id, values: gridContext.valuesByItem[id] ?? {} })),
    [gridContext],
  );

  const foreignRefs = useMemo(
    () => extractForeignRefs(cellFormula, homeBoardId),
    [cellFormula, homeBoardId],
  );
  const { resolve: resolveForeign, isLoading: foreignLoading } = useForeignCellValues(foreignRefs, orgId);

  const formulaContext = useMemo(
    () => ({
      allItems,
      columns: gridContext.columns,
      currentRowIndex: rowIndex >= 0 ? rowIndex : undefined,
      homeBoardId,
      resolveRef: (ref: Parameters<typeof resolveForeign>[0]) => resolveForeign(ref, itemId),
    }),
    [allItems, gridContext.columns, rowIndex, homeBoardId, resolveForeign, itemId],
  );

  const { result, hasUnresolved } = useMemo(() => {
    if (!cellFormula) return { result: null as number | null, hasUnresolved: false };
    let missing = false;
    const v = evaluateFormula(cellFormula, {}, { ...formulaContext, onUnresolvedRef: () => { missing = true; } });
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
        label: `Changed "${column.name}" on "${itemName}"`,
        undo: () => mutateItemValue({ itemId, columnId: column.id, value: storedValue }),
      });
      mutateItemValue({ itemId, columnId: column.id, value: newValue });
    }
  };

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

  const finish = () => {
    if (finishGuard.current) return;
    const draft = sessionRef.current?.draft ?? '';
    const forceScopeChoice = sessionRef.current?.chooseScopeOnSave ?? false;
    finishGuard.current = true;
    endSession();
    commitDraft(draft, forceScopeChoice);
  };

  const startRecording = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!editable) return;
    e.stopPropagation();
    finishGuard.current = false;
    const idFormula = convertLegacyToIdRefs(cellFormula, {
      boardId: homeBoardId,
      kind: 'p',
      columns: gridContext.columns,
      items: gridContext.rowOrder.map((id) => ({ id })),
    });
    begin(
      {
        boardId: homeBoardId,
        itemId,
        columnId: column.id,
        columnName: column.name,
        itemName,
        isPersonal: true,
      },
      idFormula,
    );
  };

  // Saving is explicit (Save button / Enter). Navigated back here after Save → finish.
  useEffect(() => {
    if (awaitingHere) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingHere]);

  const hasOverride = storedValue !== null;
  const active = isRecordingHere || awaitingHere;

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

  return (
    <>
      <div
        role="gridcell"
        data-formula-origin={active ? 'true' : undefined}
        aria-label={`${column.name}: ${result != null && !hasUnresolved ? formatNumber(result) : storedValue === '' ? 'empty' : 'no value'}`}
        className={`relative flex flex-shrink-0 items-center justify-center w-full border-r border-[#d2d2d4] last:border-r-0 group/formula ${
          active ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50' : `bg-gray-50/60 ${editable ? 'hover:bg-indigo-50/30 cursor-pointer' : ''}`
        }`}
        onClick={active ? undefined : startRecording}
        tabIndex={editable ? 0 : -1}
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
        {hasOverride && editable && !active && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); persistValue(null); }}
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
          aria-labelledby="personal-formula-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 id="personal-formula-modal-title" className="text-base font-semibold text-gray-800">Apply formula</h2>
            <p className="text-sm text-gray-600">Apply this formula to:</p>
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

export default React.memo(PersonalFormulaCell);
