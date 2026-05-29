import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useBoard, useUpdateBoard } from '../../hooks/queries/useBoardQueries';
import { useGroups, useReorderGroups } from '../../hooks/queries/useGroupQueries';
import { useReorderItems, useUpdateItem } from '../../hooks/queries/useItemQueries';
import { usePageSize } from '../../hooks/usePageSize';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useBoardSnapshot } from '../../hooks/useBoardSnapshot';
import { UserRole, ColumnType } from '../../types';
import type { Group, Item } from '../../types';
import type { ReorderItemUpdate } from '../../services/workManagementService';
import { FiLoader, FiArchive, FiChevronLeft, FiPlus, FiMenu, FiSearch, FiUserPlus, FiX, FiUpload, FiList, FiRotateCcw, FiChevronDown } from 'react-icons/fi';
import { UndoProvider, useUndo } from '../../contexts/UndoContext';
import { exportBoardToXlsx } from '../../utils/exportBoardToXlsx';
import ColumnHeader, { ITEM_COL_ID } from './ColumnHeader';
import GanttView from './GanttView';
import GroupSection from './GroupSection';
import AddGroupForm from './AddGroupForm';
import ItemDetailPanel from './ItemDetailPanel';
import AddColumnModal from './AddColumnModal';
import BoardArchiveModal from './BoardArchiveModal';
import BoardFilterDropdown, { itemMatchesSearch, itemMatchesFilters } from './BoardFilterDropdown';
import type { ActiveFilter } from './BoardFilterDropdown';
import BoardInviteModal from './BoardInviteModal';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { FormulaEditProvider } from '../../contexts/FormulaEditContext';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import type { BoardView } from '../../contexts/BoardRenderContext';
import { DependencyProvider, useDependency } from '../../contexts/DependencyContext';
import DependencyOverlay from './DependencyOverlay';
import DependencyApplyModal from './DependencyApplyModal';

type DragData =
  | { type: 'group'; group: Group }
  | { type: 'item'; item: Item };

const UndoButton: React.FC = () => {
  const { history, canUndo, undo } = useUndo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative flex flex-shrink-0" ref={ref}>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => undo()}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-l-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${canUndo ? 'text-red-700 border-red-300 hover:bg-red-50' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        aria-label={canUndo ? `Undo: ${history[0]?.label}` : 'Nothing to undo'}
        title={canUndo ? `Undo: ${history[0]?.label} (Ctrl+Z)` : 'Nothing to undo (Ctrl+Z)'}
      >
        <FiRotateCcw size={13} aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center px-1.5 py-1.5 text-sm border border-l-0 rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${canUndo ? 'text-red-700 border-red-300 hover:bg-red-50' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        aria-label="Show undo history"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FiChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 w-max min-w-[200px] max-w-[min(560px,calc(100vw-2rem))] bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto"
          role="listbox"
          aria-label="Undo history"
        >
          {history.map((action, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={false}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors whitespace-nowrap"
              onClick={() => { undo(i + 1); setOpen(false); }}
            >
              <FiRotateCcw size={11} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Chip shown in the top bar for each active filter
const FilterChip: React.FC<{ filter: ActiveFilter; onRemove: () => void }> = ({ filter, onRemove }) => {
  const label =
    filter.type === 'date'      ? filter.value :
    filter.type === 'user'      ? filter.label :
    filter.type === 'status'    ? filter.label :
    filter.type === 'timerange' ? `${filter.start} → ${filter.end}` :
    filter.value;

  return (
    <div className="flex items-center gap-1 pl-2 pr-1 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
      {filter.type === 'status' && (
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: filter.color }}
          aria-hidden="true"
        />
      )}
      <span className="max-w-[90px] truncate">{label}</span>
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
// Inner component — lives inside DependencyProvider so it can use useDependency
// ---------------------------------------------------------------------------

interface BoardContentProps {
  boardId: string;
  board: import('../../types').Board;
  canManage: boolean;
  groupsLoading: boolean;
  localGroups: Group[];
  localItemsByGroup: Record<string, Item[]>;
  showAddGroup: boolean;
  setShowAddGroup: (v: boolean) => void;
  activeDrag: DragData | null;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (e: import('@dnd-kit/core').DragStartEvent) => void;
  handleDragOver: (e: import('@dnd-kit/core').DragOverEvent) => void;
  handleDragEnd: (e: import('@dnd-kit/core').DragEndEvent) => void;
  setDetailItem: (item: Item | null) => void;
  setShowAddColumn: (v: boolean) => void;
  allItems: Item[];
  searchText: string;
  activeFilters: ActiveFilter[];
  boardView: BoardView;
  onGanttItemUpdate: (itemId: string, groupId: string, colId: string, start: string, end: string) => void;
  pageSize: number;
  onPageItemsChange: (groupId: string, items: Item[]) => void;
  columnWidths: Record<string, number>;
  onWidthChange: (columnId: string, width: number) => void;
}

type SortState = { columnId: string; direction: 'asc' | 'desc' };

function compareItemValues(a: unknown, b: unknown, colType: ColumnType, direction: 'asc' | 'desc'): number {
  const mult = direction === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  switch (colType) {
    case ColumnType.NUMBER:
    case ColumnType.SIMPLE_FORMULA:
      return (Number(a) - Number(b)) * mult;
    case ColumnType.CHECKBOX:
      return ((a ? 1 : 0) - (b ? 1 : 0)) * mult;
    case ColumnType.TAGS:
      return (Array.isArray(a) ? (a[0] ?? '') : String(a))
        .localeCompare(Array.isArray(b) ? (b[0] ?? '') : String(b)) * mult;
    case ColumnType.TIME_RANGE: {
      const aStart = (a as { start?: string } | null)?.start ?? '';
      const bStart = (b as { start?: string } | null)?.start ?? '';
      if (!aStart && !bStart) return 0;
      if (!aStart) return mult;
      if (!bStart) return -mult;
      return aStart.localeCompare(bStart) * mult;
    }
    case ColumnType.TIME: {
      const toMins = (v: unknown) => {
        const parts = String(v).split(':').map(Number);
        return (isNaN(parts[0]) ? 0 : parts[0]) * 60 + (isNaN(parts[1]) ? 0 : parts[1]);
      };
      return (toMins(a) - toMins(b)) * mult;
    }
    default:
      return String(a).localeCompare(String(b)) * mult;
  }
}

const BoardContent: React.FC<BoardContentProps> = ({
  boardId,
  board,
  canManage,
  groupsLoading,
  localGroups,
  localItemsByGroup,
  showAddGroup,
  setShowAddGroup,
  activeDrag,
  sensors,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  setDetailItem,
  setShowAddColumn,
  allItems,
  searchText,
  activeFilters,
  boardView,
  onGanttItemUpdate,
  pageSize,
  onPageItemsChange,
  columnWidths,
  onWidthChange,
}) => {
  const { data: columns = [] } = useColumns(boardId);
  const { data: allUsers = [] } = useUsersQuery({ limit: 200 });
  const [sort, setSort] = React.useState<SortState | null>(null);

  const sortedItemsByGroup = React.useMemo<Record<string, Item[]>>(() => {
    if (!sort) return localItemsByGroup;
    if (sort.columnId === ITEM_COL_ID) {
      const mult = sort.direction === 'asc' ? 1 : -1;
      const result: Record<string, Item[]> = {};
      for (const [gid, items] of Object.entries(localItemsByGroup)) {
        result[gid] = [...items].sort((a, b) => a.name.localeCompare(b.name) * mult);
      }
      return result;
    }
    const col = columns.find((c) => c.id === sort.columnId);
    if (!col) return localItemsByGroup;
    const result: Record<string, Item[]> = {};
    for (const [gid, items] of Object.entries(localItemsByGroup)) {
      result[gid] = [...items].sort((a, b) =>
        compareItemValues(a.values[sort.columnId], b.values[sort.columnId], col.type, sort.direction),
      );
    }
    return result;
  }, [sort, localItemsByGroup, columns]);

  const displayItemsByGroup = React.useMemo<Record<string, Item[]>>(() => {
    if (!searchText && activeFilters.length === 0) return sortedItemsByGroup;
    const result: Record<string, Item[]> = {};
    for (const [gid, items] of Object.entries(sortedItemsByGroup)) {
      result[gid] = items.filter(
        (item) =>
          itemMatchesSearch(item, columns, allUsers, searchText) &&
          itemMatchesFilters(item, columns, activeFilters),
      );
    }
    return result;
  }, [searchText, activeFilters, sortedItemsByGroup, columns, allUsers]);

  const {
    boardContainerRef,
    drawState,
    setDrawMouse,
    removeDependency,
    circularDepDetected,
    clearCircularDepFlag,
    pendingApplyDep,
    clearPendingApplyDep,
    addJustCreatedDepIds,
  } = useDependency();

  const [showCircularToast, setShowCircularToast] = React.useState(false);

  React.useEffect(() => {
    if (!circularDepDetected) return;
    setShowCircularToast(true);
    const t = setTimeout(() => { setShowCircularToast(false); clearCircularDepFlag(); }, 3000);
    return () => clearTimeout(t);
  }, [circularDepDetected, clearCircularDepFlag]);

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawState) return;
    // SVG is position:fixed so we use raw viewport coordinates directly
    setDrawMouse(e.clientX, e.clientY);
  }, [drawState, setDrawMouse]);

  const groupIds = localGroups.map((g) => g.id);

  // Flatten visible items in display order for formula cell addressing
  const visibleItems = useMemo(() => {
    const items: Item[] = [];
    for (const group of localGroups) {
      const groupItems = displayItemsByGroup[group.id] ?? [];
      items.push(...groupItems);
    }
    return items;
  }, [localGroups, displayItemsByGroup]);

  return (
    <div className="flex-1 relative min-h-0">
      <div className="absolute inset-y-0 left-0 w-4 bg-gray-50 z-[20] pointer-events-none" aria-hidden="true" />

      {/* SVG overlay — only in table/rows views; Gantt has no cells to connect */}
      {boardView !== 'gantt' && <DependencyOverlay />}

      {boardView === 'gantt' ? (
        <GanttView
          groups={localGroups}
          itemsByGroup={displayItemsByGroup}
          columns={columns}
          onItemUpdate={onGanttItemUpdate}
        />
      ) : (
        <div
          ref={boardContainerRef as React.RefObject<HTMLDivElement>}
          className="h-full overflow-x-auto overflow-y-auto"
          role="grid"
          aria-label={`Board: ${board.name}`}
          onMouseMove={handleMouseMove}
        >
          <ColumnHeader
            boardId={boardId}
            canManage={canManage}
            onSortChange={setSort}
            onAddColumn={() => setShowAddColumn(true)}
            boardView={boardView}
            columnWidths={columnWidths}
            onWidthChange={onWidthChange}
          />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="p-4 space-y-4" role="region" aria-label="Board groups">
              {groupsLoading ? (
                <div className="flex justify-center items-center py-16" role="status" aria-label="Loading groups">
                  <FiLoader className="animate-spin h-6 w-6 text-indigo-400" aria-hidden="true" />
                </div>
              ) : localGroups.length === 0 && !showAddGroup ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  <p>No groups yet. Add a group to start organising items.</p>
                </div>
              ) : (
                <BoardRenderProvider visibleItems={visibleItems} columns={columns} boardView={boardView} columnWidths={columnWidths}>
                  <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                    {localGroups.map((group) => (
                      <GroupSection
                        key={group.id}
                        group={group}
                        boardId={board.id}
                        workspaceId={board.workspaceId}
                        canManage={canManage && !board.isArchived}
                        items={displayItemsByGroup[group.id] ?? []}
                        onOpenDetail={setDetailItem}
                        pageSize={pageSize}
                        onPageItemsChange={onPageItemsChange}
                      />
                    ))}
                  </SortableContext>
                </BoardRenderProvider>
              )}

              {canManage && !board.isArchived && showAddGroup && boardId && (
                <AddGroupForm boardId={boardId} onClose={() => setShowAddGroup(false)} />
              )}
            </div>

            <DragOverlay>
              {activeDrag?.type === 'group' && (
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-300 rounded-lg shadow-xl opacity-90 cursor-grabbing select-none"
                  style={{ borderLeft: `4px solid ${activeDrag.group.color ?? '#6366f1'}` }}
                  aria-hidden="true"
                >
                  <FiMenu size={13} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-800">{activeDrag.group.name}</span>
                </div>
              )}
              {activeDrag?.type === 'item' && (
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-indigo-300 rounded shadow-xl opacity-90 cursor-grabbing select-none"
                  aria-hidden="true"
                >
                  <span className="text-sm text-gray-800">{activeDrag.item.name}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {canManage && !board.isArchived && !showAddGroup && (
            <div className="px-4 pb-6">
              <div className="sticky left-4 w-max">
                <button
                  type="button"
                  onClick={() => setShowAddGroup(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                  aria-label="Add new group"
                >
                  <FiPlus size={15} aria-hidden="true" />
                  Add Group
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Circular dependency toast */}
      {showCircularToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none"
        >
          Circular dependency detected — connection cancelled
        </div>
      )}

      {/* Apply-to-group prompt */}
      {pendingApplyDep && (
        <DependencyApplyModal
          newDep={pendingApplyDep}
          items={allItems}
          onClose={clearPendingApplyDep}
          onCancel={() => {
            removeDependency(pendingApplyDep);
            clearPendingApplyDep();
          }}
          onApply={addJustCreatedDepIds}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const BoardViewPage: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user, selectedWorkspace } = useAuthSession();

  const pageSize = usePageSize();
  const { data: board, isLoading, error } = useBoard(boardId ?? '', !!boardId);
  const { data: groups = [], isLoading: groupsLoading } = useGroups(boardId ?? '', !!boardId);
  const { data: columns = [] } = useColumns(boardId ?? '');
  const { data: allUsersForExport = [] } = useUsersQuery({ limit: 200 });

  const { mutateAsync: updateBoard, isPending: isSaving } = useUpdateBoard();
  const { mutateAsync: reorderGroups } = useReorderGroups();
  const { mutateAsync: reorderItems } = useReorderItems();
  const { mutate: updateItemMutate } = useUpdateItem();

  // Real-time updates via Firestore onSnapshot (requires Firebase custom token auth)
  useBoardSnapshot(boardId, selectedWorkspace?.orgId ?? user?.orgId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [searchText, setSearchText] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [boardView, setBoardView] = useState<BoardView>(() => {
    const key = `boardView:${user?.id ?? 'anon'}:${boardId ?? ''}`;
    const saved = localStorage.getItem(key);
    return (saved === 'table' || saved === 'rows' || saved === 'gantt') ? saved : 'table';
  });
  const setAndPersistBoardView = (view: BoardView) => {
    const key = `boardView:${user?.id ?? 'anon'}:${boardId ?? ''}`;
    localStorage.setItem(key, view);
    setBoardView(view);
  };

  // Local optimistic state for DnD
  const [localGroups, setLocalGroups] = useState<Group[]>([]);
  const [localItemsByGroup, setLocalItemsByGroup] = useState<Record<string, Item[]>>({});
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);

  // Refs to hold latest server state for optimistic revert
  const serverGroupsRef = useRef<Group[]>([]);
  const serverItemsByGroupRef = useRef<Record<string, Item[]>>({});

  // Track the dragged item's current group (updated during onDragOver)
  const activeItemCurrentGroupRef = useRef<string | null>(null);
  // Track the dragged item's original group (set on onDragStart)
  const activeItemOriginalGroupRef = useRef<string | null>(null);

  const canManage =
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN;

  // Called by each GroupSection when it fetches a new page; keeps localItemsByGroup in sync for DnD/export
  const handlePageItemsChange = useCallback((groupId: string, items: Item[]) => {
    setLocalItemsByGroup((prev) => {
      if (prev[groupId] === items) return prev;
      const next = { ...prev, [groupId]: items };
      serverItemsByGroupRef.current = next;
      return next;
    });
  }, []);

  // Called by GanttView when a bar is resized — updates local state immediately
  // and persists to DB, so the same data source is reflected in both views.
  const handleGanttItemUpdate = React.useCallback(
    (itemId: string, groupId: string, colId: string, start: string, end: string) => {
      setLocalItemsByGroup((prev) => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).map((it) =>
          it.id === itemId
            ? { ...it, values: { ...it.values, [colId]: { start, end } } }
            : it,
        ),
      }));
      updateItemMutate({ id: itemId, patch: { values: { [colId]: { start, end } } } });
    },
    [updateItemMutate],
  );

  // Flat list of all items across groups — used by DependencyProvider
  const allItems = useMemo(() => Object.values(localItemsByGroup).flat(), [localItemsByGroup]);

  // Column widths — persisted in localStorage; initialized from server column.width on first load
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem(`colWidths:${boardId ?? ''}`);
      return stored ? (JSON.parse(stored) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  // Seed widths from server column.width the first time columns arrive
  useEffect(() => {
    if (!columns.length) return;
    setColumnWidths((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const col of columns) {
        if (col.width !== undefined && next[col.id] === undefined) {
          next[col.id] = col.width;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columns]);

  const handleWidthChange = useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [columnId]: width };
      try {
        localStorage.setItem(`colWidths:${boardId ?? ''}`, JSON.stringify(next));
      } catch { /* storage full — ignore */ }
      return next;
    });
  }, [boardId]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!board) return;
    setIsExporting(true);
    try {
      await exportBoardToXlsx(board, localGroups, columns, localItemsByGroup, allUsersForExport);
    } finally {
      setIsExporting(false);
    }
  }, [board, localGroups, columns, localItemsByGroup, allUsersForExport]);

  // Sync local state from server
  useEffect(() => {
    const sorted = [...groups].sort((a, b) => a.order - b.order);
    // Only update if changed
    if (JSON.stringify(sorted) !== JSON.stringify(serverGroupsRef.current)) {
      setLocalGroups(sorted);
      serverGroupsRef.current = sorted;
    }
  }, [groups]);


  useEffect(() => {
    if (board) setNameValue(board.name);
  }, [board]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const hasTimeRange = columns.some((c) => c.type === ColumnType.TIME_RANGE);

  useEffect(() => {
    if (boardView === 'gantt' && !hasTimeRange) setAndPersistBoardView('table');
  }, [boardView, hasTimeRange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const commitNameEdit = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || !boardId || trimmed === board?.name) return;
    await updateBoard({ id: boardId, patch: { name: trimmed } }).catch(() => {
      if (board) setNameValue(board.name);
    });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitNameEdit();
    if (e.key === 'Escape') {
      setEditingName(false);
      if (board) setNameValue(board.name);
    }
  };

  // --- DnD handlers ---

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    setActiveDrag(data);
    if (data.type === 'item') {
      activeItemCurrentGroupRef.current = data.item.groupId;
      activeItemOriginalGroupRef.current = data.item.groupId;
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as DragData | undefined;
    if (activeData?.type !== 'item') return;

    const overData = over.data.current as DragData | undefined;

    const fromGroupId = activeItemCurrentGroupRef.current;
    if (!fromGroupId) return;

    let toGroupId: string;

    if (overData?.type === 'item') {
      // Hovering over another item — find its current group in local state
      let found: string | null = null;
      for (const [gid, its] of Object.entries(localItemsByGroup)) {
        if (its.some((i) => i.id === over.id)) { found = gid; break; }
      }
      if (!found) return;
      toGroupId = found;
    } else if (overData?.type === 'group') {
      toGroupId = String(over.id);
    } else {
      return;
    }

    if (fromGroupId === toGroupId) return;

    // Update tracker before state mutation
    activeItemCurrentGroupRef.current = toGroupId;

    setLocalItemsByGroup((prev) => {
      const fromItems = [...(prev[fromGroupId] ?? [])];
      const toItems = [...(prev[toGroupId] ?? [])];
      const itemIdx = fromItems.findIndex((i) => i.id === active.id);
      if (itemIdx === -1) return prev;

      const [movedItem] = fromItems.splice(itemIdx, 1);
      const updatedItem = { ...movedItem, groupId: toGroupId };

      if (overData?.type === 'item') {
        const insertIdx = toItems.findIndex((i) => i.id === over.id);
        toItems.splice(insertIdx === -1 ? toItems.length : insertIdx, 0, updatedItem);
      } else {
        toItems.push(updatedItem);
      }

      return { ...prev, [fromGroupId]: fromItems, [toGroupId]: toItems };
    });
  }, [localItemsByGroup]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    const drag = activeDrag;
    const originalGroupId = activeItemOriginalGroupRef.current;
    const currentGroupId = activeItemCurrentGroupRef.current;

    setActiveDrag(null);
    activeItemCurrentGroupRef.current = null;
    activeItemOriginalGroupRef.current = null;

    if (!over) return;

    if (drag?.type === 'group') {
      if (active.id === over.id) return;
      const oldIndex = localGroups.findIndex((g) => g.id === active.id);
      const newIndex = localGroups.findIndex((g) => g.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const newGroups = arrayMove(localGroups, oldIndex, newIndex);
      setLocalGroups(newGroups);

      const orderUpdates = newGroups.map((g, i) => ({ id: g.id, order: i }));
      reorderGroups({ boardId: boardId!, order: orderUpdates }).catch(() => {
        setLocalGroups(serverGroupsRef.current);
      });

    } else if (drag?.type === 'item') {
      if (!currentGroupId) return;

      if (originalGroupId === currentGroupId) {
        // Same-group reorder: arrayMove in local state then persist
        if (active.id === over.id) return;
        const groupItems = [...(localItemsByGroup[currentGroupId] ?? [])];
        const oldIdx = groupItems.findIndex((i) => i.id === active.id);
        const newIdx = groupItems.findIndex((i) => i.id === over.id);
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

        const newItems = arrayMove(groupItems, oldIdx, newIdx);
        setLocalItemsByGroup((prev) => ({ ...prev, [currentGroupId]: newItems }));

        const updates: ReorderItemUpdate[] = newItems.map((item, i) => ({
          id: item.id,
          groupId: currentGroupId,
          order: i,
        }));
        reorderItems(updates).catch(() => {
          setLocalItemsByGroup(serverItemsByGroupRef.current);
        });

      } else {
        // Cross-group: item already moved in onDragOver; just persist both groups
        const fromItems = localItemsByGroup[originalGroupId ?? ''] ?? [];
        const toItems = localItemsByGroup[currentGroupId] ?? [];

        const updates: ReorderItemUpdate[] = [
          ...fromItems.map((item, i) => ({ id: item.id, groupId: originalGroupId ?? '', order: i })),
          ...toItems.map((item, i) => ({ id: item.id, groupId: currentGroupId, order: i })),
        ];
        reorderItems(updates).catch(() => {
          setLocalItemsByGroup(serverItemsByGroupRef.current);
        });
      }
    }
  }, [activeDrag, localGroups, localItemsByGroup, boardId, reorderGroups, reorderItems]);

  // --- Render ---

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label="Loading board">
        <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="p-6" role="alert">
        <p className="text-red-600">Failed to load board.</p>
      </div>
    );
  }

  return (
    <UndoProvider>
      <div className="flex flex-col h-full min-h-0">
        {/* Board top bar */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(board.isTemplate ? '/admin/templates' : `/WorkHubs/${board.workspaceId}/boards`)}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded p-1"
            aria-label="Go back"
          >
            <FiChevronLeft size={18} aria-hidden="true" />
          </button>

          <div className="flex-shrink-0 min-w-0 max-w-[260px]">
            {editingName && canManage ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => void commitNameEdit()}
                onKeyDown={handleNameKeyDown}
                disabled={isSaving}
                className="text-xl font-bold text-gray-800 bg-transparent border-b-2 border-indigo-500 outline-none w-full"
                aria-label="Edit board name"
              />
            ) : (
              <h1
                className={`text-xl font-bold text-gray-800 truncate ${canManage ? 'cursor-pointer hover:text-indigo-600 transition-colors' : ''}`}
                onClick={() => canManage && setEditingName(true)}
                aria-label={`Board: ${board.name}${canManage ? '. Click to rename.' : ''}`}
                title={canManage ? 'Click to rename' : undefined}
              >
                {board.name}
                {board.isArchived && (
                  <span className="ml-2 text-sm font-normal text-gray-400">(archived)</span>
                )}
              </h1>
            )}
            {board.description && !editingName && (
              <p className="text-sm text-gray-500 truncate mt-0.5">{board.description}</p>
            )}
          </div>

          {/* Search + filter row */}
          <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
            <div className="relative">
              <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search items…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-44 pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-label="Search items by any field value"
              />
            </div>

            <BoardFilterDropdown
              boardId={boardId ?? ''}
              allItems={allItems}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />

            {/* Active filter chips */}
            {activeFilters.map((f, i) => (
              <FilterChip
                key={`${f.type}-${i}`}
                filter={f}
                onRemove={() => {
                  if (f.type === 'timerange') {
                    setActiveFilters((prev) => prev.filter((x) => x.type !== 'timerange'));
                  } else {
                    const val = (f as { value: string }).value;
                    setActiveFilters((prev) => prev.filter((x) => !(x.type === f.type && (x as { value?: string }).value === val)));
                  }
                }}
              />
            ))}

            {/* Clear all */}
            {(searchText.trim() !== '' || activeFilters.length > 0) && (
              <button
                type="button"
                onClick={() => { setSearchText(''); setActiveFilters([]); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors flex-shrink-0"
                aria-label="Clear all filters and search"
              >
                <FiX size={11} aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View switcher — icon toggle group */}
            <div
              className="flex items-center border border-gray-300 rounded-lg overflow-hidden"
              role="group"
              aria-label="Board view"
            >
              <button
                type="button"
                onClick={() => setAndPersistBoardView('table')}
                className={`flex items-center justify-center px-2.5 py-1.5 transition-colors ${boardView === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                aria-label="Table view"
                aria-pressed={boardView === 'table'}
                title="Table"
              >
                {/* 3×3 grid in a rectangle */}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="1" y="1" width="12" height="12" rx="1" />
                  <line x1="5" y1="1" x2="5" y2="13" />
                  <line x1="9" y1="1" x2="9" y2="13" />
                  <line x1="1" y1="5" x2="13" y2="5" />
                  <line x1="1" y1="9" x2="13" y2="9" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setAndPersistBoardView('rows')}
                className={`flex items-center justify-center px-2.5 py-1.5 border-l border-gray-300 transition-colors ${boardView === 'rows' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                aria-label="Rows view"
                aria-pressed={boardView === 'rows'}
                title="Rows"
              >
                <FiList size={14} aria-hidden="true" />
              </button>
              {hasTimeRange && (
                <button
                  type="button"
                  onClick={() => setAndPersistBoardView('gantt')}
                  className={`flex items-center justify-center px-2.5 py-1.5 border-l border-gray-300 transition-colors ${boardView === 'gantt' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                  aria-label="Gantt view"
                  aria-pressed={boardView === 'gantt'}
                  title="Gantt"
                >
                  {/* Horizontal bar chart — represents a Gantt timeline */}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                    <rect x="1" y="2" width="7" height="2.5" rx="0.8" />
                    <rect x="4" y="6" width="8" height="2.5" rx="0.8" />
                    <rect x="2" y="10" width="5" height="2.5" rx="0.8" />
                  </svg>
                </button>
              )}
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
                aria-label="Invite users to this board"
              >
                <FiUserPlus size={13} aria-hidden="true" />
                Invite
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setShowArchiveModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                aria-label="View archived groups and items"
              >
                <FiArchive size={13} aria-hidden="true" />
                Archived
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Export board to Excel file"
            >
              <FiUpload size={13} aria-hidden="true" />
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
            <UndoButton />
          </div>
        </div>

        {/* Board content area with horizontal scrolling */}
        <FormulaEditProvider>
        <DependencyProvider items={allItems}>
          <BoardContent
            boardId={boardId ?? ''}
            board={board}
            canManage={canManage}
            groupsLoading={groupsLoading}
            localGroups={localGroups}
            localItemsByGroup={localItemsByGroup}
            showAddGroup={showAddGroup}
            setShowAddGroup={setShowAddGroup}
            activeDrag={activeDrag}
            sensors={sensors}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragEnd={handleDragEnd}
            setDetailItem={setDetailItem}
            setShowAddColumn={setShowAddColumn}
            allItems={allItems}
            searchText={searchText}
            activeFilters={activeFilters}
            boardView={boardView}
            onGanttItemUpdate={handleGanttItemUpdate}
            pageSize={pageSize}
            onPageItemsChange={handlePageItemsChange}
            columnWidths={columnWidths}
            onWidthChange={handleWidthChange}
          />
        </DependencyProvider>
        </FormulaEditProvider>
      </div>

      {detailItem && (
        <FormulaEditProvider>
          <DependencyProvider items={allItems}>
            <BoardRenderProvider visibleItems={allItems} columns={columns}>
              <ItemDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
            </BoardRenderProvider>
          </DependencyProvider>
        </FormulaEditProvider>
      )}

      {showAddColumn && boardId && (
        <AddColumnModal boardId={boardId} onClose={() => setShowAddColumn(false)} />
      )}

      {showArchiveModal && boardId && (
        <BoardArchiveModal boardId={boardId} onClose={() => setShowArchiveModal(false)} />
      )}

      {showInviteModal && boardId && board && (
        <BoardInviteModal
          boardId={boardId}
          workspaceId={board.workspaceId}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </UndoProvider>
  );
};

export default BoardViewPage;
