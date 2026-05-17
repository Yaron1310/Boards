import React, { useReducer, useState } from 'react';
import { FiArchive, FiEdit2, FiTrash2, FiPlusCircle } from 'react-icons/fi';
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

  // Action buttons for each dashboard widget (rendered in WidgetCard header)
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
          <FiEdit2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => archiveMutation.mutate(d.id)}
          className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
          aria-label={`Archive ${d.name}`}
        >
          <FiArchive size={14} aria-hidden="true" />
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
            <FiTrash2 size={14} aria-hidden="true" />
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
                <FiArchive size={16} aria-hidden="true" />
                Archived
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                aria-label="Add custom dashboard"
              >
                <FiPlusCircle size={16} aria-hidden="true" />
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
