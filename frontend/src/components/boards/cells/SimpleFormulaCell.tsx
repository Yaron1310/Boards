import React, { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { useColumns } from '../../../hooks/queries/useColumnQueries';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useFormulaEdit } from '../../../contexts/FormulaEditContext';
import { evaluateFormula } from '../../../utils/formulaEngine';
import { ColumnType } from '../../../types';
import type { Item, Column, SimpleFormulaColumnSettings } from '../../../types';
import { calculateColumnWidth } from '../../../utils/columnWidths';

interface Props { item: Item; column: Column }

const SimpleFormulaCell: React.FC<Props> = ({ item, column }) => {
  const { data: columns = [] } = useColumns(item.boardId);
  const { mutate: updateItem } = useUpdateItem();
  const { setInsertHandler } = useFormulaEdit();
  const colWidth = calculateColumnWidth(column.name, column.type);

  const settings = column.settings as SimpleFormulaColumnSettings;
  const defaultFormula: string = settings?.defaultFormula ?? '';

  // Per-cell formula override stored in item.values; fall back to column default
  const storedValue = item.values[column.id];
  const cellFormula: string =
    typeof storedValue === 'string' ? storedValue : defaultFormula;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(cellFormula);
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number>(0);

  // Keep draft in sync when item value changes externally
  useEffect(() => {
    if (!isEditing) setDraft(cellFormula);
  }, [cellFormula, isEditing]);

  // Build columnValues map: colName → numeric value from this item
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
    () => (isEditing ? evaluateFormula(draft, columnValues) : null),
    [isEditing, draft, columnValues],
  );

  const formatNumber = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2);

  const startEdit = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setDraft(cellFormula);
    setIsEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    const isDefault = trimmed === defaultFormula.trim();
    // Save null if identical to default (no override needed), else save override
    const newValue = isDefault ? null : trimmed || null;
    const current = typeof storedValue === 'string' ? storedValue : null;
    if (newValue !== current) {
      updateItem({ id: item.id, patch: { values: { [column.id]: newValue } } });
    }
    setInsertHandler(null);
    setIsEditing(false);
  };

  const discard = () => {
    setDraft(cellFormula);
    setInsertHandler(null);
    setIsEditing(false);
  };

  const clearOverride = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof storedValue === 'string') {
      updateItem({ id: item.id, patch: { values: { [column.id]: null } } });
    }
  };

  // Register insert handler so number cells can push column refs here
  useEffect(() => {
    if (!isEditing) return;
    setInsertHandler((colName: string) => {
      const input = inputRef.current;
      const pos = input ? (input.selectionStart ?? draft.length) : draft.length;
      const ref = `{${colName}}`;
      const next = draft.slice(0, pos) + ref + draft.slice(pos);
      setDraft(next);
      cursorRef.current = pos + ref.length;
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
        }
      });
    });
    return () => setInsertHandler(null);
  }, [isEditing, draft, setInsertHandler]);

  // Auto-focus input when edit starts
  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isEditing]);

  const hasOverride = typeof storedValue === 'string';
  const numberCols = columns.filter((c) => c.type === ColumnType.NUMBER);

  if (isEditing) {
    return (
      <div
        role="gridcell"
        aria-label={`${column.name} formula editor`}
        style={{ width: `${colWidth}px` }}
        className="relative flex flex-shrink-0 flex-col border-r border-[#d2d2d4] z-20 ring-1 ring-inset ring-indigo-400 bg-white"
      >
        {/* Formula input */}
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
            placeholder={defaultFormula || 'e.g. {Price} * {Qty}'}
            aria-label={`Formula for ${column.name}`}
            spellCheck={false}
          />
        </div>

        {/* Live preview */}
        <div className="px-2 pb-1 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">= </span>
          <span className={`text-[10px] font-medium ${previewResult != null ? 'text-indigo-600' : 'text-gray-300'}`}>
            {previewResult != null ? formatNumber(previewResult) : '…'}
          </span>
        </div>

        {/* Available column hints */}
        {numberCols.length > 0 && (
          <div className="px-2 pb-1.5 flex flex-wrap gap-1">
            {numberCols.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // don't blur the input
                  const input = inputRef.current;
                  const pos = input ? (input.selectionStart ?? draft.length) : draft.length;
                  const ref = `{${c.name}}`;
                  const next = draft.slice(0, pos) + ref + draft.slice(pos);
                  setDraft(next);
                  cursorRef.current = pos + ref.length;
                  requestAnimationFrame(() => {
                    if (inputRef.current) {
                      inputRef.current.focus();
                      inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
                    }
                  });
                }}
                className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded border border-indigo-200 hover:bg-indigo-100 transition-colors font-mono"
                aria-label={`Insert reference to ${c.name}`}
              >
                {`{${c.name}}`}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="gridcell"
      aria-label={`${column.name}: ${result != null ? formatNumber(result) : 'no value'}`}
      style={{ width: `${colWidth}px` }}
      className="relative flex flex-shrink-0 items-center justify-center border-r border-[#d2d2d4] last:border-r-0 bg-gray-50/60 hover:bg-indigo-50/30 cursor-pointer group/formula"
      onClick={startEdit}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') startEdit(e); }}
      title={cellFormula ? `= ${cellFormula}` : 'Click to enter formula'}
    >
      <span className="text-sm text-gray-600 truncate px-3 text-center">
        {result != null
          ? formatNumber(result)
          : <span className="text-gray-300 text-xs">—</span>}
      </span>
      {/* Clear override button — only shown when there's a per-cell override */}
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
  );
};

export default SimpleFormulaCell;
