import React, { useEffect, useRef, useState } from 'react';
import { useUpdatePersonalItemValue, useUpdatePersonalColumn } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useFormulaEdit } from '../../../contexts/FormulaEditContext';
import { evaluateFormula } from '../../../utils/formulaEngine';
import { ColumnType } from '../../../types';
import type { PersonalColumn, SimpleFormulaColumnSettings } from '../../../types';
import type { PersonalCellProps } from './types';

interface Props extends PersonalCellProps {
  siblingColumns: PersonalColumn[];
  itemValues: Record<string, unknown>;
}

/**
 * Same UX as the real board's Simple Formula cell (click to type a formula,
 * live preview, "apply to all cells" vs "just this cell"), but references
 * are resolved by column NAME — {Hours} * {Rate} — against sibling personal
 * columns on this same item, instead of {B2}-style board-grid addressing.
 * evaluateFormula already supports name-keyed lookups for exactly this case.
 */
const PersonalFormulaCell: React.FC<Props> = ({ column, itemId, itemName, value, editable, siblingColumns, itemValues }) => {
  const { mutate: mutateItemValue } = useUpdatePersonalItemValue();
  const { mutateAsync: updateColumn } = useUpdatePersonalColumn();
  const { push: pushUndo } = useUndo();
  const { setInsertHandler } = useFormulaEdit();

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  const storedValue: string | null = typeof value === 'string' ? value : null;
  const cellFormula: string = storedValue === null ? defaultFormula : storedValue;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(cellFormula);
  const [pendingFormula, setPendingFormula] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  useEffect(() => { if (!isEditing) setDraft(cellFormula); }, [cellFormula, isEditing]);

  const insertColumnName = (name: string) => {
    const input = inputRef.current;
    const pos = input ? (input.selectionStart ?? draft.length) : draft.length;
    const ref = `{${name}}`;
    const next = draft.slice(0, pos) + ref + draft.slice(pos);
    setDraft(next);
    cursorRef.current = pos + ref.length;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      }
    });
  };

  useEffect(() => {
    if (!isEditing) return;
    setInsertHandler(insertColumnName);
    return () => setInsertHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, setInsertHandler]);

  const columnValues = React.useMemo(() => {
    const map: Record<string, number | null | undefined> = {};
    for (const col of siblingColumns) {
      if (col.id === column.id || col.type !== ColumnType.NUMBER) continue;
      const v = itemValues[col.id];
      map[col.name] = v != null ? Number(v) : undefined;
    }
    return map;
  }, [siblingColumns, itemValues, column.id]);

  const result = React.useMemo(() => (cellFormula ? evaluateFormula(cellFormula, columnValues) : null), [cellFormula, columnValues]);
  const previewResult = React.useMemo(() => (isEditing ? evaluateFormula(draft, columnValues) : null), [isEditing, draft, columnValues]);

  const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  const startEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!editable) return;
    e.stopPropagation();
    setDraft(cellFormula);
    setIsEditing(true);
  };

  const persistValue = (newValue: string | null) => {
    if (newValue !== storedValue) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutateItemValue({ itemId, columnId: column.id, value: storedValue }) });
      mutateItemValue({ itemId, columnId: column.id, value: newValue });
    }
  };

  const commit = () => {
    const trimmed = draft.trim();
    setIsEditing(false);

    if (!defaultFormula && trimmed) {
      setPendingFormula(trimmed);
      return;
    }

    let newValue: string | null;
    if (!trimmed) newValue = defaultFormula ? '' : null;
    else if (trimmed === defaultFormula.trim()) newValue = null;
    else newValue = trimmed;

    persistValue(newValue);
  };

  const clearToEmpty = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditing(false);
    persistValue(defaultFormula ? '' : null);
  };

  const discard = () => { setDraft(cellFormula); setIsEditing(false); };
  const clearOverride = (e: React.MouseEvent) => { e.stopPropagation(); persistValue(null); };

  useEffect(() => {
    if (isEditing) requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
  }, [isEditing]);

  const hasOverride = storedValue !== null;

  const handleApplyToAll = async () => {
    if (pendingFormula === null) return;
    setPendingFormula(null);
    try {
      await updateColumn({ id: column.id, patch: { settings: { ...settings, defaultFormula: pendingFormula } } });
      persistValue(null);
    } catch {
      persistValue(pendingFormula);
    }
  };

  const handleApplyJustThis = () => {
    if (pendingFormula === null) return;
    persistValue(pendingFormula);
    setPendingFormula(null);
  };

  if (isEditing) {
    return (
      <div
        role="gridcell"
        aria-label={`${column.name} formula editor`}
        className="relative flex flex-shrink-0 flex-col w-full border-r border-[#d2d2d4] z-20 ring-1 ring-inset ring-indigo-400 bg-white"
      >
        <div className="flex items-center px-2 py-1 gap-1">
          <span className="text-xs font-mono text-indigo-500 select-none">=</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); discard(); }
            }}
            className="flex-1 text-xs font-mono text-gray-800 bg-transparent outline-none min-w-0"
            placeholder={defaultFormula || 'e.g. {Hours} * {Rate}'}
            aria-label={`Formula for ${column.name}`}
            spellCheck={false}
          />
          <button
            type="button"
            onMouseDown={clearToEmpty}
            className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors"
            title="Clear formula (make cell empty)"
            aria-label="Clear formula and make cell empty"
          >
            ×
          </button>
        </div>
        <div className="px-2 pb-1 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">= </span>
          <span className={`text-[10px] font-medium ${previewResult != null ? 'text-indigo-600' : 'text-gray-300'}`}>
            {previewResult != null ? formatNumber(previewResult) : '…'}
          </span>
        </div>
        <div className="px-2 pb-1.5 text-[10px] text-gray-400">
          Click any Number cell in this row to insert it
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        role="gridcell"
        aria-label={`${column.name}: ${result != null ? formatNumber(result) : storedValue === '' ? 'empty' : 'no value'}`}
        className={`relative flex flex-shrink-0 items-center justify-center w-full border-r border-[#d2d2d4] last:border-r-0 bg-gray-50/60 group/formula ${editable ? 'hover:bg-indigo-50/30 cursor-pointer' : ''}`}
        onClick={startEdit}
        tabIndex={editable ? 0 : -1}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(e); }}
        title={cellFormula ? `= ${cellFormula}` : 'Click to enter formula'}
      >
        <span className="text-sm text-gray-600 truncate px-3 text-center">
          {result != null ? formatNumber(result) : <span className="text-gray-300 text-xs">—</span>}
        </span>
        {hasOverride && editable && (
          <button
            type="button"
            onClick={clearOverride}
            className="absolute right-1 opacity-0 group-hover/formula:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
            aria-label={storedValue === '' ? `Restore default formula for ${column.name}` : `Reset ${column.name} to column default formula`}
            title={storedValue === '' ? 'Restore default formula' : 'Reset to column default formula'}
          >
            ×
          </button>
        )}
      </div>

      {pendingFormula !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="personal-formula-modal-title">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 id="personal-formula-modal-title" className="text-base font-semibold text-gray-800">Apply formula</h2>
            <p className="text-sm text-gray-600">
              Apply <code className="bg-gray-100 rounded px-1 font-mono text-xs">= {pendingFormula}</code> to:
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
                onClick={handleApplyJustThis}
                className="w-full px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                aria-label="Apply formula to just this cell"
              >
                Just this cell
              </button>
              <button
                type="button"
                onClick={() => setPendingFormula(null)}
                className="w-full px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(PersonalFormulaCell);
