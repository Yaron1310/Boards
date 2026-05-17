import React, { useReducer, useEffect, useMemo, useState } from 'react';
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
import {
  useCustomDashboards,
  useDeleteCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import SummaryStatsWidget from './widgets/SummaryStatsWidget';
import StatusDistributionWidget from './widgets/StatusDistributionWidget';
import WorkloadByPersonWidget from './widgets/WorkloadByPersonWidget';
import OverdueItemsWidget from './widgets/OverdueItemsWidget';
import ItemsByBoardWidget from './widgets/ItemsByBoardWidget';
import CustomDashboardWidget from './widgets/CustomDashboardWidget';
import AddCustomDashboardModal from './AddCustomDashboardModal';
import { UserRole } from '../../types';
import type { CustomDashboard } from '../../types';

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
  const { selectedWorkspace, user } = useAuthSession();
  useOrgSnapshot(selectedWorkspace?.orgId);
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, dispatch] = useReducer(
    filterReducer,
    undefined,
    () => stateFromSearchParams(searchParams),
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<CustomDashboard | undefined>(undefined);

  const isOrgAdmin =
    user?.role === UserRole.ORGANIZATION_ADMIN || user?.role === UserRole.SYSTEM_ADMIN;

  // Persist filter changes to URL
  useEffect(() => {
    applyStateToSearchParams(filters, setSearchParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const params = toDashboardParams(filters);
  const { data: summary, isLoading } = useDashboardSummary(params);
  const { data: customDashboards = [] } = useCustomDashboards();
  const deleteMutation = useDeleteCustomDashboard();

  const summaryIsEmpty = !isLoading && !summary;

  // Build boardId → name lookup from itemsByBoard for overdue widget
  const boardNameMap = useMemo(
    () => Object.fromEntries((summary?.itemsByBoard ?? []).map(b => [b.boardId, b.name])),
    [summary],
  );

  const openCreate = () => { setEditingDashboard(undefined); setModalOpen(true); };
  const openEdit = (d: CustomDashboard) => { setEditingDashboard(d); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingDashboard(undefined); };

  return (
    <main className="p-6 max-w-7xl mx-auto flex flex-col gap-6" aria-label="Dashboard">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
        <div className="flex items-center gap-3">
          {summary?.truncated && (
            <span
              className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-3 py-1"
              role="status"
              aria-live="polite"
            >
              Results capped at 1,000 items — apply filters to narrow down
            </span>
          )}
          {isOrgAdmin && (
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              aria-label="Add custom dashboard"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add Dashboard
            </button>
          )}
        </div>
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

      {/* Custom dashboards */}
      {customDashboards.length > 0 && (
        <section aria-label="Custom dashboards">
          <h2 className="text-base font-semibold text-gray-700 mb-3">Custom Dashboards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {customDashboards.map(d => (
              <WidgetCard
                key={d.id}
                title={d.name}
                subtitle={`${d.aggregation.charAt(0) + d.aggregation.slice(1).toLowerCase()} · ${d.dataSources.length} source${d.dataSources.length !== 1 ? 's' : ''}`}
              >
                <CustomDashboardWidget
                  dashboard={d}
                  onEdit={() => openEdit(d)}
                  onDelete={() => deleteMutation.mutate(d.id)}
                  isAdmin={isOrgAdmin}
                  dateFrom={filters.dueDateFrom || undefined}
                  dateTo={filters.dueDateTo || undefined}
                />
              </WidgetCard>
            ))}
          </div>
        </section>
      )}

      {modalOpen && (
        <AddCustomDashboardModal
          onClose={closeModal}
          existing={editingDashboard}
        />
      )}
    </main>
  );
};

export default DashboardPage;
