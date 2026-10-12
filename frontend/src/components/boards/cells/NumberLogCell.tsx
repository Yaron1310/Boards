import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiClock, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useFormulaRecording } from '../../../contexts/FormulaRecordingContext';
import { useBoardRender } from '../../../contexts/BoardRenderContext';
import { formulaRefDomKey } from '../../../utils/formulaEngine';
import { formatGroupedNumber, sanitizeNumberDraft } from '../../../utils/numberFormat';
import { formatHoursLogTimestamp } from '../../../utils/hoursLog';
import { numberLogEntries, numberLogValueAt } from '../../../utils/numberLog';
import type { Item, Column, NumberColumnSettings, NumberLogEntry } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const formatValue = (v: number, settings: NumberColumnSettings | undefined) => {
  const formatted = formatGroupedNumber(v, settings?.precision ?? 2);
  return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
};

// ---------------------------------------------------------------------------
// Popover: a box to enter a new value, then the full history (newest first).
// ---------------------------------------------------------------------------

/** A new value entered this soon after the previous one is probably a correction — ask whether
 *  it should replace that entry instead of adding a second one. */
const RECENT_LOG_WINDOW_MS = 2 * 60 * 1000;

type AddMode = 'add' | 'replace';

interface LogPopoverProps {
  anchorEl: HTMLElement | null;
  entries: NumberLogEntry[];
  settings: NumberColumnSettings | undefined;
  columnName: string;
  onAdd: (value: number, mode: AddMode) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

const LogPopover: React.FC<LogPopoverProps> = ({ anchorEl, entries, settings, columnName, onAdd, onRemove, onClose }) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [draft, setDraft] = useState('');
  // Value waiting on the "added less than 2 minutes ago" question.
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = 260;
    const h = Math.min(340, 100 + entries.length * 34);
    let top = r.bottom + 6;
    let left = r.left;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    setPos({ top, left });
  }, [anchorEl, entries.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc first dismisses the question, then the popover.
      if (pendingValue !== null) setPendingValue(null);
      else onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, pendingValue]);

  const parsed = draft === '' || draft === '-' || draft === '.' ? null : parseFloat(draft);
  const canAdd = parsed !== null && !isNaN(parsed);
  const submit = () => {
    if (!canAdd) return;
    const last = entries[entries.length - 1];
    if (last && Date.now() - Date.parse(last.loggedAt) < RECENT_LOG_WINDOW_MS) setPendingValue(parsed);
    else onAdd(parsed, 'add');
  };
  const answer = (mode: AddMode) => {
    if (pendingValue === null) return;
    const value = pendingValue;
    setPendingValue(null);
    onAdd(value, mode);
  };
  const newestFirst = [...entries].reverse();

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10002, width: 260, maxHeight: 340 }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`${columnName} history`}
    >
      <div className="p-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(sanitizeNumberDraft(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="New value"
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={`New value for ${columnName}`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40"
          aria-label="Add value"
        >
          <FiPlus size={13} aria-hidden="true" /> Add
        </button>
      </div>
      {newestFirst.length === 0 ? (
        <p className="px-3 py-3 text-xs text-gray-400 italic">No values yet.</p>
      ) : (
        <div className="overflow-y-auto py-1" role="list" aria-label="Value history">
          {newestFirst.map((entry, i) => (
            <div
              key={entry.id}
              role="listitem"
              className="group flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <span className={`flex-shrink-0 ${i === 0 ? 'font-semibold' : 'font-medium'}`}>{formatValue(entry.value, settings)}</span>
              <span className="text-gray-400 flex-shrink-0">|</span>
              <span className="text-gray-500 truncate flex-1">{formatHoursLogTimestamp(entry.loggedAt)}</span>
              <button
                type="button"
                onClick={() => onRemove(entry.id)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                aria-label={`Remove value ${formatValue(entry.value, settings)} entered ${formatHoursLogTimestamp(entry.loggedAt)}`}
              >
                <FiTrash2 size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Rendered inside the popover's element (fixed, full-screen) so clicking it doesn't
          count as an outside click that would close the popover underneath. */}
      {pendingValue !== null && (
        <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.stopPropagation()}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="number-log-recent-title"
            className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5"
          >
            <p id="number-log-recent-title" className="text-sm font-semibold text-gray-800">
              A log was added less than 2 minutes ago.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Add {formatValue(pendingValue, settings)} as a new log, or replace the previous log
              ({formatValue(entries[entries.length - 1].value, settings)}) with it?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingValue(null)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800"
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => answer('add')}
                className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50"
                aria-label="Add new log"
              >
                Add New Log
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => answer('replace')}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                aria-label="Replace previous log"
              >
                Replace Previous Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NumberLogCellInner: React.FC<Props> = ({ item, column }) => {
  const rawValue = (item.values[column.id] as NumberLogEntry[] | null | undefined) ?? [];
  const entries = numberLogEntries(rawValue);
  const settings = column.settings as NumberColumnSettings | undefined;
  const { asOf } = useBoardRender();
  const { mutate } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  const { isRecording, insertRef } = useFormulaRecording();
  const cellRef = useRef<HTMLDivElement | null>(null);

  // The value in effect now — or at the board date filter's "as of" moment when one is set.
  const shown = numberLogValueAt(rawValue, asOf);
  const asOfLabel = asOf !== undefined ? `Value as of ${formatHoursLogTimestamp(new Date(asOf).toISOString())}` : undefined;

  const display = (
    <span className="inline-flex items-center gap-1 justify-center max-w-full">
      {asOf !== undefined && <FiClock size={10} className="flex-shrink-0 text-indigo-400" aria-hidden="true" />}
      {shown !== null
        ? <span className="truncate">{formatValue(shown, settings)}</span>
        : <span className="text-gray-300 text-xs">—</span>}
    </span>
  );

  const commitEntries = (next: NumberLogEntry[], label: string) => {
    pushUndo({ label, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: rawValue } } }) });
    mutate({ id: item.id, patch: { values: { [column.id]: next } } });
  };

  // While any formula is recording, clicking inserts a reference to this cell.
  if (isRecording) {
    return (
      <CellWrapper column={column} isReadOnly>
        {() => (
          <div
            className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-100/60 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              insertRef({ kind: 'b', boardId: item.boardId, columnId: column.id, itemId: item.id });
            }}
            title="Add this cell to the formula"
            aria-label={`Add ${column.name} for ${item.name} to the formula`}
            data-formula-insertable="true"
            data-formula-cell-key={formulaRefDomKey({ kind: 'b', boardId: item.boardId, columnId: column.id, itemId: item.id })}
          >
            {display}
          </div>
        )}
      </CellWrapper>
    );
  }

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        const handleAdd = (value: number, mode: AddMode) => {
          const entry: NumberLogEntry = { id: crypto.randomUUID(), value, loggedAt: new Date().toISOString() };
          // 'replace' drops the newest entry (a quick correction) instead of keeping both.
          const previousId = mode === 'replace' ? entries[entries.length - 1]?.id : undefined;
          const kept = previousId ? rawValue.filter((e) => e.id !== previousId) : rawValue;
          commitEntries([...kept, entry], `Changed "${column.name}" on "${item.name}"`);
          stopEdit();
        };
        const handleRemove = (id: string) => {
          commitEntries(rawValue.filter((e) => e.id !== id), `Removed a value from "${column.name}" on "${item.name}"`);
        };
        return (
          <div ref={cellRef} className="w-full h-full flex items-center justify-center">
            <div
              className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center"
              title={asOfLabel}
              aria-label={`${column.name} for ${item.name}${asOfLabel ? `, ${asOfLabel.toLowerCase()}` : ''}`}
            >
              {display}
            </div>
            {isEditing && createPortal(
              <LogPopover
                anchorEl={cellRef.current}
                entries={entries}
                settings={settings}
                columnName={column.name}
                onAdd={handleAdd}
                onRemove={handleRemove}
                onClose={stopEdit}
              />,
              document.body,
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

const NumberLogCell = React.memo(NumberLogCellInner);
export default NumberLogCell;
