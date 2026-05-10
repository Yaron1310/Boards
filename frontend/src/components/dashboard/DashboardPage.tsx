import React, { useReducer, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useOrgSnapshot } from '../../hooks/useOrgSnapshot';
import DashboardFilterBar, {
  filterReducer,
  toDashboardParams,
  type FilterState,
} from './DashboardFilterBar';
import WidgetCard from './WidgetCard';
import { useDashboardSummary } from '../../hooks/queries/useDashboardQueries';
import SummaryStatsWidget from './widgets/SummaryStatsWidget';
import StatusDistributionWidget from './widgets/StatusDistributionWidget';
import WorkloadByPersonWidget from './widgets/WorkloadByPersonWidget';
import OverdueItemsWidget from './widgets/OverdueItemsWidget';
import ItemsByBoardWidget from './widgets/ItemsByBoardWidget';

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
  const { selectedWorkspace } = useAuthSession();
  useOrgSnapshot(selectedWorkspace?.orgId);
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

  // Build boardId → name lookup from itemsByBoard for overdue widget
  const boardNameMap = useMemo(
    () => Object.fromEntries((summary?.itemsByBoard ?? []).map(b => [b.boardId, b.name])),
    [summary],
  );

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
            <SummaryStatsWidget
              summary={summary.summary}
              overdueCount={summary.overdue.count}
            />
          )}
        </WidgetCard>

        {/* Status distribution */}
        <WidgetCard
          title="Status Distribution"
          subtitle="Item counts per status"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.statusDistribution.length ?? 0) === 0}
          emptyMessage="No status data yet"
        >
          {summary && summary.statusDistribution.length > 0 && (
            <StatusDistributionWidget data={summary.statusDistribution} />
          )}
        </WidgetCard>

        {/* Workload by person */}
        <WidgetCard
          title="Workload by Person"
          subtitle="Items assigned per team member"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.workloadByPerson.length ?? 0) === 0}
          emptyMessage="No assignee data yet"
        >
          {summary && summary.workloadByPerson.length > 0 && (
            <WorkloadByPersonWidget data={summary.workloadByPerson} />
          )}
        </WidgetCard>

        {/* Overdue items */}
        <WidgetCard
          title="Overdue Items"
          subtitle="Tasks past their due date"
          isLoading={isLoading}
          isEmpty={!isLoading && (summary?.overdue.count ?? 0) === 0}
          emptyMessage="No overdue items"
        >
          {summary && summary.overdue.count > 0 && (
            <OverdueItemsWidget
              count={summary.overdue.count}
              items={summary.overdue.items}
              dashboardParams={params}
              boardNameMap={boardNameMap}
            />
          )}
        </WidgetCard>

        {/* Items by board — hidden when a single board is already filtered */}
        {filters.boardIds.length !== 1 && (
          <WidgetCard
            title="Items by Board"
            subtitle="Item count per board"
            isLoading={isLoading}
            isEmpty={!isLoading && (summary?.itemsByBoard.length ?? 0) === 0}
            emptyMessage="No board data yet"
          >
            {summary && summary.itemsByBoard.length > 0 && (
              <ItemsByBoardWidget data={summary.itemsByBoard} />
            )}
          </WidgetCard>
        )}
      </div>
    </main>
  );
};

export default DashboardPage;
