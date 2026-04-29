import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiZap } from 'react-icons/fi';
import { useColumns } from '../../../hooks/queries/useColumnQueries';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { evaluateFormula } from '../../../utils/formulaEngine';
import { ColumnType } from '../../../types';
import type { Item, Column, SimpleFormulaColumnSettings } from '../../../types';
import { calculateColumnWidth } from '../../../utils/columnWidths';

interface Props { item: Item; column: Column }

const SimpleFormulaCell: React.FC<Props> = ({ item, column }) => {
  const { data: columns = [] } = useColumns(item.boardId);
  const { mutate: updateItem } = useUpdateItem();
  const colWidth = calculateColumnWidth(column.name, column.type);

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  const storedValue = item.values[column.id];
  const cellFormula: string =
    typeof storedValue === 'string' ? storedValue : defaultFormula;

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(cellFormula);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  useEffect(() => {
    if (!modalOpen) setDraft(cellFormula);
  }, [cellFormula, modalOpen]);

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
    () => evaluateFormula(cellFormula, columnValues),
    [cellFormula, columnValues],
  );

  const previewResult = React.useMemo(
    () => (modalOpen ? evaluateFormula(draft, columnValues) : null),
    [modalOpen, draft, columnValues],
  );

  const formatNumber = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  const openModal = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setDraft(cellFormula);
    setModalOpen(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    const isDefault = trimmed === defaultFormula.trim();
    const newValue = isDefault ? null : trimmed || null;
    const current = typeof storedValue === 'string' ? storedValue : null;
    if (newValue !== current) {
      updateItem({ id: item.id, patch: { values: { [column.id]: newValue } } });
    }
    setModalOpen(false);
  };

  const discard = () => {
    setDraft(cellFormula);
    setModalOpen(false);
  };

  const clearOverride = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof storedValue === 'string') {
      updateItem({ id: item.id, patch: { values: { [column.id]: null } } });
    }
  };

  const insertRef = (colName: string) => {
    const input = inputRef.current;
    const pos = input ? (input.selectionStart ?? draft.length) : draft.length;
    const ref = `{${colName}}`;
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
    if (modalOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [modalOpen]);

  const hasOverride = typeof storedValue === 'string';
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);
  const modalRoot = document.getElementById('modal-root');

  return (
    <>
      {/* Cell — shows computed result */}
      <div
        role="gridcell"
        aria-label={`${column.name}: ${result != null ? formatNumber(result) : 'no value'}`}
        style={{ width: `${colWidth}px` }}
        className="relative flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 bg-gray-50/60 hover:bg-indigo-50/30 cursor-pointer group/formula"
        onClick={openModal}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModal(e); }}
        title={cellFormula ? `= ${cellFormula}` : 'Click to edit formula'}
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
            aria-label={`Clear formula override for ${column.name}`}
            title="Reset to column default formula"
          >
            <FiX size={11} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Modal */}
      {modalOpen && modalRoot && ReactDOM.createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="formula-modal-title"
          onKeyDown={(e) => { if (e.key === 'Escape') discard(); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <FiZap className="text-yellow-600" size={14} aria-hidden="true" />
                </div>
                <div>
                  <h2 id="formula-modal-title" className="text-sm font-semibold text-gray-800">
                    {column.name}
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    {hasOverride ? 'Cell override' : 'Using column default'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={discard}
                className="text-gray-400 hover:text-gray-600 transition-colors rounded p-1"
                aria-label="Close"
              >
                <FiX size={15} aria-hidden="true" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Formula input */}
              <div>
                <label htmlFor="formula-cell-input" className="block text-xs font-medium text-gray-600 mb-1.5">
                  Formula
                </label>
                <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
                  <span className="text-sm font-mono text-indigo-500 select-none flex-shrink-0">=</span>
                  <input
                    id="formula-cell-input"
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commit(); }
                    }}
                    className="flex-1 text-sm font-mono text-gray-800 bg-transparent outline-none"
                    placeholder={defaultFormula || 'e.g. {Price} * {Qty}'}
                    aria-label={`Formula for ${column.name}`}
                    spellCheck={false}
                  />
                </div>
                {defaultFormula && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Column default: <code className="font-mono">{defaultFormula}</code>
                  </p>
                )}
              </div>

              {/* Live preview */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-400 font-mono">=</span>
                <span className={`text-sm font-semibold ${previewResult != null ? 'text-indigo-600' : 'text-gray-300'}`}>
                  {previewResult != null ? formatNumber(previewResult) : '…'}
                </span>
                {draft.trim() !== '' && previewResult === null && (
                  <span className="text-xs text-amber-600 ml-auto">Invalid formula</span>
                )}
              </div>

              {/* Column reference buttons */}
              {numberCols.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Insert column:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {numberCols.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); insertRef(c.name); }}
                        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded border border-indigo-200 hover:bg-indigo-100 transition-colors font-mono"
                        aria-label={`Insert reference to ${c.name}`}
                      >
                        {`{${c.name}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Syntax hint */}
              <p className="text-[11px] text-gray-400">
                Supports <code className="bg-gray-100 px-1 rounded">+</code> <code className="bg-gray-100 px-1 rounded">-</code> <code className="bg-gray-100 px-1 rounded">*</code> <code className="bg-gray-100 px-1 rounded">/</code> and parentheses.
                Use <code className="bg-gray-100 px-1 rounded font-mono">{'{ColumnName}'}</code> to reference a number column.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div>
                {hasOverride && (
                  <button
                    type="button"
                    onClick={(e) => { clearOverride(e); setModalOpen(false); }}
                    className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                    aria-label="Reset to column default formula"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={discard}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commit}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>,
        modalRoot,
      )}
    </>
  );
};

export default SimpleFormulaCell;
