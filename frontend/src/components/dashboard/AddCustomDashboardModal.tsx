import React, { useState, useId } from 'react';
import { useBoards } from '../../hooks/queries/useBoardQueries';
import { useGroups } from '../../hooks/queries/useGroupQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import {
  useCreateCustomDashboard,
  useUpdateCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import type {
  ChartType,
  AggregationFn,
  DashboardVisibility,
  CustomDashboard,
  CustomDashboardDataSource,
} from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataSourceRow extends CustomDashboardDataSource {
  _key: string;
}

interface Props {
  onClose: () => void;
  existing?: CustomDashboard;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_OPTIONS: { type: ChartType; label: string; icon: string; description: string }[] = [
  { type: 'pie',          label: 'Pie Chart',             icon: '🥧', description: 'Distribution as slices' },
  { type: 'bar_vertical', label: 'Vertical Bar',          icon: '📊', description: 'Columns side by side' },
  { type: 'bar_horizontal', label: 'Horizontal Bar',      icon: '📉', description: 'Rows side by side' },
  { type: 'radar',        label: 'Radar Chart',           icon: '🕸️', description: 'Multi-axis comparison' },
  { type: 'line',         label: 'Line Chart',            icon: '📈', description: 'Trend over data points' },
  { type: 'number',       label: 'Number',                icon: '#',  description: 'Single aggregated value' },
];

const AGGREGATION_OPTIONS: { fn: AggregationFn; label: string }[] = [
  { fn: 'COUNT',   label: 'Count items' },
  { fn: 'SUM',     label: 'Sum values' },
  { fn: 'AVERAGE', label: 'Average values' },
  { fn: 'MIN',     label: 'Minimum value' },
  { fn: 'MAX',     label: 'Maximum value' },
];

const DEFAULT_VISIBILITY: DashboardVisibility = 'admins_only';

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): DataSourceRow {
  return { _key: makeKey(), boardId: '', columnId: '', label: '' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const DataSourceRowEditor: React.FC<{
  row: DataSourceRow;
  index: number;
  onChange: (updated: DataSourceRow) => void;
  onRemove: () => void;
  canRemove: boolean;
}> = ({ row, index, onChange, onRemove, canRemove }) => {
  const { data: boards = [] } = useBoards(undefined, false);
  const { data: groups = [] } = useGroups(row.boardId, !!row.boardId);
  const { data: columns = [] } = useColumns(row.boardId, !!row.boardId);

  const handleBoardChange = (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    onChange({ ...row, boardId, groupId: undefined, columnId: '', label: board ? row.label || '' : '' });
  };

  const handleColumnChange = (columnId: string) => {
    const col = columns.find(c => c.id === columnId);
    onChange({ ...row, columnId, label: row.label || col?.name || '' });
  };

  const rowId = `ds-row-${row._key}`;

  return (
    <div
      className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end p-3 bg-gray-50 rounded-lg border border-gray-200"
      role="group"
      aria-label={`Data source ${index + 1}`}
    >
      {/* Board */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${rowId}-board`} className="text-xs font-medium text-gray-600">Board</label>
        <select
          id={`${rowId}-board`}
          value={row.boardId}
          onChange={e => handleBoardChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-required="true"
        >
          <option value="">Select board…</option>
          {boards.filter(b => !b.isArchived).map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Group (optional) */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${rowId}-group`} className="text-xs font-medium text-gray-600">Group (optional)</label>
        <select
          id={`${rowId}-group`}
          value={row.groupId ?? ''}
          onChange={e => onChange({ ...row, groupId: e.target.value || undefined })}
          disabled={!row.boardId}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Group filter for data source ${index + 1}`}
        >
          <option value="">Entire board</option>
          {groups.filter(g => !g.isArchived).map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Column */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${rowId}-col`} className="text-xs font-medium text-gray-600">Column</label>
        <select
          id={`${rowId}-col`}
          value={row.columnId}
          onChange={e => handleColumnChange(e.target.value)}
          disabled={!row.boardId}
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-required="true"
        >
          <option value="">Select column…</option>
          {columns.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${rowId}-label`} className="text-xs font-medium text-gray-600">Label</label>
        <input
          id={`${rowId}-label`}
          type="text"
          value={row.label}
          onChange={e => onChange({ ...row, label: e.target.value })}
          placeholder="Display name"
          className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-required="true"
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="mb-0.5 p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
        aria-label={`Remove data source ${index + 1}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

const AddCustomDashboardModal: React.FC<Props> = ({ onClose, existing }) => {
  const headingId = useId();
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [chartType, setChartType] = useState<ChartType>(existing?.chartType ?? 'bar_vertical');
  const [aggregation, setAggregation] = useState<AggregationFn>(existing?.aggregation ?? 'COUNT');
  const [visibility, setVisibility] = useState<DashboardVisibility>(existing?.visibility ?? DEFAULT_VISIBILITY);
  const [rows, setRows] = useState<DataSourceRow[]>(
    existing?.dataSources.length
      ? existing.dataSources.map(ds => ({ ...ds, _key: makeKey() }))
      : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateCustomDashboard();
  const updateMutation = useUpdateCustomDashboard();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const updateRow = (index: number, updated: DataSourceRow) => {
    setRows(prev => prev.map((r, i) => (i === index ? updated : r)));
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const validate = (): string | null => {
    if (!name.trim()) return 'Dashboard name is required.';
    for (const [i, row] of rows.entries()) {
      if (!row.boardId) return `Data source ${i + 1}: select a board.`;
      if (!row.columnId) return `Data source ${i + 1}: select a column.`;
      if (!row.label.trim()) return `Data source ${i + 1}: enter a label.`;
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);

    const dataSources: CustomDashboardDataSource[] = rows.map(({ _key: _k, ...ds }) => ds);
    const payload = { name: name.trim(), chartType, aggregation, dataSources, visibility };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: existing!.id, patch: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save dashboard.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id={headingId} className="text-lg font-semibold text-gray-800">
            {isEditing ? 'Edit Dashboard' : 'Add Custom Dashboard'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            aria-label="Close dialog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cd-name" className="text-sm font-medium text-gray-700">
              Dashboard name <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="cd-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Monthly Revenue by Team"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-required="true"
            />
          </div>

          {/* Visibility */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Visibility</legend>
            <div className="flex gap-4" role="radiogroup" aria-label="Dashboard visibility">
              {([
                { value: 'admins_only' as DashboardVisibility, label: 'Admins only', description: 'Only org admins can see this dashboard' },
                { value: 'all' as DashboardVisibility, label: 'All users', description: 'Everyone in the organization can see this' },
              ] as const).map(opt => (
                <label
                  key={opt.value}
                  className={`flex-1 flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    visibility === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="cd-visibility"
                    value={opt.value}
                    checked={visibility === opt.value}
                    onChange={() => setVisibility(opt.value)}
                    className="mt-0.5 accent-blue-600"
                    aria-label={opt.label}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-500">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Chart type */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Chart type</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Chart type">
              {CHART_OPTIONS.map(opt => (
                <label
                  key={opt.type}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    chartType === opt.type
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="cd-chartType"
                    value={opt.type}
                    checked={chartType === opt.type}
                    onChange={() => setChartType(opt.type)}
                    className="sr-only"
                    aria-label={opt.label}
                  />
                  <span className="text-xl" aria-hidden="true">{opt.icon}</span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate">{opt.label}</span>
                    <span className="text-xs text-gray-500 truncate">{opt.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Aggregation */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cd-aggregation" className="text-sm font-medium text-gray-700">Aggregation function</label>
            <select
              id="cd-aggregation"
              value={aggregation}
              onChange={e => setAggregation(e.target.value as AggregationFn)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AGGREGATION_OPTIONS.map(opt => (
                <option key={opt.fn} value={opt.fn}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Data sources */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">
              Data sources <span className="text-gray-400 font-normal">(at least one required)</span>
            </legend>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <DataSourceRowEditor
                  key={row._key}
                  row={row}
                  index={i}
                  onChange={updated => updateRow(i, updated)}
                  onRemove={() => removeRow(i)}
                  canRemove={rows.length > 1}
                />
              ))}
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors self-start"
                aria-label="Add another data source"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add data source
              </button>
            </div>
          </fieldset>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            aria-label={isEditing ? 'Save changes' : 'Create dashboard'}
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCustomDashboardModal;
