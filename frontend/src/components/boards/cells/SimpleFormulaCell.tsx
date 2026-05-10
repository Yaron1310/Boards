import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useColumns, useUpdateColumn } from '../../../hooks/queries/useColumnQueries';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useFormulaEdit } from '../../../contexts/FormulaEditContext';
import { useBoardRender } from '../../../contexts/BoardRenderContext';
import { evaluateFormula } from '../../../utils/formulaEngine';
import { ColumnType } from '../../../types';
import type { Item, Column, SimpleFormulaColumnSettings } from '../../../types';
import { calculateColumnWidth } from '../../../utils/columnWidths';

interface Props { item: Item; column: Column }

function colIndexToLetter(colIndex: number): string {
  let letter = '';
  let n = colIndex;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

const SimpleFormulaCellInner: React.FC<Props> = ({ item, column }) => {
  const { data: columns = [] } = useColumns(item.boardId);
  const { mutate: updateItem } = useUpdateItem();
  const { mutateAsync: updateColumn } = useUpdateColumn(item.boardId);
  const { setInsertHandler } = useFormulaEdit();
  const { visibleItems, columns: boardColumns } = useBoardRender();
  const colWidth = calculateColumnWidth(column.name, column.type);

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  // Per-cell value semantics:
  const storedRaw = item.values[column.id];
  const storedValue: string | null =
    typeof storedRaw === 'string' ? storedRaw : null;

  const cellFormula: string =
    storedValue === null ? defaultFormula :
    storedValue;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(cellFormula);
  const [pendingFormula, setPendingFormula] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  // Calculate this cell's row number (1-based) and 0-based index
  const rowIndex = visibleItems.findIndex((it) => it.id === item.id);
  const rowNumber = rowIndex + 1;
  // Calculate this column's letter (B for first column, C for second, etc.; A is Name)
  const columnLetter = colIndexToLetter(boardColumns.findIndex((c) => c.id === column.id) + 2);

  /** Strip row numbers from cell refs so the formula is row-relative: {C3} → {C} */
  const makeRelativeFormula = (formula: string): string =>
    formula.replace(/\{([A-Za-z]+)\d+\}/g, (_, col: string) => `{${col.toUpperCase()}}`);

  const formulaContext = { allItems: visibleItems, columns: boardColumns, currentRowIndex: rowIndex };

  useEffect(() => {
    if (!isEditing) setDraft(cellFormula);
  }, [cellFormula, isEditing]);

  const columnValues = React.useMemo(() => {
    const map: Record<string, number | null | undefined> = {};
    for (const col of columns) {
      if (col.type === ColumnType.NUMBER) {
        const v = item.values[col.id];
        map[col.name] = v != null ? Number(v) : undefined;
      }
    }
    return map;
  }, [columns, item.values]);

  const result = React.useMemo(
    () => (cellFormula ? evaluateFormula(cellFormula, columnValues, formulaContext) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellFormula, columnValues, visibleItems, boardColumns, rowIndex],
  );

  const previewResult = React.useMemo(
    () => (isEditing ? evaluateFormula(draft, columnValues, formulaContext) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isEditing, draft, columnValues, visibleItems, boardColumns, rowIndex],
  );

  const formatNumber = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  const startEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setDraft(cellFormula);
    setIsEditing(true);
  };

  const persistValue = (newValue: string | null) => {
    if (newValue !== storedValue) {
      updateItem({ id: item.id, patch: { values: { [column.id]: newValue } } });
    }
  };

  const insertCellAddress = (cellAddress: string) => {
    const input = inputRef.current;
    const pos = input ? (input.selectionStart ?? draft.length) : draft.length;
    const cellRef = `{${cellAddress}}`;
    const next = draft.slice(0, pos) + cellRef + draft.slice(pos);
    setDraft(next);
    cursorRef.current = pos + cellRef.length;
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      }
    });
  };

  const commit = () => {
    const trimmed = draft.trim();
    setInsertHandler(null);
    setIsEditing(false);

    if (!defaultFormula && trimmed) {
      setPendingFormula(trimmed);
      return;
    }

    let newValue: string | null;
    if (!trimmed) {
      newValue = defaultFormula ? '' : null;
    } else if (trimmed === defaultFormula.trim()) {
      newValue = null;
    } else {
      newValue = trimmed;
    }

    persistValue(newValue);
  };

  const clearToEmpty = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setInsertHandler(null);
    setIsEditing(false);
    persistValue(defaultFormula ? '' : null);
  };

  const discard = () => {
    setDraft(cellFormula);
    setInsertHandler(null);
    setIsEditing(false);
  };

  const clearOverride = (e: React.MouseEvent) => {
    e.stopPropagation();
    persistValue(null);
  };

  useEffect(() => {
    if (!isEditing) return;
    setInsertHandler(insertCellAddress);
    return () => setInsertHandler(null);
  }, [isEditing, insertCellAddress, setInsertHandler]);

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const hasOverride = storedValue !== null;

  const handleApplyToAll = async () => {
    if (pendingFormula === null) return;
    // Strip row numbers so the default formula is row-relative: {C5} → {C}
    const relativeFormula = makeRelativeFormula(pendingFormula);
    setPendingFormula(null);
    try {
      await updateColumn({
        id: column.id,
        patch: { settings: { ...settings, defaultFormula: relativeFormula } },
      });
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

  const handleCancelModal = () => setPendingFormula(null);

  if (isEditing) {
    return (
      <div
        role="gridcell"
        aria-label={`${column.name} formula editor`}
        style={{ width: `${colWidth}px` }}
        className="relative flex flex-shrink-0 flex-col border-r border-[#d2d2d4] z-20 ring-1 ring-inset ring-indigo-400 bg-white"
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
            placeholder={defaultFormula || 'e.g. {B2} * {C2}'}
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
            <FiX size={11} aria-hidden="true" />
          </button>
        </div>

        <div className="px-2 pb-1 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">= </span>
          <span className={`text-[10px] font-medium ${previewResult != null ? 'text-indigo-600' : 'text-gray-300'}`}>
            {previewResult != null ? formatNumber(previewResult) : '…'}
          </span>
        </div>

        <div className="px-2 pb-1.5 text-[10px] text-gray-400">
          Click any number cell to insert its address (e.g., C3)
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        role="gridcell"
        aria-label={`${column.name}: ${result != null ? formatNumber(result) : storedValue === '' ? 'empty' : 'no value'}`}
        style={{ width: `${colWidth}px` }}
        className="relative flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 bg-gray-50/60 hover:bg-indigo-50/30 cursor-pointer group/formula"
        onClick={startEdit}
        data-cell-address={`${columnLetter}${rowNumber}`}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(e); }}
        title={cellFormula ? `= ${cellFormula}` : 'Click to enter formula'}
      >
        <span className="text-sm text-gray-600 truncate px-3 text-center">
          {result != null
            ? formatNumber(result)
            : <span className="text-gray-300 text-xs">—</span>}
        </span>
        {hasOverride && (
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
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="formula-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 id="formula-modal-title" className="text-base font-semibold text-gray-800">
              Apply formula
            </h2>
            <p className="text-sm text-gray-600">
              Apply{' '}
              <code className="bg-gray-100 rounded px-1 font-mono text-xs">
                = {pendingFormula}
              </code>{' '}
              to:
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
                onClick={handleCancelModal}
                className="w-full px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Cancel"
              >
                Cancel
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
