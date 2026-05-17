import React, { useReducer, useState } from 'react';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useOrgSnapshot } from '../../hooks/useOrgSnapshot';
import DashboardFilterBar, {
  filterReducer,
  toDashboardParams,
  INITIAL_FILTER_STATE,
} from './DashboardFilterBar';
import WidgetCard from './WidgetCard';
import { useDashboardSummary } from '../../hooks/queries/useDashboardQueries';
import {
  useCustomDashboards,
  useDeleteCustomDashboard,
  useArchiveCustomDashboard,
  useRestoreCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import SummaryStatsWidget from './widgets/SummaryStatsWidget';
import CustomDashboardWidget from './widgets/CustomDashboardWidget';
import AddCustomDashboardModal from './AddCustomDashboardModal';
import ArchiveRestoreModal from '../admin/shared/ArchiveRestoreModal';
import { UserRole } from '../../types';
import type { CustomDashboard } from '../../types';

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

const DashboardPage: React.FC = () => {
  const { selectedWorkspace, user } = useAuthSession();
  useOrgSnapshot(selectedWorkspace?.orgId);

  const [filters, dispatch] = useReducer(filterReducer, INITIAL_FILTER_STATE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<CustomDashboard | undefined>(undefined);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isOrgAdmin =
    user?.role === UserRole.ORGANIZATION_ADMIN || user?.role === UserRole.SYSTEM_ADMIN;

  const params = toDashboardParams(filters);
  const { data: summary, isLoading } = useDashboardSummary(params);
  const { data: customDashboards = [] } = useCustomDashboards(false);
  const { data: archivedDashboards = [] } = useCustomDashboards(true);

  const deleteMutation = useDeleteCustomDashboard();
  const archiveMutation = useArchiveCustomDashboard();
  const restoreMutation = useRestoreCustomDashboard();

  const summaryIsEmpty = !isLoading && !summary;

  const openCreate = () => { setEditingDashboard(undefined); setModalOpen(true); };
  const openEdit = (d: CustomDashboard) => { setEditingDashboard(d); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingDashboard(undefined); };

  // Active time range for custom dashboard data
  const timeRangeFilter = filters.filters.find(
    (f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange',
  );
  const dateFrom = timeRangeFilter?.start;
  const dateTo = timeRangeFilter?.end;

  // Archive icon button for each dashboard widget
  const buildWidgetActions = (d: CustomDashboard) => {
    if (!isOrgAdmin) return undefined;

    return (
      <>
        <button
          type="button"
          onClick={() => openEdit(d)}
          className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
          aria-label={`Edit ${d.name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => archiveMutation.mutate(d.id)}
          className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
          aria-label={`Archive ${d.name}`}
          title="Archive"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4 3a2 2 0 00-2 2v1a2 2 0 002 2h1v8a2 2 0 002 2h6a2 2 0 002-2V8h1a2 2 0 002-2V5a2 2 0 00-2-2H4zm1 2h10v1H5V5zm2 3h6v8H7V8zm2 2v4h2v-4H9z" />
          </svg>
        </button>
        {confirmDeleteId === d.id ? (
          <div className="flex items-center gap-1" role="group" aria-label="Confirm delete">
            <button
              type="button"
              onClick={() => { deleteMutation.mutate(d.id); setConfirmDeleteId(null); }}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDeleteId(d.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
            aria-label={`Delete ${d.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </>
    );
  };

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
            <>
              <button
                type="button"
                onClick={() => setArchiveModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                aria-label="View archived dashboards"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4 3a2 2 0 00-2 2v1a2 2 0 002 2h1v8a2 2 0 002 2h6a2 2 0 002-2V8h1a2 2 0 002-2V5a2 2 0 00-2-2H4zm1 2h10v1H5V5zm2 3h6v8H7V8zm2 2v4h2v-4H9z" />
                </svg>
                Archived
              </button>
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
            </>
          )}
        </div>
      </div>

      <DashboardFilterBar filters={filters} dispatch={dispatch} />

      {/* Summary stats — full width */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                subtitle={
                  d.config.type === 'timeseries'
                    ? `By ${d.config.xAxisGrouping} · ${d.config.yAxisAggregation.toLowerCase()}`
                    : d.config.type === 'category'
                    ? `Grouped by column`
                    : `${d.config.metrics.length} metric${d.config.metrics.length !== 1 ? 's' : ''}`
                }
                actions={buildWidgetActions(d)}
              >
                <CustomDashboardWidget
                  dashboard={d}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
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

      {isOrgAdmin && (
        <ArchiveRestoreModal
          isOpen={archiveModalOpen}
          onClose={() => setArchiveModalOpen(false)}
          title="Archived Dashboards"
          items={archivedDashboards.map(d => ({ id: d.id, name: d.name, updatedAt: d.updatedAt ? new Date(d.updatedAt) : undefined }))}
          onRestore={async (id) => {
            await restoreMutation.mutateAsync(id);
            return true;
          }}
          fetchItems={() => {}}
        />
      )}
    </main>
  );
};

export default DashboardPage;
