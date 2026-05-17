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
  MetricAggregation,
  YAxisAggregation,
  TimeAxisGrouping,
  DashboardVisibility,
  DateFormat,
  CustomDashboard,
  MetricConfig,
  CategoryConfig,
  TimeSeriesConfig,
  LineSeriesConfig,
  MetricEntry,
} from '../../types';
import { ITEM_NAME_COLUMN_ID } from '../../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_ICON = (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
    <path d="M12 2a10 10 0 1 0 10 10H12V2z" fill="#6366f1" opacity="0.85" />
    <path d="M14 2.25A10 10 0 0 1 22 10h-8V2.25z" fill="#22c55e" opacity="0.85" />
  </svg>
);

const BAR_H_ICON = (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
    <rect x="2" y="4"  width="14" height="4" rx="1" fill="#6366f1" opacity="0.85" />
    <rect x="2" y="10" width="10" height="4" rx="1" fill="#6366f1" opacity="0.7" />
    <rect x="2" y="16" width="17" height="4" rx="1" fill="#6366f1" opacity="0.55" />
  </svg>
);

const CHART_OPTIONS: { type: ChartType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'pie',            label: 'Pie Chart',       icon: PIE_ICON,    description: 'Distribution as slices' },
  { type: 'bar_vertical',   label: 'Vertical Bar',    icon: '📊',        description: 'Columns side by side' },
  { type: 'bar_horizontal', label: 'Horizontal Bar',  icon: BAR_H_ICON,  description: 'Values as horizontal bars' },
  { type: 'radar',          label: 'Radar Chart',     icon: '🕸️',        description: 'Multi-axis comparison' },
  { type: 'line',           label: 'Line Chart',      icon: '📈',        description: 'Trend over time' },
  { type: 'number',         label: 'Number',          icon: '#',         description: 'Single aggregated value' },
];

const METRIC_AGG_OPTIONS: { fn: MetricAggregation; label: string }[] = [
  { fn: 'COUNT',   label: 'Count items' },
  { fn: 'SUM',     label: 'Sum values' },
  { fn: 'AVERAGE', label: 'Average values' },
  { fn: 'MIN',     label: 'Minimum value' },
  { fn: 'MAX',     label: 'Maximum value' },
];

const Y_AGG_OPTIONS: { fn: YAxisAggregation; label: string }[] = [
  { fn: 'COUNT',   label: 'Count items' },
  { fn: 'SUM',     label: 'Sum values' },
  { fn: 'AVERAGE', label: 'Average values' },
];

const GROUPING_OPTIONS: { value: TimeAxisGrouping; label: string }[] = [
  { value: 'day',   label: 'Day' },
  { value: 'week',  label: 'Week' },
  { value: 'month', label: 'Month' },
];

const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto-detect',   desc: 'Infers dd/mm vs mm/dd from context; prefers dd/mm when ambiguous' },
  { value: 'dmy',  label: 'DD/MM/YYYY',    desc: 'Day first (European)' },
  { value: 'mdy',  label: 'MM/DD/YYYY',    desc: 'Month first (US)' },
];

function configModeFor(ct: ChartType): 'metric' | 'category' | 'timeseries' {
  if (ct === 'line') return 'timeseries';
  if (ct === 'number') return 'metric';
  return 'category'; // pie, bar_vertical, bar_horizontal, radar
}

function makeKey() { return Math.random().toString(36).slice(2); }

// ---------------------------------------------------------------------------
// ChartTooltip
// ---------------------------------------------------------------------------

const CHART_TIPS: Record<string, { does: string; example: string; cant: string }> = {
  pie: {
    does: 'Groups items by a column\'s distinct values and shows proportions as slices.',
    example: 'Group by "Status" → Done 45 %, In Progress 35 %, Todo 20 %.',
    cant: 'Show individual item values or time trends.',
  },
  bar_vertical: {
    does: 'Same grouping as Pie but as vertical columns — clearer when comparing many groups.',
    example: 'Group by "Assignee", value = Sum of "Score" → one bar per person with their total.',
    cant: 'Show time trends — use Line chart for that.',
  },
  bar_horizontal: {
    does: 'Same as Vertical Bar but rotated — best when group labels are long.',
    example: 'Group by "Item Name", value = cell value of "Revenue" → one bar per item.',
    cant: 'Show time trends.',
  },
  radar: {
    does: 'Plots each group as a spoke on a web — good for comparing 3–8 categories side by side.',
    example: 'Group by "Department", value = Count → see headcount per department at a glance.',
    cant: 'Handle many groups cleanly (>8 gets unreadable); no time dimension.',
  },
  line: {
    does: 'Plots a trend over time by bucketing items into day / week / month intervals.',
    example: 'Count new items per week → spot whether workload is growing.',
    cant: 'Non-time groupings — use Bar or Radar for category breakdowns.',
  },
  number: {
    does: 'Displays one or more large aggregated numbers — ideal for KPI at-a-glance.',
    example: '"Total open items: 143" alongside "Avg score: 7.8" as two metrics.',
    cant: 'Show breakdowns or trends — use Bar / Radar / Line for those.',
  },
};

const ChartTooltip: React.FC<{ chartType: string }> = ({ chartType }) => {
  const [visible, setVisible] = React.useState(false);
  const tip = CHART_TIPS[chartType];
  if (!tip) return null;
  return (
    <div className="relative inline-flex items-center ml-auto flex-shrink-0" style={{ zIndex: 10 }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400"
        aria-label={`Info about ${chartType} chart`}
      >
        i
      </button>
      {visible && (
        <div
          className="absolute bottom-full right-0 mb-1.5 w-64 bg-gray-900 text-white text-xs rounded-lg shadow-xl p-3 flex flex-col gap-1.5 pointer-events-none"
          role="tooltip"
        >
          <p>{tip.does}</p>
          <p className="text-gray-300"><span className="text-green-400 font-semibold">e.g.</span> {tip.example}</p>
          <p className="text-gray-400"><span className="font-semibold">Can't:</span> {tip.cant}</p>
          <div className="absolute bottom-[-4px] right-4 w-2 h-2 bg-gray-900 rotate-45" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const SelectLabel: React.FC<{ htmlFor: string; label: string; required?: boolean }> = ({ htmlFor, label, required }) => (
  <label htmlFor={htmlFor} className="text-xs font-medium text-gray-600">
    {label}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

interface BoardItem { id: string; name: string; isArchived?: boolean }

const BoardSelect: React.FC<{
  id: string;
  value: string;
  onChange: (id: string) => void;
  boards: BoardItem[];
}> = ({ id, value, onChange, boards }) => (
  <select
    id={id}
    value={value}
    onChange={e => onChange(e.target.value)}
    className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    aria-required="true"
  >
    <option value="">Select board…</option>
    {boards.filter(b => !b.isArchived).map(b => (
      <option key={b.id} value={b.id}>{b.name}</option>
    ))}
  </select>
);

const GroupSelect: React.FC<{
  id: string;
  value: string;
  onChange: (id: string) => void;
  boardId: string;
}> = ({ id, value, onChange, boardId }) => {
  const { data: groups = [] } = useGroups(boardId, !!boardId);
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={!boardId}
      className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
      aria-label="Group filter (optional)"
    >
      <option value="">Entire board</option>
      {groups.filter(g => !g.isArchived).map(g => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
};

const ColumnSelect: React.FC<{
  id: string;
  value: string;
  onChange: (id: string) => void;
  boardId: string;
  placeholder?: string;
  required?: boolean;
  includeItemName?: boolean;
}> = ({ id, value, onChange, boardId, placeholder = 'Select column…', required, includeItemName = true }) => {
  const { data: columns = [] } = useColumns(boardId, !!boardId);
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={!boardId}
      className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
      aria-required={required}
    >
      <option value="">{placeholder}</option>
      {includeItemName && <option value={ITEM_NAME_COLUMN_ID}>Item Name</option>}
      {columns.map(c => (
        <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
      ))}
    </select>
  );
};

const DateFormatSelect: React.FC<{
  id: string;
  value: DateFormat;
  onChange: (v: DateFormat) => void;
}> = ({ id, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <SelectLabel htmlFor={id} label="Date format" />
    <p className="text-xs text-gray-400">How to interpret ambiguous dates (e.g. 05/06/2026).</p>
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value as DateFormat)}
      className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Date format"
    >
      {DATE_FORMAT_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
      ))}
    </select>
  </div>
);

// ---------------------------------------------------------------------------
// Mode A: Metric form (Number / Radar)
// ---------------------------------------------------------------------------

interface MetricEntryDraft extends MetricEntry { _key: string }

function emptyMetricEntry(): MetricEntryDraft {
  return { _key: makeKey(), boardId: '', aggregation: 'COUNT', label: '' };
}

const MetricRowEditor: React.FC<{
  row: MetricEntryDraft;
  index: number;
  onChange: (r: MetricEntryDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
}> = ({ row, index, onChange, onRemove, canRemove }) => {
  const { data: boards = [] } = useBoards(undefined, false);
  const prefix = `metric-row-${row._key}`;
  const needsColumn = row.aggregation !== 'COUNT';

  const handleBoardChange = (boardId: string) => {
    onChange({ ...row, boardId, groupId: undefined, columnId: undefined });
  };
  const handleAggChange = (aggregation: MetricAggregation) => {
    onChange({ ...row, aggregation, columnId: aggregation === 'COUNT' ? undefined : row.columnId });
  };

  return (
    <div
      className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-2"
      role="group"
      aria-label={`Metric ${index + 1}`}
    >
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-board`} label="Board" required />
          <BoardSelect id={`${prefix}-board`} value={row.boardId} onChange={handleBoardChange} boards={boards} />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-group`} label="Group (optional)" />
          <GroupSelect id={`${prefix}-group`} value={row.groupId ?? ''} onChange={v => onChange({ ...row, groupId: v || undefined })} boardId={row.boardId} />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-agg`} label="Aggregation" required />
          <select
            id={`${prefix}-agg`}
            value={row.aggregation}
            onChange={e => handleAggChange(e.target.value as MetricAggregation)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {METRIC_AGG_OPTIONS.map(o => <option key={o.fn} value={o.fn}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-col`} label="Column" required={needsColumn} />
          <ColumnSelect
            id={`${prefix}-col`}
            value={row.columnId ?? ''}
            onChange={v => onChange({ ...row, columnId: v || undefined })}
            boardId={row.boardId}
            placeholder={needsColumn ? 'Select column…' : 'Any column (counting items)'}
            required={needsColumn}
          />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-label`} label="Label" required />
          <input
            id={`${prefix}-label`}
            type="text"
            value={row.label}
            onChange={e => onChange({ ...row, label: e.target.value })}
            placeholder="e.g. Total Leads"
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-required="true"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="mb-0.5 p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
          aria-label={`Remove metric ${index + 1}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};

interface MetricFormState {
  metrics: MetricEntryDraft[];
  timeAxisColumnId: string;
  dateFormat: DateFormat;
}

const MetricForm: React.FC<{
  state: MetricFormState;
  onChange: (s: MetricFormState) => void;
  showTimeAxis: boolean;
}> = ({ state, onChange, showTimeAxis }) => {
  const updateMetric = (i: number, row: MetricEntryDraft) =>
    onChange({ ...state, metrics: state.metrics.map((m, idx) => idx === i ? row : m) });
  const removeMetric = (i: number) =>
    onChange({ ...state, metrics: state.metrics.filter((_, idx) => idx !== i) });
  const addMetric = () =>
    onChange({ ...state, metrics: [...state.metrics, emptyMetricEntry()] });

  const firstBoardId = state.metrics[0]?.boardId ?? '';

  return (
    <div className="flex flex-col gap-3">
      {state.metrics.map((row, i) => (
        <MetricRowEditor
          key={row._key}
          row={row}
          index={i}
          onChange={r => updateMetric(i, r)}
          onRemove={() => removeMetric(i)}
          canRemove={state.metrics.length > 1}
        />
      ))}
      <button
        type="button"
        onClick={addMetric}
        className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors self-start"
        aria-label="Add metric"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
        Add metric
      </button>
      {showTimeAxis && (
        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
          <div className="flex flex-col gap-1">
            <SelectLabel htmlFor="metric-time-axis" label="Date filter column (optional)" />
            <p className="text-xs text-gray-400 mb-1">When set, the page date range filter will scope this dashboard.</p>
            <ColumnSelect
              id="metric-time-axis"
              value={state.timeAxisColumnId}
              onChange={v => onChange({ ...state, timeAxisColumnId: v })}
              boardId={firstBoardId}
              placeholder="None (date filter won't apply)"
            />
          </div>
          {state.timeAxisColumnId && (
            <DateFormatSelect
              id="metric-date-format"
              value={state.dateFormat}
              onChange={v => onChange({ ...state, dateFormat: v })}
            />
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mode B: Category form (Pie / Bar)
// ---------------------------------------------------------------------------

interface CategoryFormState {
  boardId: string;
  groupId: string;
  groupByColumnId: string;
  yAxisAggregation: MetricAggregation;
  yAxisColumnId: string;
  timeAxisColumnId: string;
  dateFormat: DateFormat;
}

const CATEGORY_AGG_OPTIONS: { fn: MetricAggregation; label: string; desc: string }[] = [
  { fn: 'COUNT',   label: 'Count items',   desc: 'Number of items in each group' },
  { fn: 'SUM',     label: 'Sum',           desc: 'Total of a numeric column per group' },
  { fn: 'AVERAGE', label: 'Average',       desc: 'Mean of a numeric column per group' },
  { fn: 'MIN',     label: 'Min value',     desc: 'Smallest value in the group' },
  { fn: 'MAX',     label: 'Max value',     desc: 'Largest value in the group' },
];

const CategoryForm: React.FC<{
  state: CategoryFormState;
  onChange: (s: CategoryFormState) => void;
}> = ({ state, onChange }) => {
  const { data: boards = [] } = useBoards(undefined, false);
  const isItemNameGroup = state.groupByColumnId === ITEM_NAME_COLUMN_ID;
  const needsValueCol = !isItemNameGroup && state.yAxisAggregation !== 'COUNT';
  const showValueCol = isItemNameGroup || needsValueCol;
  const handleBoardChange = (boardId: string) =>
    onChange({ ...state, boardId, groupId: '', groupByColumnId: '', yAxisAggregation: 'COUNT', yAxisColumnId: '', timeAxisColumnId: '' });
  const handleGroupByChange = (v: string) => {
    const switchingToItemName = v === ITEM_NAME_COLUMN_ID;
    const switchingFromItemName = state.groupByColumnId === ITEM_NAME_COLUMN_ID && v !== ITEM_NAME_COLUMN_ID;
    onChange({
      ...state,
      groupByColumnId: v,
      yAxisAggregation: switchingToItemName ? 'SUM' : switchingFromItemName ? 'COUNT' : state.yAxisAggregation,
      yAxisColumnId: (switchingToItemName || switchingFromItemName) ? '' : state.yAxisColumnId,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor="cat-board" label="Board" required />
          <BoardSelect id="cat-board" value={state.boardId} onChange={handleBoardChange} boards={boards} />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor="cat-group" label="Group (optional)" />
          <GroupSelect id="cat-group" value={state.groupId} onChange={v => onChange({ ...state, groupId: v })} boardId={state.boardId} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <SelectLabel htmlFor="cat-groupby" label="Group items by" required />
        <p className="text-xs text-gray-400">Each distinct value becomes a slice / bar / spoke.</p>
        <ColumnSelect
          id="cat-groupby"
          value={state.groupByColumnId}
          onChange={handleGroupByChange}
          boardId={state.boardId}
          required
        />
      </div>
      {isItemNameGroup ? (
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor="cat-ycol" label="Cell value column" required />
          <p className="text-xs text-gray-400">Each item's value in this column becomes its bar/slice height.</p>
          <ColumnSelect
            id="cat-ycol"
            value={state.yAxisColumnId}
            onChange={v => onChange({ ...state, yAxisColumnId: v })}
            boardId={state.boardId}
            placeholder="Select numeric column…"
            required
            includeItemName={false}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <SelectLabel htmlFor="cat-yagg" label="Value" required />
          <p className="text-xs text-gray-400">What each bar / slice height represents.</p>
          <div className="grid grid-cols-1 gap-1.5">
            {CATEGORY_AGG_OPTIONS.map(o => (
              <label
                key={o.fn}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  state.yAxisAggregation === o.fn
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="cat-yagg"
                  value={o.fn}
                  checked={state.yAxisAggregation === o.fn}
                  onChange={() => onChange({ ...state, yAxisAggregation: o.fn, yAxisColumnId: o.fn === 'COUNT' ? '' : state.yAxisColumnId })}
                  className="accent-blue-600"
                  aria-label={o.label}
                />
                <span className="flex flex-col min-w-0">
                  <span className="text-xs font-medium">{o.label}</span>
                  <span className="text-xs text-gray-400">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {showValueCol && (
            <div className="flex flex-col gap-1 mt-1">
              <SelectLabel htmlFor="cat-ycol" label="Value column" required />
              <ColumnSelect
                id="cat-ycol"
                value={state.yAxisColumnId}
                onChange={v => onChange({ ...state, yAxisColumnId: v })}
                boardId={state.boardId}
                placeholder="Select numeric column…"
                required
                includeItemName={false}
              />
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor="cat-time-axis" label="Date filter column (optional)" />
          <p className="text-xs text-gray-400 mb-1">When set, the page date range filter will scope this dashboard.</p>
          <ColumnSelect
            id="cat-time-axis"
            value={state.timeAxisColumnId}
            onChange={v => onChange({ ...state, timeAxisColumnId: v })}
            boardId={state.boardId}
            placeholder="None (date filter won't apply)"
          />
        </div>
        {state.timeAxisColumnId && (
          <DateFormatSelect
            id="cat-date-format"
            value={state.dateFormat}
            onChange={v => onChange({ ...state, dateFormat: v })}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mode C: Time Series form (Line) — multi-series
// ---------------------------------------------------------------------------

interface LineSeriesDraft {
  _key: string;
  label: string;
  boardId: string;
  groupId: string;
  xAxisColumnId: string;
  xAxisGrouping: TimeAxisGrouping;
  yAxisAggregation: YAxisAggregation;
  yAxisColumnId: string;
  dateFormat: DateFormat;
}

interface TimeSeriesFormState {
  series: LineSeriesDraft[];
}

function emptySeriesDraft(index: number, prev?: LineSeriesDraft): LineSeriesDraft {
  return {
    _key: makeKey(),
    label: `Series ${index + 1}`,
    boardId: prev?.boardId ?? '',
    groupId: prev?.groupId ?? '',
    xAxisColumnId: prev?.xAxisColumnId ?? '',
    xAxisGrouping: prev?.xAxisGrouping ?? 'day',
    yAxisAggregation: prev?.yAxisAggregation ?? 'COUNT',
    yAxisColumnId: prev?.yAxisColumnId ?? '',
    dateFormat: prev?.dateFormat ?? 'auto',
  };
}

const LINE_SERIES_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

const LineSeriesRowEditor: React.FC<{
  series: LineSeriesDraft;
  index: number;
  colorDot: string;
  onChange: (s: LineSeriesDraft) => void;
  onRemove: () => void;
  canRemove: boolean;
  showLabel: boolean;
}> = ({ series, index, colorDot, onChange, onRemove, canRemove, showLabel }) => {
  const { data: boards = [] } = useBoards(undefined, false);
  const needsYColumn = series.yAxisAggregation !== 'COUNT';
  const prefix = `ts-series-${series._key}`;

  return (
    <div
      className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col gap-2"
      role="group"
      aria-label={`Series ${index + 1}`}
    >
      {showLabel && (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: colorDot }}
            aria-hidden="true"
          />
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <SelectLabel htmlFor={`${prefix}-label`} label="Series name" required />
            <input
              id={`${prefix}-label`}
              type="text"
              value={series.label}
              onChange={e => onChange({ ...series, label: e.target.value })}
              placeholder={`Series ${index + 1}`}
              className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-required="true"
            />
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="mt-4 p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex-shrink-0"
            aria-label={`Remove series ${index + 1}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-board`} label="Board" required />
          <BoardSelect
            id={`${prefix}-board`}
            value={series.boardId}
            onChange={boardId => onChange({ ...series, boardId, groupId: '', xAxisColumnId: '', yAxisColumnId: '' })}
            boards={boards}
          />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-group`} label="Group (optional)" />
          <GroupSelect
            id={`${prefix}-group`}
            value={series.groupId}
            onChange={v => onChange({ ...series, groupId: v })}
            boardId={series.boardId}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-xaxis`} label="X axis (date column)" required />
          <ColumnSelect
            id={`${prefix}-xaxis`}
            value={series.xAxisColumnId}
            onChange={v => onChange({ ...series, xAxisColumnId: v })}
            boardId={series.boardId}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-grouping`} label="Group by" required />
          <select
            id={`${prefix}-grouping`}
            value={series.xAxisGrouping}
            onChange={e => onChange({ ...series, xAxisGrouping: e.target.value as TimeAxisGrouping })}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {GROUPING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <SelectLabel htmlFor={`${prefix}-yagg`} label="Y axis — measure" required />
          <select
            id={`${prefix}-yagg`}
            value={series.yAxisAggregation}
            onChange={e => onChange({ ...series, yAxisAggregation: e.target.value as YAxisAggregation, yAxisColumnId: '' })}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Y_AGG_OPTIONS.map(o => <option key={o.fn} value={o.fn}>{o.label}</option>)}
          </select>
        </div>
        {needsYColumn && (
          <div className="flex flex-col gap-1">
            <SelectLabel htmlFor={`${prefix}-ycol`} label="Y axis — column" required />
            <ColumnSelect
              id={`${prefix}-ycol`}
              value={series.yAxisColumnId}
              onChange={v => onChange({ ...series, yAxisColumnId: v })}
              boardId={series.boardId}
              required
            />
          </div>
        )}
      </div>
      <DateFormatSelect
        id={`${prefix}-datefmt`}
        value={series.dateFormat}
        onChange={v => onChange({ ...series, dateFormat: v })}
      />
    </div>
  );
};

const TimeSeriesForm: React.FC<{
  state: TimeSeriesFormState;
  onChange: (s: TimeSeriesFormState) => void;
}> = ({ state, onChange }) => {
  const isMulti = state.series.length > 1;

  const updateSeries = (i: number, s: LineSeriesDraft) =>
    onChange({ series: state.series.map((x, idx) => idx === i ? s : x) });
  const removeSeries = (i: number) =>
    onChange({ series: state.series.filter((_, idx) => idx !== i) });
  const addSeries = () => {
    if (state.series.length >= 4) return;
    const prev = state.series[state.series.length - 1];
    onChange({ series: [...state.series, emptySeriesDraft(state.series.length, prev)] });
  };

  return (
    <div className="flex flex-col gap-3">
      {state.series.map((s, i) => (
        <LineSeriesRowEditor
          key={s._key}
          series={s}
          index={i}
          colorDot={LINE_SERIES_COLORS[i % LINE_SERIES_COLORS.length]}
          onChange={updated => updateSeries(i, updated)}
          onRemove={() => removeSeries(i)}
          canRemove={state.series.length > 1}
          showLabel={isMulti}
        />
      ))}
      {state.series.length < 4 && (
        <button
          type="button"
          onClick={addSeries}
          className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors self-start"
          aria-label="Add series"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add series {state.series.length < 4 ? `(${4 - state.series.length} remaining)` : ''}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers to extract form state from an existing CustomDashboard
// ---------------------------------------------------------------------------

function initMetricState(existing?: CustomDashboard): MetricFormState {
  if (existing?.config.type === 'metric') {
    return {
      metrics: existing.config.metrics.map(m => ({ ...m, _key: makeKey() })),
      timeAxisColumnId: existing.config.timeAxisColumnId ?? '',
      dateFormat: existing.config.dateFormat ?? 'auto',
    };
  }
  return { metrics: [emptyMetricEntry()], timeAxisColumnId: '', dateFormat: 'auto' };
}

function initCategoryState(existing?: CustomDashboard): CategoryFormState {
  if (existing?.config.type === 'category') {
    return {
      boardId: existing.config.boardId,
      groupId: existing.config.groupId ?? '',
      groupByColumnId: existing.config.groupByColumnId,
      yAxisAggregation: existing.config.yAxisAggregation ?? 'COUNT',
      yAxisColumnId: existing.config.yAxisColumnId ?? '',
      timeAxisColumnId: existing.config.timeAxisColumnId ?? '',
      dateFormat: existing.config.dateFormat ?? 'auto',
    };
  }
  return { boardId: '', groupId: '', groupByColumnId: '', yAxisAggregation: 'COUNT', yAxisColumnId: '', timeAxisColumnId: '', dateFormat: 'auto' };
}

function initTimeSeriesState(existing?: CustomDashboard): TimeSeriesFormState {
  if (existing?.config.type === 'timeseries') {
    const config = existing.config;
    if (config.series && config.series.length > 0) {
      return {
        series: config.series.map(s => ({
          _key: makeKey(),
          label: s.label,
          boardId: s.boardId,
          groupId: s.groupId ?? '',
          xAxisColumnId: s.xAxisColumnId,
          xAxisGrouping: s.xAxisGrouping,
          yAxisAggregation: s.yAxisAggregation,
          yAxisColumnId: s.yAxisColumnId ?? '',
          dateFormat: s.dateFormat ?? 'auto',
        })),
      };
    }
    return {
      series: [{
        _key: makeKey(),
        label: 'Series 1',
        boardId: config.boardId,
        groupId: config.groupId ?? '',
        xAxisColumnId: config.xAxisColumnId,
        xAxisGrouping: config.xAxisGrouping,
        yAxisAggregation: config.yAxisAggregation,
        yAxisColumnId: config.yAxisColumnId ?? '',
        dateFormat: config.dateFormat ?? 'auto',
      }],
    };
  }
  return {
    series: [emptySeriesDraft(0)],
  };
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface Props {
  onClose: () => void;
  existing?: CustomDashboard;
}

const AddCustomDashboardModal: React.FC<Props> = ({ onClose, existing }) => {
  const headingId = useId();
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [chartType, setChartType] = useState<ChartType>(existing?.chartType ?? 'bar_vertical');
  const [visibility, setVisibility] = useState<DashboardVisibility>(existing?.visibility ?? 'admins_only');
  const [error, setError] = useState<string | null>(null);

  const [metricState, setMetricState] = useState<MetricFormState>(() => initMetricState(existing));
  const [categoryState, setCategoryState] = useState<CategoryFormState>(() => initCategoryState(existing));
  const [tsState, setTsState] = useState<TimeSeriesFormState>(() => initTimeSeriesState(existing));

  const createMutation = useCreateCustomDashboard();
  const updateMutation = useUpdateCustomDashboard();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const mode = configModeFor(chartType);

  const validate = (): string | null => {
    if (!name.trim()) return 'Dashboard name is required.';
    if (mode === 'metric') {
      for (const [i, m] of metricState.metrics.entries()) {
        if (!m.boardId) return `Metric ${i + 1}: select a board.`;
        if (m.aggregation !== 'COUNT' && !m.columnId) return `Metric ${i + 1}: select a column for ${m.aggregation}.`;
        if (!m.label.trim()) return `Metric ${i + 1}: enter a label.`;
      }
    } else if (mode === 'category') {
      if (!categoryState.boardId) return 'Select a board.';
      if (!categoryState.groupByColumnId) return 'Select a column to group by.';
      if (categoryState.yAxisAggregation !== 'COUNT' && !categoryState.yAxisColumnId) {
        return 'Select a value column for the chosen aggregation.';
      }
    } else {
      for (const [i, s] of tsState.series.entries()) {
        if (!s.boardId) return `Series ${i + 1}: select a board.`;
        if (!s.xAxisColumnId) return `Series ${i + 1}: select an X axis column.`;
        if (s.yAxisAggregation !== 'COUNT' && !s.yAxisColumnId) return `Series ${i + 1}: select a Y axis column.`;
      }
    }
    return null;
  };

  const buildConfig = (): MetricConfig | CategoryConfig | TimeSeriesConfig => {
    if (mode === 'metric') {
      const cfg: MetricConfig = {
        type: 'metric',
        metrics: metricState.metrics.map(({ _key: _k, ...m }) => m),
      };
      if (metricState.timeAxisColumnId) {
        cfg.timeAxisColumnId = metricState.timeAxisColumnId;
        cfg.dateFormat = metricState.dateFormat;
      }
      return cfg;
    }
    if (mode === 'category') {
      const cfg: CategoryConfig = {
        type: 'category',
        boardId: categoryState.boardId,
        groupByColumnId: categoryState.groupByColumnId,
      };
      if (categoryState.groupId) cfg.groupId = categoryState.groupId;
      if (categoryState.timeAxisColumnId) {
        cfg.timeAxisColumnId = categoryState.timeAxisColumnId;
        cfg.dateFormat = categoryState.dateFormat;
      }
      if (categoryState.yAxisAggregation && categoryState.yAxisAggregation !== 'COUNT') {
        cfg.yAxisAggregation = categoryState.yAxisAggregation;
        if (categoryState.yAxisColumnId) cfg.yAxisColumnId = categoryState.yAxisColumnId;
      }
      return cfg;
    }
    // timeseries
    const builtSeries: LineSeriesConfig[] = tsState.series.map(s => {
      const entry: LineSeriesConfig = {
        boardId: s.boardId,
        xAxisColumnId: s.xAxisColumnId,
        xAxisGrouping: s.xAxisGrouping,
        yAxisAggregation: s.yAxisAggregation,
        label: s.label,
        dateFormat: s.dateFormat,
      };
      if (s.groupId) entry.groupId = s.groupId;
      if (s.yAxisAggregation !== 'COUNT' && s.yAxisColumnId) entry.yAxisColumnId = s.yAxisColumnId;
      return entry;
    });
    const s0 = builtSeries[0];
    const cfg: TimeSeriesConfig = {
      type: 'timeseries',
      boardId: s0.boardId,
      xAxisColumnId: s0.xAxisColumnId,
      xAxisGrouping: s0.xAxisGrouping,
      yAxisAggregation: s0.yAxisAggregation,
      dateFormat: s0.dateFormat,
      series: builtSeries,
    };
    if (s0.groupId) cfg.groupId = s0.groupId;
    if (s0.yAxisAggregation !== 'COUNT' && s0.yAxisColumnId) cfg.yAxisColumnId = s0.yAxisColumnId;
    return cfg;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);

    const payload = { name: name.trim(), chartType, config: buildConfig(), visibility };
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
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors" aria-label="Close dialog">
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
              Dashboard name <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="cd-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Leads per day"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-required="true"
            />
          </div>

          {/* Visibility */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Visibility</legend>
            <div className="flex gap-3">
              {([
                { value: 'admins_only' as DashboardVisibility, label: 'Admins only', desc: 'Only org admins can see this' },
                { value: 'all' as DashboardVisibility, label: 'All users', desc: 'Everyone in the org can see this' },
              ] as const).map(opt => (
                <label
                  key={opt.value}
                  className={`flex-1 flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    visibility === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="cd-visibility" value={opt.value} checked={visibility === opt.value} onChange={() => setVisibility(opt.value)} className="mt-0.5 accent-blue-600" aria-label={opt.label} />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-500">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Chart type */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Chart type</legend>
            <div className="grid grid-cols-3 gap-2">
              {CHART_OPTIONS.map(opt => (
                <label
                  key={opt.type}
                  className={`flex items-center gap-2.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    chartType === opt.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" name="cd-chartType" value={opt.type} checked={chartType === opt.type} onChange={() => setChartType(opt.type)} className="sr-only" aria-label={opt.label} />
                  <span className="text-xl" aria-hidden="true">{opt.icon}</span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{opt.label}</span>
                    <span className="text-xs text-gray-500 truncate">{opt.description}</span>
                  </span>
                  <ChartTooltip chartType={opt.type} />
                </label>
              ))}
            </div>
          </fieldset>

          {/* Mode-specific form */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {mode === 'metric' ? 'Metrics' : mode === 'category' ? 'Data source' : 'Data source'}
            </h3>
            {mode === 'metric' && (
              <MetricForm state={metricState} onChange={setMetricState} showTimeAxis />
            )}
            {mode === 'category' && (
              <CategoryForm state={categoryState} onChange={setCategoryState} />
            )}
            {mode === 'timeseries' && (
              <TimeSeriesForm state={tsState} onChange={setTsState} />
            )}
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" aria-label="Cancel">
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
