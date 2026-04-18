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
import { useBoard, useUpdateBoard, useArchiveBoard, useRestoreBoard } from '../../hooks/queries/useBoardQueries';
import { useGroups, useReorderGroups } from '../../hooks/queries/useGroupQueries';
import { useItems, useReorderItems } from '../../hooks/queries/useItemQueries';
import { useAuth } from '../../hooks/useAuth';
import { useLiveBoardVersion } from '../../hooks/useLiveBoardVersion';
import { UserRole } from '../../types';
import type { Group, Item } from '../../types';
import type { ReorderItemUpdate } from '../../services/workManagementService';
import { FiLoader, FiArchive, FiRotateCcw, FiChevronLeft, FiPlus, FiMenu } from 'react-icons/fi';
import ColumnHeader from './ColumnHeader';
import GroupSection from './GroupSection';
import AddGroupForm from './AddGroupForm';
import ItemDetailPanel from './ItemDetailPanel';

type DragData =
  | { type: 'group'; group: Group }
  | { type: 'item'; item: Item };

const BoardViewPage: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: board, isLoading, error } = useBoard(boardId ?? '', !!boardId);
  const { data: groups = [], isLoading: groupsLoading } = useGroups(boardId ?? '', !!boardId);
  const { data: itemsPage } = useItems({ boardId: boardId ?? '', limit: 200 }, !!boardId);

  const { mutateAsync: updateBoard, isPending: isSaving } = useUpdateBoard();
  const { mutateAsync: archiveBoard, isPending: isArchiving } = useArchiveBoard();
  const { mutateAsync: restoreBoard, isPending: isRestoring } = useRestoreBoard();
  const { mutateAsync: reorderGroups } = useReorderGroups();
  const { mutateAsync: reorderItems } = useReorderItems();

  // ETag-style live updates — checks version timestamp before pulling full data
  useLiveBoardVersion(boardId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
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

  // Sync local state from server
  useEffect(() => {
    const sorted = [...groups].sort((a, b) => a.order - b.order);
    setLocalGroups(sorted);
    serverGroupsRef.current = sorted;
  }, [groups]);

  useEffect(() => {
    setLocalItemsByGroup(serverItemsByGroup);
    serverItemsByGroupRef.current = serverItemsByGroup;
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

  const handleArchive = async () => {
    if (!boardId) return;
    await archiveBoard(boardId);
  };

  const handleRestore = async () => {
    if (!boardId) return;
    await restoreBoard(boardId);
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

  const groupIds = localGroups.map((g) => g.id);

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Board top bar */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
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
              {board.isArchived ? (
                <button
                  type="button"
                  onClick={() => void handleRestore()}
                  disabled={isRestoring}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-60"
                  aria-label="Restore board"
                >
                  <FiRotateCcw size={13} aria-hidden="true" />
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleArchive()}
                  disabled={isArchiving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
                  aria-label="Archive board"
                >
                  <FiArchive size={13} aria-hidden="true" />
                  Archive
                </button>
              )}
            </div>
          )}
        </div>

        {/* Board content area */}
        <div className="flex-1 overflow-auto" role="grid" aria-label={`Board: ${board.name}`}>
          {/* Column header row */}
          <ColumnHeader canManage={canManage} />

          {/* Groups area — wrapped in DnD context for both group and item DnD */}
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
                      items={localItemsByGroup[group.id] ?? []}
                      onOpenDetail={setDetailItem}
                    />
                  ))}
                </SortableContext>
              )}

              {/* Add Group inline form */}
              {canManage && !board.isArchived && showAddGroup && boardId && (
                <AddGroupForm
                  boardId={boardId}
                  onClose={() => setShowAddGroup(false)}
                />
              )}
            </div>

            {/* Drag overlay */}
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

          {/* Add Group button */}
          {canManage && !board.isArchived && !showAddGroup && (
            <div className="px-4 pb-6">
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
          )}
        </div>
      </div>

      {detailItem && (
        <ItemDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </>
  );
};

export default BoardViewPage;
