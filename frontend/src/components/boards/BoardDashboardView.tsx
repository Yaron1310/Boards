import React, { useState, useMemo, useReducer } from 'react';
import { FiPlusCircle, FiEdit2, FiArchive, FiTrash2, FiLock, FiEye, FiX } from 'react-icons/fi';
import {
  useCustomDashboards,
  useDeleteCustomDashboard,
  useArchiveCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import WidgetCard from '../dashboard/WidgetCard';
import CustomDashboardWidget from '../dashboard/widgets/CustomDashboardWidget';
import AddCustomDashboardModal from '../dashboard/AddCustomDashboardModal';
import DashboardFilterBar, {
  filterReducer,
  INITIAL_FILTER_STATE,
  DateRangePresetPicker,
} from '../dashboard/DashboardFilterBar';
import type { DashboardActiveFilter } from '../dashboard/DashboardFilterBar';
import type { CustomDashboard } from '../../types';

interface Props {
  boardId: string;
  boardName: string;
  isAdmin: boolean;
}

const FilterChip: React.FC<{ filter: DashboardActiveFilter; onRemove: () => void }> = ({ filter, onRemove }) => {
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

const BoardDashboardView: React.FC<Props> = ({ boardId, boardName, isAdmin }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDashboard, setEditingDashboard] = useState<CustomDashboard | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filters, dispatch] = useReducer(filterReducer, INITIAL_FILTER_STATE);

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

  const openCreate = () => { setEditingDashboard(undefined); setModalOpen(true); };
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
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <DateRangePresetPicker filters={filters} dispatch={dispatch} />
          <DashboardFilterBar filters={filters} dispatch={dispatch} boardIds={[boardId]} />
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
            aria-label="Add dashboard widget"
          >
            <FiPlusCircle size={15} aria-hidden="true" />
            Add Dashboard
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {filters.filters.some(f => f.type !== 'timerange') && (
        <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 bg-white border-b border-gray-200">
          {filters.filters.filter(f => f.type !== 'timerange').map((f, i) => (
            <FilterChip
              key={`${f.type}-${i}`}
              filter={f}
              onRemove={() => dispatch({ type: 'REMOVE_FILTER', filter: f })}
            />
          ))}
          <button
            type="button"
            onClick={() => dispatch({ type: 'CLEAR' })}
            className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors"
            aria-label="Clear all filters"
          >
            <FiX size={11} aria-hidden="true" />
            Clear
          </button>
        </div>
      )}

      {/* Content */}
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
};

export default BoardDashboardView;
