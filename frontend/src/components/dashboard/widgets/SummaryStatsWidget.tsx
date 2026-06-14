import React from 'react';
import type { DashboardSummary } from '../../../types';

interface Props {
  summary: DashboardSummary['summary'];
  overdueCount: number;
}

type Color = 'gray' | 'green' | 'red';

const COLORS: Record<Color, { bg: string; label: string; value: string }> = {
  gray:  { bg: 'bg-gray-50',  label: 'text-gray-500',  value: 'text-gray-800'  },
  green: { bg: 'bg-green-50', label: 'text-green-600', value: 'text-green-700' },
  red:   { bg: 'bg-red-50',   label: 'text-red-600',   value: 'text-red-700'   },
};

interface KpiCardProps {
  label: string;
  value: number | string;
  color: Color;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, color }) => {
  const c = COLORS[color];
  return (
    <figure
      className={`${c.bg} rounded-lg p-4 flex flex-col gap-1`}
      aria-label={`${label}: ${value}`}
    >
      <span className={`text-xs font-medium ${c.label} uppercase tracking-wide`}>{label}</span>
      <span className={`text-2xl font-bold ${c.value}`}>{value}</span>
    </figure>
  );
};

const SummaryStatsWidget: React.FC<Props> = ({ summary, overdueCount }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" aria-label="Summary statistics">
    <KpiCard label="Total Items"     value={summary.total}                                    color="gray"  />
    <KpiCard label="Completed"       value={summary.completed}                                color="green" />
    <KpiCard label="Completion Rate" value={`${Math.round(summary.completionRate * 100)}%`}   color="green" />
    <KpiCard label="Overdue"         value={overdueCount}                                     color="red"   />
  </div>
);

export default SummaryStatsWidget;
