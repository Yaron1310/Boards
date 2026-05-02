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
import { useItems, useReorderItems } from '../../hooks/queries/useItemQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useAuth } from '../../hooks/useAuth';
import { useLiveBoardVersion } from '../../hooks/useLiveBoardVersion';
import { UserRole, ColumnType } from '../../types';
import type { Group, Item } from '../../types';
import type { ReorderItemUpdate } from '../../services/workManagementService';
import { FiLoader, FiArchive, FiChevronLeft, FiPlus, FiMenu } from 'react-icons/fi';
import ColumnHeader from './ColumnHeader';
import GroupSection from './GroupSection';
import AddGroupForm from './AddGroupForm';
import ItemDetailPanel from './ItemDetailPanel';
import AddColumnModal from './AddColumnModal';
import BoardArchiveModal from './BoardArchiveModal';
import { FormulaEditProvider } from '../../contexts/FormulaEditContext';
import { DependencyProvider, useDependency } from '../../contexts/DependencyContext';
import DependencyOverlay from './DependencyOverlay';
import DependencyApplyModal from './DependencyApplyModal';

type DragData =
  | { type: 'group'; group: Group }
  | { type: 'item'; item: Item };

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
}) => {
  const { data: columns = [] } = useColumns(boardId);
  const [sort, setSort] = React.useState<SortState | null>(null);

  const sortedItemsByGroup = React.useMemo<Record<string, Item[]>>(() => {
    if (!sort) return localItemsByGroup;
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

  return (
    <div className="flex-1 relative min-h-0">
      <div className="absolute inset-y-0 left-0 w-4 bg-gray-100 z-[20] pointer-events-none" aria-hidden="true" />

      {/* SVG overlay — position:fixed, renders at viewport level outside all scroll containers */}
      <DependencyOverlay />

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
              <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                {localGroups.map((group) => (
                  <GroupSection
                    key={group.id}
                    group={group}
                    boardId={board.id}
                    workspaceId={board.workspaceId}
                    canManage={canManage && !board.isArchived}
                    items={sortedItemsByGroup[group.id] ?? []}
                    onOpenDetail={setDetailItem}
                  />
                ))}
              </SortableContext>
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
  const { user } = useAuth();

  const itemParams = useMemo(() => ({ boardId: boardId ?? '', limit: 200 }), [boardId]);
  const { data: board, isLoading, error } = useBoard(boardId ?? '', !!boardId);
  const { data: groups = [], isLoading: groupsLoading } = useGroups(boardId ?? '', !!boardId);
  const { data: itemsPage } = useItems(itemParams, !!boardId);

  const { mutateAsync: updateBoard, isPending: isSaving } = useUpdateBoard();
  const { mutateAsync: reorderGroups } = useReorderGroups();
  const { mutateAsync: reorderItems } = useReorderItems();

  // ETag-style live updates — checks version timestamp before pulling full data
  useLiveBoardVersion(boardId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [detailItem, setDetailItem] = useState<Item | null>(null);

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

  // Build items-by-group map from server data
  const serverItemsByGroup = useMemo<Record<string, Item[]>>(() => {
    const map: Record<string, Item[]> = {};
    for (const item of itemsPage?.data ?? []) {
      if (!map[item.groupId]) map[item.groupId] = [];
      map[item.groupId].push(item);
    }
    for (const gid of Object.keys(map)) {
      map[gid].sort((a, b) => a.order - b.order);
    }
    return map;
  }, [itemsPage]);

  // Flat list of all items across groups — used by DependencyProvider
  const allItems = useMemo(() => Object.values(localItemsByGroup).flat(), [localItemsByGroup]);

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
    // Only update if changed
    if (JSON.stringify(serverItemsByGroup) !== JSON.stringify(serverItemsByGroupRef.current)) {
      setLocalItemsByGroup(serverItemsByGroup);
      serverItemsByGroupRef.current = serverItemsByGroup;
    }
  }, [serverItemsByGroup]);

  useEffect(() => {
    if (board) setNameValue(board.name);
  }, [board]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

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
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Board top bar */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/workspaces/${board.workspaceId}/boards`)}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded p-1"
            aria-label="Go back"
          >
            <FiChevronLeft size={18} aria-hidden="true" />
          </button>

          <div className="flex-1 min-w-0">
            {editingName && canManage ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={() => void commitNameEdit()}
                onKeyDown={handleNameKeyDown}
                disabled={isSaving}
                className="text-xl font-bold text-gray-800 bg-transparent border-b-2 border-indigo-500 outline-none w-full max-w-md"
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

          {canManage && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowArchiveModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                aria-label="View archived groups and items"
              >
                <FiArchive size={13} aria-hidden="true" />
                Archived
              </button>
            </div>
          )}
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
          />
        </DependencyProvider>
        </FormulaEditProvider>
      </div>

      {detailItem && (
        <ItemDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      )}

      {showAddColumn && boardId && (
        <AddColumnModal boardId={boardId} onClose={() => setShowAddColumn(false)} />
      )}

      {showArchiveModal && boardId && (
        <BoardArchiveModal boardId={boardId} onClose={() => setShowArchiveModal(false)} />
      )}
    </>
  );
};

export default BoardViewPage;
