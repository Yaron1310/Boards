import React, { useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { FiEdit2, FiArchive, FiTrash2, FiLock, FiEye, FiX } from 'react-icons/fi';
import {
  useCustomDashboards,
  useDeleteCustomDashboard,
  useArchiveCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import WidgetCard from '../dashboard/WidgetCard';
import CustomDashboardWidget from '../dashboard/widgets/CustomDashboardWidget';
import AddCustomDashboardModal from '../dashboard/AddCustomDashboardModal';
import type { DashboardActiveFilter, FilterState, FilterAction } from '../dashboard/DashboardFilterBar';
import type { CustomDashboard } from '../../types';

interface Props {
  boardId: string;
  boardName: string;
  isAdmin: boolean;
  /** Dashboard filter state — lifted to the parent so its controls can live in the main header. */
  filters: FilterState;
  dispatch: React.Dispatch<FilterAction>;
}

/** Imperative handle so the "Add Dashboard" button (in the board's main header) can open the create modal here. */
export interface BoardDashboardHandle {
  openCreate: () => void;
}

/** Exported so the board's main header can render dashboard-filter chips alongside its own controls. */
export const DashboardFilterChip: React.FC<{ filter: DashboardActiveFilter; onRemove: () => void }> = ({ filter, onRemove }) => {
  const label =
    filter.type === 'date'      ? filter.value :
    filter.type === 'user'      ? filter.label :
    filter.type === 'status'    ? filter.label :
    filter.type === 'tag'       ? filter.value :
    filter.type === 'timerange' ? `${filter.start} → ${filter.end}` : '';

  return (
    <div className="flex items-center gap-1 pl-2 pr-1 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
      {filter.type === 'status' && (
        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: filter.color }} aria-hidden="true" />
      )}
      <span className="max-w-[110px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-indigo-400 hover:text-indigo-700 flex-shrink-0 p-0.5 rounded-full hover:bg-indigo-200 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <FiX size={10} aria-hidden="true" />
      </button>
    </div>
  );
};

const BoardDashboardView = forwardRef<BoardDashboardHandle, Props>(({ boardId, boardName, isAdmin, filters }, ref) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<CustomDashboard | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openCreate = () => { setEditingDashboard(undefined); setModalOpen(true); };
  useImperativeHandle(ref, () => ({ openCreate }), []);

  const { data: allDashboards = [] } = useCustomDashboards(false);
  const deleteMutation = useDeleteCustomDashboard();
  const archiveMutation = useArchiveCustomDashboard();

  const boardDashboards = useMemo(() => allDashboards.filter(d => {
    if (d.config.type === 'metric') return d.config.metrics.some(m => m.boardId === boardId);
    if (d.config.type === 'timeseries') {
      const cfg = d.config;
      return cfg.boardId === boardId || (cfg.series ?? []).some(s => s.boardId === boardId);
    }
    return (d.config as { boardId: string }).boardId === boardId;
  }), [allDashboards, boardId]);

  const timeRangeFilter = filters.filters.find(
    (f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange',
  );
  const dateFilterValue = filters.filters.find(
    (f): f is { type: 'date'; value: string } => f.type === 'date',
  )?.value;
  const dateFrom = timeRangeFilter?.start ?? dateFilterValue;
  const dateTo = timeRangeFilter?.end;

  const openEdit = (d: CustomDashboard) => { setEditingDashboard(d); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingDashboard(undefined); };

  const buildWidgetActions = (d: CustomDashboard) => {
    if (!isAdmin) return undefined;
    return (
      <>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); openEdit(d); }}
          className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
          aria-label={`Edit ${d.name}`}
        >
          <FiEdit2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); archiveMutation.mutate(d.id); }}
          className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
          aria-label={`Archive ${d.name}`}
        >
          <FiArchive size={14} aria-hidden="true" />
        </button>
        {confirmDeleteId === d.id ? (
          <div className="flex items-center gap-1" role="group" aria-label="Confirm delete">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); deleteMutation.mutate(d.id); setConfirmDeleteId(null); }}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setConfirmDeleteId(d.id); }}
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
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      {/* Filter controls and the Add Dashboard button now live in the board's main
          header row (see BoardViewPage) — this view renders only the widgets. */}
      <main className="flex-1 px-6 py-6" aria-label={`${boardName} dashboards`}>
        {boardDashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <svg viewBox="0 0 24 24" className="w-12 h-12 mb-4 opacity-25" fill="none" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" fill="currentColor" />
              <path d="M14 2.25A10 10 0 0 1 22 10h-8V2.25z" fill="currentColor" opacity="0.5" />
            </svg>
            <p className="text-base font-medium">No dashboards for this board yet</p>
            {isAdmin && (
              <p className="text-sm mt-1">Click <strong>Add Dashboard</strong> to create one.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-7xl mx-auto">
            {boardDashboards.map(d => (
              <WidgetCard
                key={d.id}
                title={d.name}
                titleIcon={d.visibility === 'admins_only'
                  ? <FiLock size={13} className="text-gray-400 flex-shrink-0" aria-label="Admins only" />
                  : <FiEye size={13} className="text-gray-400 flex-shrink-0" aria-label="All users" />
                }
                subtitle={
                  d.config.type === 'timeseries'
                    ? `By ${d.config.xAxisGrouping} · ${d.config.yAxisAggregation.toLowerCase()}`
                    : d.config.type === 'category'
                    ? 'Grouped by column'
                    : `${d.config.metrics.length} metric${d.config.metrics.length !== 1 ? 's' : ''}`
                }
                boardNames={[boardName]}
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
        )}
      </main>

      {modalOpen && (
        <AddCustomDashboardModal
          onClose={closeModal}
          existing={editingDashboard}
          lockedBoardId={boardId}
          lockedBoardName={boardName}
        />
      )}
    </div>
  );
});

BoardDashboardView.displayName = 'BoardDashboardView';

export default BoardDashboardView;
