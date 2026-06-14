import React, { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from 'recharts';
import { useCustomDashboardData } from '../../../hooks/queries/useCustomDashboardQueries';
import { useColumns } from '../../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../../types';
import type { CustomDashboard, CustomDashboardDataPoint, StatusColumnSettings } from '../../../types';

// ---------------------------------------------------------------------------
// Palette for charts (fallback when no status color mapping)
// ---------------------------------------------------------------------------

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16',
];

// ---------------------------------------------------------------------------
// Chart renderers
// ---------------------------------------------------------------------------

type ColorMap = Record<string, string>;

const PieView: React.FC<{ data: CustomDashboardDataPoint[]; colorMap: ColorMap }> = ({ data, colorMap }) => (
  <ResponsiveContainer width="100%" height={260}>
    <PieChart>
      <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90}>
        {data.map((d, i) => (
          <Cell key={i} fill={colorMap[d.label] ?? PALETTE[i % PALETTE.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
);

const BarVerticalView: React.FC<{ data: CustomDashboardDataPoint[]; colorMap: ColorMap }> = ({ data, colorMap }) => (
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
        {data.map((d, i) => (
          <Cell key={i} fill={colorMap[d.label] ?? PALETTE[i % PALETTE.length]} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

const BarHorizontalView: React.FC<{ data: CustomDashboardDataPoint[]; colorMap: ColorMap }> = ({ data, colorMap }) => (
  <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40 + 40)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
      <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={110} />
      <Tooltip formatter={(v) => [`${v}`, 'Value']} />
      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
        {data.map((d, i) => (
          <Cell key={i} fill={colorMap[d.label] ?? PALETTE[i % PALETTE.length]} />
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

const LINE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

// Detect if labels look like ISO dates (yyyy-mm-dd) and format them compactly
function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatAxisDate(value: string): string {
  if (!isIsoDate(value)) return value;
  const [, month, day] = value.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function formatTooltipDate(value: string): string {
  if (!isIsoDate(value)) return value;
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year}`;
}

const LineView: React.FC<{ data: CustomDashboardDataPoint[]; seriesLabels?: string[] }> = ({ data, seriesLabels }) => {
  const isMulti = seriesLabels && seriesLabels.length > 1;
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set());

  const toggleSeries = (label: string) =>
    setHidden(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });

  return (
    <div className="flex flex-col gap-2">
      {isMulti && (
        <div className="flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Toggle series">
          {seriesLabels.map((sl, i) => {
            const isHidden = hidden.has(sl);
            return (
              <button
                key={sl}
                type="button"
                onClick={() => toggleSeries(sl)}
                className="flex items-center gap-1.5 text-xs rounded px-1 py-0.5 hover:bg-gray-100 transition-colors"
                aria-pressed={!isHidden}
                aria-label={`${isHidden ? 'Show' : 'Hide'} ${sl}`}
              >
                <span
                  className="inline-block w-3 h-2 rounded-sm flex-shrink-0"
                  style={{ background: LINE_COLORS[i % LINE_COLORS.length], opacity: isHidden ? 0.25 : 1 }}
                  aria-hidden="true"
                />
                <span className={isHidden ? 'text-gray-400 line-through' : 'text-gray-600'}>{sl}</span>
              </button>
            );
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} tickFormatter={formatAxisDate} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip labelFormatter={formatTooltipDate} />
          {isMulti
            ? seriesLabels.filter(sl => !hidden.has(sl)).map((sl, i) => (
                <Line key={sl} type="monotone" dataKey={sl} stroke={LINE_COLORS[seriesLabels.indexOf(sl) % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={sl} />
              ))
            : <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ r: 4 }} />
          }
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const NumberView: React.FC<{ data: CustomDashboardDataPoint[]; colorMap: ColorMap }> = ({ data, colorMap }) => {
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
                style={{ background: colorMap[d.label] ?? PALETTE[i % PALETTE.length] }}
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

function renderChart(chartType: CustomDashboard['chartType'], data: CustomDashboardDataPoint[], colorMap: ColorMap, seriesLabels?: string[]) {
  switch (chartType) {
    case 'pie':            return <PieView data={data} colorMap={colorMap} />;
    case 'bar_vertical':   return <BarVerticalView data={data} colorMap={colorMap} />;
    case 'bar_horizontal': return <BarHorizontalView data={data} colorMap={colorMap} />;
    case 'radar':          return <RadarView data={data} />;
    case 'line':           return <LineView data={data} seriesLabels={seriesLabels} />;
    case 'number':         return <NumberView data={data} colorMap={colorMap} />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  dashboard: CustomDashboard;
  dateFrom?: string;
  dateTo?: string;
}

const CustomDashboardWidget: React.FC<Props> = ({ dashboard, dateFrom, dateTo }) => {
  const { data, isLoading, isError } = useCustomDashboardData(dashboard.id, dateFrom, dateTo);

  // Collect up to 5 unique board IDs from the dashboard config
  const boardIds = useMemo(() => {
    const config = dashboard.config;
    const ids: string[] = [];
    if (config.type === 'metric') {
      const seen = new Set<string>();
      for (const m of config.metrics) {
        if (!seen.has(m.boardId)) { seen.add(m.boardId); ids.push(m.boardId); }
      }
    } else {
      ids.push(config.boardId);
    }
    return ids.slice(0, 5);
  }, [dashboard.config]);

  // Fetch columns for each board to build status label → color map
  const c0 = useColumns(boardIds[0] ?? '', boardIds.length > 0);
  const c1 = useColumns(boardIds[1] ?? '', boardIds.length > 1);
  const c2 = useColumns(boardIds[2] ?? '', boardIds.length > 2);
  const c3 = useColumns(boardIds[3] ?? '', boardIds.length > 3);
  const c4 = useColumns(boardIds[4] ?? '', boardIds.length > 4);

  const statusColorMap = useMemo<ColorMap>(() => {
    const allCols = [
      ...(c0.data ?? []),
      ...(c1.data ?? []),
      ...(c2.data ?? []),
      ...(c3.data ?? []),
      ...(c4.data ?? []),
    ];
    const map: ColorMap = {};
    for (const col of allCols) {
      if (col.type !== ColumnType.STATUS) continue;
      const settings = col.settings as StatusColumnSettings;
      for (const opt of (settings.options ?? [])) {
        if (!map[opt.label]) map[opt.label] = opt.color;
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c0.data, c1.data, c2.data, c3.data, c4.data]);

  const chartData: CustomDashboardDataPoint[] = data ?? [];

  const seriesLabels = useMemo<string[] | undefined>(() => {
    if (dashboard.chartType !== 'line') return undefined;
    const config = dashboard.config;
    if (config.type !== 'timeseries') return undefined;
    const s = config.series;
    if (!s || s.length <= 1) return undefined;
    return s.map(x => x.label);
  }, [dashboard.chartType, dashboard.config]);

  return (
    <figure aria-label={`${dashboard.name} custom dashboard`} className="flex flex-col gap-2 w-full">
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
          {renderChart(dashboard.chartType, chartData, statusColorMap, seriesLabels)}
          <FallbackTable data={chartData} />
        </>
      )}
    </figure>
  );
};

export default CustomDashboardWidget;
