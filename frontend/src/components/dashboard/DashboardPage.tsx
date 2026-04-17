import React, { useReducer, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardFilterBar, {
  filterReducer,
  toDashboardParams,
  INITIAL_FILTER_STATE,
  type FilterState,
} from './DashboardFilterBar';
import WidgetCard from './WidgetCard';
import { useDashboardSummary } from '../../hooks/queries/useDashboardQueries';

// ---------------------------------------------------------------------------
// URL ↔ FilterState helpers
// ---------------------------------------------------------------------------

function stateFromSearchParams(params: URLSearchParams): FilterState {
  return {
    workspaceId: params.get('workspaceId') ?? '',
    boardIds: params.getAll('boardId'),
    assigneeId: params.get('assigneeId') ?? '',
    dueDateFrom: params.get('dueDateFrom') ?? '',
    dueDateTo: params.get('dueDateTo') ?? '',
  };
}

function applyStateToSearchParams(
  state: FilterState,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
) {
  const next = new URLSearchParams();
  if (state.workspaceId) next.set('workspaceId', state.workspaceId);
  state.boardIds.forEach(id => next.append('boardId', id));
  if (state.assigneeId) next.set('assigneeId', state.assigneeId);
  if (state.dueDateFrom) next.set('dueDateFrom', state.dueDateFrom);
  if (state.dueDateTo) next.set('dueDateTo', state.dueDateTo);
  setSearchParams(next, { replace: true });
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

const DashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, dispatch] = useReducer(
    filterReducer,
    undefined,
    () => stateFromSearchParams(searchParams),
  );

  // Persist filter changes to URL
  useEffect(() => {
    applyStateToSearchParams(filters, setSearchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const params = toDashboardParams(filters);
  const { data: summary, isLoading } = useDashboardSummary(params);

  const summaryIsEmpty = !isLoading && !summary;

  return (
    <main className="p-6 max-w-7xl mx-auto flex flex-col gap-6" aria-label="Dashboard">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
        {summary?.truncated && (
          <span
            className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1"
            role="status"
            aria-live="polite"
          >
            Results capped at 1,000 items — apply filters to narrow down
          </span>
        )}
      </div>

      <DashboardFilterBar filters={filters} dispatch={dispatch} />

      {/* Widget grid — 1 col mobile, 2 col md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Summary stats — full width */}
        <WidgetCard
          title="Summary"
          subtitle="Total, completed, and overdue counts"
          isLoading={isLoading}
          isEmpty={summaryIsEmpty}
          className="md:col-span-2"
        >
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" role="list" aria-label="Summary stats">
              <StatCard label="Total Items" value={summary.summary.total} color="gray" />
              <StatCard label="Completed" value={summary.summary.completed} color="green" />
              <StatCard
                label="Completion Rate"
                value={`${Math.round(summary.summary.completionRate * 100)}%`}
                color="green"
              />
              <StatCard label="Overdue" value={summary.overdue.count} color="red" />
            </div>
          )}
        </WidgetCard>

        {/* Status distribution placeholder */}
        <WidgetCard
          title="Status Distribution"
          subtitle="Item counts per status"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.statusDistribution.length ?? 0) === 0}
          emptyMessage="No status data yet"
        >
          {/* Filled in Phase 8D — StatusDistributionWidget */}
          {summary && summary.statusDistribution.length > 0 && (
            <p className="text-sm text-gray-500 italic">Chart coming in Phase 8D</p>
          )}
        </WidgetCard>

        {/* Workload by person placeholder */}
        <WidgetCard
          title="Workload by Person"
          subtitle="Items assigned per team member"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.workloadByPerson.length ?? 0) === 0}
          emptyMessage="No assignee data yet"
        >
          {/* Filled in Phase 8D — WorkloadByPersonWidget */}
          {summary && summary.workloadByPerson.length > 0 && (
            <p className="text-sm text-gray-500 italic">Chart coming in Phase 8D</p>
          )}
        </WidgetCard>

        {/* Overdue items placeholder */}
        <WidgetCard
          title="Overdue Items"
          subtitle="Tasks past their due date"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.overdue.count ?? 0) === 0}
          emptyMessage="No overdue items"
        >
          {/* Filled in Phase 8D — OverdueItemsWidget */}
          {summary && summary.overdue.count > 0 && (
            <p className="text-sm text-gray-500 italic">List coming in Phase 8D</p>
          )}
        </WidgetCard>

        {/* Items by board placeholder — hidden when single board is filtered */}
        {filters.boardIds.length !== 1 && (
          <WidgetCard
            title="Items by Board"
            subtitle="Item count per board"
            isLoading={isLoading}
            isEmpty={!isLoading && (summary?.itemsByBoard.length ?? 0) === 0}
            emptyMessage="No board data yet"
          >
            {/* Filled in Phase 8D — ItemsByBoardWidget */}
            {summary && summary.itemsByBoard.length > 0 && (
              <p className="text-sm text-gray-500 italic">Chart coming in Phase 8D</p>
            )}
          </WidgetCard>
        )}
      </div>
    </main>
  );
};

// ---------------------------------------------------------------------------
// Small KPI card (used in the Summary widget)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | string;
  color: 'gray' | 'green' | 'red';
}

const colorMap: Record<StatCardProps['color'], { bg: string; text: string; value: string }> = {
  gray: { bg: 'bg-gray-50', text: 'text-gray-500', value: 'text-gray-800' },
  green: { bg: 'bg-green-50', text: 'text-green-600', value: 'text-green-700' },
  red: { bg: 'bg-red-50', text: 'text-red-600', value: 'text-red-700' },
};

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => {
  const c = colorMap[color];
  return (
    <div
      className={`${c.bg} rounded-lg p-4 flex flex-col gap-1`}
      role="listitem"
      aria-label={`${label}: ${value}`}
    >
      <span className={`text-xs font-medium ${c.text} uppercase tracking-wide`}>{label}</span>
      <span className={`text-2xl font-bold ${c.value}`}>{value}</span>
    </div>
  );
};

export default DashboardPage;
