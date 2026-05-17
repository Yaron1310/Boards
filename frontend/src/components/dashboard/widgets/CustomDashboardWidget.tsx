import React, { useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from 'recharts';
import { useCustomDashboardData } from '../../../hooks/queries/useCustomDashboardQueries';
import type { CustomDashboard, CustomDashboardDataPoint } from '../../../types';

// ---------------------------------------------------------------------------
// Palette for charts
// ---------------------------------------------------------------------------

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16',
];

// ---------------------------------------------------------------------------
// Chart renderers
// ---------------------------------------------------------------------------

const PieView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
);

const BarVerticalView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const BarHorizontalView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40 + 40)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
      <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={110} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const RadarView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <RadarChart data={data} cx="50%" cy="50%" outerRadius={90}>
      <PolarGrid />
      <PolarAngleAxis dataKey="label" tick={{ fontSize: 12 }} />
      <PolarRadiusAxis tick={{ fontSize: 10 }} />
      <Radar name="Value" dataKey="value" stroke={PALETTE[0]} fill={PALETTE[0]} fillOpacity={0.35} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
    </RadarChart>
  </ResponsiveContainer>
);

const LineView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ r: 4 }} />
    </LineChart>
  </ResponsiveContainer>
);

const NumberView: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-1">
      <span
        className="text-5xl font-bold text-gray-800 tabular-nums"
        aria-label={`Value: ${total.toLocaleString()}`}
      >
        {total.toLocaleString()}
      </span>
      {data.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 justify-center" aria-label="Breakdown">
          {data.map((d, i) => (
            <li key={i} className="flex items-center gap-1.5 text-sm text-gray-500">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
                aria-hidden="true"
              />
              {d.label}: <strong className="text-gray-700">{d.value.toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const FallbackTable: React.FC<{ data: CustomDashboardDataPoint[] }> = ({ data }) => (
  <table className="sr-only" aria-label="Chart data table">
    <thead><tr><th scope="col">Label</th><th scope="col">Value</th></tr></thead>
    <tbody>
      {data.map((d, i) => (
        <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>
      ))}
    </tbody>
  </table>
);

function renderChart(chartType: CustomDashboard['chartType'], data: CustomDashboardDataPoint[]) {
  switch (chartType) {
    case 'pie':           return <PieView data={data} />;
    case 'bar_vertical':  return <BarVerticalView data={data} />;
    case 'bar_horizontal':return <BarHorizontalView data={data} />;
    case 'radar':         return <RadarView data={data} />;
    case 'line':          return <LineView data={data} />;
    case 'number':        return <NumberView data={data} />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  dashboard: CustomDashboard;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  dateFrom?: string;
  dateTo?: string;
}

const CustomDashboardWidget: React.FC<Props> = ({ dashboard, onEdit, onDelete, isAdmin, dateFrom, dateTo }) => {
  const { data, isLoading, isError } = useCustomDashboardData(dashboard.id, dateFrom, dateTo);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const chartData: CustomDashboardDataPoint[] = data ?? [];

  return (
    <figure
      aria-label={`${dashboard.name} custom dashboard`}
      className="relative flex flex-col gap-2 w-full"
    >
      {isAdmin && (
        <div className="absolute top-0 right-0 flex gap-1" role="toolbar" aria-label="Dashboard actions">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
            aria-label={`Edit ${dashboard.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1" role="group" aria-label="Confirm delete">
              <button
                type="button"
                onClick={onDelete}
                className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                aria-label="Confirm delete"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                aria-label="Cancel delete"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
              aria-label={`Delete ${dashboard.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2 animate-pulse" role="status" aria-label={`Loading ${dashboard.name}`}>
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      )}

      {isError && (
        <p role="alert" className="text-sm text-red-500 py-4 text-center">
          Failed to load data for this dashboard.
        </p>
      )}

      {!isLoading && !isError && chartData.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center" role="status">No data yet</p>
      )}

      {!isLoading && !isError && chartData.length > 0 && (
        <>
          {renderChart(dashboard.chartType, chartData)}
          <FallbackTable data={chartData} />
        </>
      )}
    </figure>
  );
};

export default CustomDashboardWidget;
