import React, { useReducer, useState, useMemo } from 'react';
import { FiArchive, FiEdit2, FiTrash2, FiPlusCircle, FiX, FiTrello, FiLock, FiEye } from 'react-icons/fi';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useOrgSnapshot } from '../../hooks/useOrgSnapshot';
import DashboardFilterBar, {
  filterReducer,
  toDashboardParams,
  INITIAL_FILTER_STATE,
  DateRangePresetPicker,
} from './DashboardFilterBar';
import type { DashboardActiveFilter } from './DashboardFilterBar';
import WidgetCard from './WidgetCard';
import { useDashboardSummary } from '../../hooks/queries/useDashboardQueries';
import {
  useCustomDashboards,
  useDeleteCustomDashboard,
  useArchiveCustomDashboard,
  useRestoreCustomDashboard,
} from '../../hooks/queries/useCustomDashboardQueries';
import { useBoards } from '../../hooks/queries/useBoardQueries';
import SummaryStatsWidget from './widgets/SummaryStatsWidget';
import CustomDashboardWidget from './widgets/CustomDashboardWidget';
import AddCustomDashboardModal from './AddCustomDashboardModal';
import ArchiveRestoreModal from '../admin/shared/ArchiveRestoreModal';
import { UserRole } from '../../types';
import type { CustomDashboard } from '../../types';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ---------------------------------------------------------------------------
// Filter chip
// ---------------------------------------------------------------------------

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
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: filter.color }}
          aria-hidden="true"
        />
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

// ---------------------------------------------------------------------------
// Sortable widget wrapper
// ---------------------------------------------------------------------------

interface SortableWidgetProps {
  id: string;
  children: React.ReactNode;
}

const SortableWidget: React.FC<SortableWidgetProps> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

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
  const [dashboardOrder, setDashboardOrder] = useState<string[]>([]);

  const isOrgAdmin =
    user?.role === UserRole.ORGANIZATION_ADMIN || user?.role === UserRole.SYSTEM_ADMIN;

  const params = toDashboardParams(filters);
  const { data: summary, isLoading } = useDashboardSummary(params);
  const { data: customDashboards, isLoading: customDashboardsLoading } = useCustomDashboards(false);
  const customDashboardsList = customDashboards ?? [];
  const { data: archivedDashboards = [] } = useCustomDashboards(true);
  const { data: allBoards = [] } = useBoards(undefined, false, customDashboardsList.length > 0);

  const deleteMutation = useDeleteCustomDashboard();
  const archiveMutation = useArchiveCustomDashboard();
  const restoreMutation = useRestoreCustomDashboard();

  const summaryIsEmpty = !isLoading && !summary;

  const openCreate = () => { setEditingDashboard(undefined); setModalOpen(true); };
  const openEdit = (d: CustomDashboard) => { setEditingDashboard(d); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingDashboard(undefined); };

  // Board ID lookup map
  const boardNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const b of allBoards) map[b.id] = b.name;
    return map;
  }, [allBoards]);

  const customDashboardBoardIds = useMemo<string[] | undefined>(() => {
    if (customDashboardsLoading) return undefined;
    const ids = new Set<string>();
    for (const d of customDashboardsList) {
      if (d.config.type === 'metric') {
        d.config.metrics.forEach((m) => ids.add(m.boardId));
      } else {
        ids.add((d.config as { boardId: string }).boardId);
      }
    }
    return [...ids];
  }, [customDashboardsList, customDashboardsLoading]);

  // Ordered list of dashboards (respects manual drag-and-drop order)
  const orderedDashboards = useMemo(() => {
    if (dashboardOrder.length === 0) return customDashboardsList;
    const byId = new Map(customDashboardsList.map((d) => [d.id, d]));
    const ordered = dashboardOrder.map((id) => byId.get(id)).filter(Boolean) as CustomDashboard[];
    const newItems = customDashboardsList.filter((d) => !dashboardOrder.includes(d.id));
    return [...ordered, ...newItems];
  }, [customDashboardsList, dashboardOrder]);

  const getBoardNamesForDashboard = (d: CustomDashboard): string[] => {
    let ids: string[];
    if (d.config.type === 'metric') {
      ids = [...new Set(d.config.metrics.map((m) => m.boardId))];
    } else {
      ids = [(d.config as { boardId: string }).boardId];
    }
    return ids.map((id) => boardNameById[id]).filter(Boolean);
  };

  const isDashboardSourceMissing = (d: CustomDashboard): boolean => {
    if (customDashboardsLoading) return false;
    let ids: string[];
    if (d.config.type === 'metric') {
      ids = [...new Set(d.config.metrics.map((m) => m.boardId))];
    } else if (d.config.type === 'timeseries') {
      ids = [d.config.boardId, ...(d.config.series ?? []).map((s) => s.boardId)];
    } else {
      ids = [(d.config as { boardId: string }).boardId];
    }
    return ids.some((id) => !boardNameById[id]);
  };

  const timeRangeFilter = filters.filters.find(
    (f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange',
  );
  const dateFilterValue = filters.filters.find(
    (f): f is { type: 'date'; value: string } => f.type === 'date',
  )?.value;
  const dateFrom = timeRangeFilter?.start ?? dateFilterValue;
  const dateTo = timeRangeFilter?.end;

  const buildWidgetActions = (d: CustomDashboard) => {
    if (!isOrgAdmin) return undefined;

    return (
      <>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openEdit(d); }}
          className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
          aria-label={`Edit ${d.name}`}
        >
          <FiEdit2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); archiveMutation.mutate(d.id); }}
          className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
          aria-label={`Archive ${d.name}`}
        >
          <FiArchive size={14} aria-hidden="true" />
        </button>
        {confirmDeleteId === d.id ? (
          <div className="flex items-center gap-1" role="group" aria-label="Confirm delete">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(d.id); setConfirmDeleteId(null); }}
              className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
              className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              aria-label="Cancel delete"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(d.id); }}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
            aria-label={`Delete ${d.name}`}
          >
            <FiTrash2 size={14} aria-hidden="true" />
          </button>
        )}
      </>
    );
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = orderedDashboards.map((d) => d.id);
    const oldIndex = currentOrder.indexOf(active.id as string);
    const newIndex = currentOrder.indexOf(over.id as string);
    setDashboardOrder(arrayMove(currentOrder, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col min-h-full bg-gray-100" aria-label="Dashboard page">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gray-100 px-6 pt-6 pb-4 shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {/* Title + Filter button */}
            <div className="flex items-center gap-4 min-w-0">
              <h1 className="text-3xl font-bold text-gray-800 flex items-center whitespace-nowrap">
                <FiTrello
                  className="mr-3 text-blue-500 flex-shrink-0"
                  style={{ transform: 'rotate(180deg)' }}
                  aria-hidden="true"
                />
                Dashboards
              </h1>
              <DateRangePresetPicker filters={filters} dispatch={dispatch} />
              <DashboardFilterBar filters={filters} dispatch={dispatch} boardIds={customDashboardBoardIds} />
            </div>

            {/* Right-side action buttons */}
            <div className="flex items-center gap-3 flex-shrink-0">
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

          {/* Active filter chips — timerange is shown via the preset picker, skip it here */}
          {filters.filters.some((f) => f.type !== 'timerange') && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {filters.filters.filter((f) => f.type !== 'timerange').map((f, i) => (
                <FilterChip
                  key={`${f.type}-${i}`}
                  filter={f}
                  onRemove={() => dispatch({ type: 'REMOVE_FILTER', filter: f })}
                />
              ))}
              <button
                type="button"
                onClick={() => dispatch({ type: 'CLEAR' })}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors flex-shrink-0"
                aria-label="Clear all filters"
              >
                <FiX size={11} aria-hidden="true" />
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <main className="px-6 pb-6 flex flex-col gap-6" aria-label="Dashboard">
        <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
          {/* Summary stats — org admins only */}
          {isOrgAdmin && (
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
          )}

          {/* No dashboards message for non-admins with nothing visible */}
          {!isOrgAdmin && !customDashboardsLoading && orderedDashboards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <FiTrello size={40} className="mb-4 opacity-30" style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />
              <p className="text-lg font-medium">You have no available dashboards</p>
            </div>
          )}

          {/* Custom dashboards with drag-and-drop */}
          {orderedDashboards.length > 0 && (
            <section aria-label="Custom dashboards">
              <h2 className="text-base font-semibold text-gray-700 mb-3">Custom Dashboards</h2>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedDashboards.map((d) => d.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {orderedDashboards.map((d) => {
                      const sourceMissing = isDashboardSourceMissing(d);
                      return (
                        <SortableWidget key={d.id} id={d.id}>
                          <WidgetCard
                            title={d.name}
                            titleIcon={d.visibility === 'admins_only'
                              ? <FiLock size={13} className="text-gray-400 flex-shrink-0" aria-label="Admins only" />
                              : <FiEye size={13} className="text-gray-400 flex-shrink-0" aria-label="All users" />
                            }
                            subtitle={
                              d.config.type === 'timeseries'
                                ? `By ${d.config.xAxisGrouping} · ${d.config.yAxisAggregation.toLowerCase()}`
                                : d.config.type === 'category'
                                ? `Grouped by column`
                                : `${d.config.metrics.length} metric${d.config.metrics.length !== 1 ? 's' : ''}`
                            }
                            boardNames={getBoardNamesForDashboard(d)}
                            actions={buildWidgetActions(d)}
                            sourceMissing={sourceMissing}
                          >
                            {!sourceMissing && (
                              <CustomDashboardWidget
                                dashboard={d}
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                              />
                            )}
                          </WidgetCard>
                        </SortableWidget>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          )}
        </div>
      </main>

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
    </div>
  );
};

export default DashboardPage;
