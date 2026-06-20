import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FiChevronDown, FiChevronRight, FiMoreHorizontal, FiPlus,
  FiEdit2, FiTrash2, FiLoader, FiMenu, FiArchive, FiLink,
  FiChevronsLeft, FiChevronLeft, FiChevronRight as FiChevronRightNav,
  FiCheckSquare, FiSquare,
} from 'react-icons/fi';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCreateItem, useGroupItems } from '../../hooks/queries/useItemQueries';
import { useUpdateGroup, useArchiveGroup, useRestoreGroup } from '../../hooks/queries/useGroupQueries';
import { useUndo } from '../../contexts/UndoContext';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type { Group, Item, StatusColumnSettings } from '../../types';
import ItemRow from './ItemRow';
import GroupSummaryRow from './GroupSummaryRow';
import GroupWebhookModal from './GroupWebhookModal';
import { COLUMN_TYPE_ICONS, ITEM_COL_ID } from './ColumnHeader';
import { calculateColumnWidth, DRAG_HANDLE_WIDTH } from '../../utils/columnWidths';
import { useBoardRender } from '../../contexts/BoardRenderContext';

interface GroupSectionProps {
  group: Group;
  boardId: string;
  workspaceId: string;
  canManage: boolean;
  /** Filtered/sorted items for display — supplied by parent after applying search & filters */
  items: Item[];
  onOpenDetail: (item: Item) => void;
  pageSize: number;
  onPageItemsChange: (groupId: string, items: Item[]) => void;
}

const GroupSection: React.FC<GroupSectionProps> = ({
  group,
  boardId,
  workspaceId,
  canManage,
  items,
  onOpenDetail,
  pageSize,
  onPageItemsChange,
}) => {
  const { user } = useAuthSession();
  const { data: columns = [] } = useColumns(boardId);
  const { columnWidths } = useBoardRender();
  const groupSectionWidth = (columnWidths[ITEM_COL_ID] ?? 298) - 16;

  const isCollapsed = group.isCollapsed ?? false;

  const { mutateAsync: updateGroup, isPending: isUpdating } = useUpdateGroup();
  const { mutateAsync: archiveGroup, isPending: isArchiving } = useArchiveGroup();
  const { mutateAsync: restoreGroup } = useRestoreGroup();
  const { mutateAsync: createItem, isPending: isCreatingItem } = useCreateItem();
  const { push: pushUndo } = useUndo();

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(group.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const addItemInputRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  // Maps page index → cursor needed to fetch that page (page 0 = undefined)
  const [cursorMap, setCursorMap] = useState<Record<number, string | undefined>>({ 0: undefined });
  const [pendingJumpToLast, setPendingJumpToLast] = useState(false);
  // Manual pagination toggle (from context menu); auto-enables when total > 100
  const [manualPagination, setManualPagination] = useState(false);

  const cursor = cursorMap[currentPage];

  // total starts at 0 on first render; paginationEnabled derived after first fetch
  const [knownTotal, setKnownTotal] = useState(0);
  const paginationEnabled = knownTotal > 100 || manualPagination;
  const effectivePageSize = paginationEnabled ? pageSize : 10000;

  const { data: groupItemsPage, isFetching } = useGroupItems(
    group.id,
    cursor,
    effectivePageSize,
    !isCollapsed,
  );

  const total = groupItemsPage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  // Keep knownTotal up to date so paginationEnabled reacts to first-fetch result
  useEffect(() => {
    if (total > 0) setKnownTotal(total);
  }, [total]);

  // Cache the next-page cursor whenever we receive it
  useEffect(() => {
    if (groupItemsPage?.hasMore && groupItemsPage.cursor) {
      setCursorMap((prev) => ({ ...prev, [currentPage + 1]: groupItemsPage.cursor! }));
    }
  }, [groupItemsPage, currentPage]);

  // Notify parent of the raw (unfiltered) server items so DnD and export work
  const stableOnPageItemsChange = useCallback(onPageItemsChange, [onPageItemsChange]);
  useEffect(() => {
    if (groupItemsPage?.data) {
      stableOnPageItemsChange(group.id, groupItemsPage.data);
    }
  }, [groupItemsPage?.data, group.id, stableOnPageItemsChange]);

  // After creating an item jump to the last page so the new item is visible
  useEffect(() => {
    if (pendingJumpToLast && !isFetching && totalPages > 0) {
      setCurrentPage(totalPages - 1);
      setPendingJumpToLast(false);
    }
  }, [pendingJumpToLast, isFetching, totalPages]);

  // Reset to page 0 when effective page size changes (window resize or pagination toggle)
  const prevEffectivePageSizeRef = useRef(effectivePageSize);
  useEffect(() => {
    if (prevEffectivePageSizeRef.current !== effectivePageSize) {
      prevEffectivePageSizeRef.current = effectivePageSize;
      setCurrentPage(0);
      setCursorMap({ 0: undefined });
    }
  }, [effectivePageSize]);

  // Auto-go-back to previous page when current page becomes empty (e.g. all items deleted)
  useEffect(() => {
    if (!isFetching && currentPage > 0 && (groupItemsPage?.data?.length ?? 0) === 0) {
      goToPage(currentPage - 1);
    }
  }, [isFetching, currentPage, groupItemsPage?.data?.length, goToPage]);

  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
  }, [totalPages]);

  // Mouse-wheel navigation when hovering over the group rows
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || totalPages <= 1) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) goToPage(currentPage + 1);
      else goToPage(currentPage - 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [totalPages, currentPage, goToPage]);

  const {
    attributes: groupDragAttributes,
    listeners: groupDragListeners,
    setNodeRef: setGroupRef,
    transform: groupTransform,
    transition: groupTransition,
    isDragging: isGroupDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group' as const, group },
  });

  const groupStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(groupTransform),
    transition: groupTransition,
    opacity: isGroupDragging ? 0.5 : 1,
  };

  useEffect(() => {
    setNameValue(group.name);
  }, [group.name]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    if (addingItem) addItemInputRef.current?.focus();
  }, [addingItem]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const toggleCollapse = async () => {
    await updateGroup({ boardId, groupId: group.id, patch: { isCollapsed: !isCollapsed } });
  };

  const commitNameEdit = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === group.name) {
      setNameValue(group.name);
      return;
    }
    const prevName = group.name;
    pushUndo({ label: `Renamed group "${prevName}" to "${trimmed}"`, undo: () => { void updateGroup({ boardId, groupId: group.id, patch: { name: prevName } }); } });
    await updateGroup({ boardId, groupId: group.id, patch: { name: trimmed } }).catch(() => {
      setNameValue(group.name);
    });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void commitNameEdit();
    if (e.key === 'Escape') {
      setEditingName(false);
      setNameValue(group.name);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    setConfirmDelete(false);
    const groupId = group.id;
    const groupName = group.name;
    await archiveGroup({ boardId, groupId });
    pushUndo({
      label: `Deleted group "${groupName}"`,
      undo: () => { void restoreGroup({ boardId, groupId }); },
    });
  };

  const handleArchive = async () => {
    setMenuOpen(false);
    setConfirmArchive(false);
    await archiveGroup({ boardId, groupId: group.id });
  };

  const handleAddItem = async () => {
    const trimmed = newItemName.trim();
    if (!trimmed || !user) return;
    const defaultValues: Record<string, unknown> = {};
    for (const col of columns) {
      if (col.type === ColumnType.STATUS) {
        const settings = col.settings as StatusColumnSettings;
        if (settings.defaultStatusId) defaultValues[col.id] = settings.defaultStatusId;
      }
    }
    await createItem({
      name: trimmed,
      workspaceId,
      boardId,
      groupId: group.id,
      ...(Object.keys(defaultValues).length > 0 ? { values: defaultValues } : {}),
    });
    setNewItemName('');
    setAddingItem(false);
    setPendingJumpToLast(true);
  };

  const handleAddItemKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleAddItem();
    if (e.key === 'Escape') {
      setAddingItem(false);
      setNewItemName('');
    }
  };

  const groupColor = group.color ?? '#6366f1';
  const itemIds = items.map((i) => i.id);
  const showPagination = totalPages > 1;

  return (
    <div
      ref={setGroupRef}
      style={groupStyle}
      className="flex flex-col pt-8"
      aria-label={`Group: ${group.name}`}
    >
      {/* Group title — sticky, floats above the table grid */}
      <div
        className={`sticky left-4 w-fit flex items-center gap-2 pb-2 ${menuOpen ? 'z-[30]' : 'z-[2]'}`}
      >
        {/* Group drag handle */}
        {canManage && (
          <div
            className="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            aria-label="Drag to reorder group"
            aria-grabbed={isGroupDragging}
            {...groupDragAttributes}
            {...groupDragListeners}
          >
            <FiMenu size={14} aria-hidden="true" />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => void toggleCollapse()}
          disabled={isUpdating}
          className="flex items-center justify-center w-6 h-6 rounded transition-opacity flex-shrink-0 opacity-80 hover:opacity-100"
          style={{ color: groupColor }}
          aria-label={isCollapsed ? `Expand group ${group.name}` : `Collapse group ${group.name}`}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed
            ? <FiChevronRight size={20} aria-hidden="true" />
            : <FiChevronDown size={20} aria-hidden="true" />}
        </button>

        {/* Group name */}
        {editingName && canManage ? (
          <input
            ref={nameInputRef}
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => void commitNameEdit()}
            onKeyDown={handleNameKeyDown}
            disabled={isUpdating}
            className="text-xl font-bold bg-transparent border-b-2 outline-none min-w-0 max-w-[240px]"
            style={{ color: groupColor, borderColor: groupColor }}
            aria-label="Edit group name"
          />
        ) : (
          <h2
            className={`text-xl font-bold truncate max-w-[240px] ${
              canManage ? 'cursor-pointer' : ''
            }`}
            style={{ color: groupColor }}
            onClick={() => canManage && setEditingName(true)}
            title={canManage ? 'Click to rename' : undefined}
          >
            {group.name}
          </h2>
        )}

        {/* Pagination nav (replaces plain item count when multiple pages exist) */}
        {showPagination ? (
          <div className="flex items-center gap-1 flex-shrink-0" aria-label={`Page ${currentPage + 1} of ${totalPages}`}>
            <button
              type="button"
              onClick={() => goToPage(0)}
              disabled={currentPage === 0}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default transition-colors"
              aria-label="First page"
            >
              <FiChevronsLeft size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default transition-colors"
              aria-label="Previous page"
            >
              <FiChevronLeft size={13} aria-hidden="true" />
            </button>
            <span className="text-xs text-gray-500 whitespace-nowrap px-1 select-none">
              {isFetching
                ? <FiLoader className="inline animate-spin" size={11} aria-label="Loading" />
                : `Page ${currentPage + 1} of ${totalPages}`}
            </span>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default transition-colors"
              aria-label="Next page"
            >
              <FiChevronRightNav size={13} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-400 flex-shrink-0" aria-label={`${total} items`}>
            {isFetching ? <FiLoader className="inline animate-spin" size={12} aria-hidden="true" /> : total || ''}
          </span>
        )}

        {/* Kebab menu */}
        {canManage && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
              aria-label={`Group options for ${group.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <FiMoreHorizontal size={14} aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1 w-36 border border-gray-200 rounded-lg shadow-lg z-[50] py-1 select-text"
                style={{ backgroundColor: 'white' }}
                aria-label="Group actions"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditingName(true);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Rename group"
                >
                  <FiEdit2 size={13} aria-hidden="true" />
                  Rename
                </button>

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={manualPagination}
                  onClick={() => setManualPagination((v) => !v)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Toggle pagination for this group"
                >
                  {manualPagination
                    ? <FiCheckSquare size={13} aria-hidden="true" className="text-indigo-600" />
                    : <FiSquare size={13} aria-hidden="true" />}
                  Pagination
                </button>

                {confirmArchive ? (
                  <div className="px-3 py-2 space-y-1">
                    <p className="text-xs text-amber-600">Archive this group?</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void handleArchive()}
                        disabled={isArchiving}
                        className="flex-1 px-2 py-1 text-xs text-white bg-amber-500 rounded hover:bg-amber-600 transition-colors disabled:opacity-60"
                        aria-label="Confirm archive group"
                      >
                        {isArchiving ? '…' : 'Archive'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmArchive(false)}
                        className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        aria-label="Cancel archive"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmArchive(true)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
                    aria-label="Archive group"
                  >
                    <FiArchive size={13} aria-hidden="true" />
                    Archive
                  </button>
                )}

                {confirmDelete ? (
                  <div className="px-3 py-2 space-y-1">
                    <p className="text-xs text-red-600">Delete this group?</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={isArchiving}
                        className="flex-1 px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                        aria-label="Confirm delete group"
                      >
                        {isArchiving ? '…' : 'Delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                        aria-label="Cancel delete"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Delete group"
                  >
                    <FiTrash2 size={13} aria-hidden="true" />
                    Delete
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setWebhookModalOpen(true); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label="Create or manage webhook for this group"
                >
                  <FiLink size={13} aria-hidden="true" />
                  Webhook
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Board table */}
      <section
        ref={sectionRef}
        className="rounded-lg border border-gray-200 bg-white w-max shadow-md"
        aria-label={`Items in group ${group.name}`}
      >
        {/* Column headers row */}
        <div
          className="flex flex-nowrap items-stretch border-b border-[#d2d2d4] bg-gray-50 w-max rounded-t-lg"
          role="row"
          aria-label={`Column headers for ${group.name}`}
        >
          {/* Left alignment placeholder — matches ItemRow left section */}
          <div
            className="flex-shrink-0 border-r border-[#d2d2d4] sticky left-4 bg-gray-50 z-[1] rounded-tl-lg"
            style={{ width: `${groupSectionWidth}px`, borderLeft: `4px solid ${groupColor}` }}
          />

          {/* Column headers — widths match the top header row */}
          {columns.map((col) => (
            <div
              key={col.id}
              role="columnheader"
              style={{ width: `${columnWidths[col.id] ?? col.width ?? calculateColumnWidth(col.name, col.type)}px` }}
              className="flex flex-shrink-0 items-center justify-center gap-1.5 px-3 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-gray-600"
              title={col.name}
            >
              <span className="text-gray-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
              <span className="truncate">{col.name}</span>
            </div>
          ))}
        </div>

        {/* Item rows */}
        {!isCollapsed && (
          <div role="rowgroup" aria-label={`Items in ${group.name}`} className="w-max">
            {items.length === 0 ? (
              <div className="px-4 py-4 text-xs text-gray-400 italic">
                {isFetching ? 'Loading…' : 'No items yet.'}
              </div>
            ) : (
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onOpenDetail={onOpenDetail}
                    groupColor={groupColor}
                  />
                ))}
              </SortableContext>
            )}

            {/* Add item row */}
            {canManage && (
              <div>
                <div className="sticky left-4 w-max bg-white z-[1]">
                  {addingItem ? (
                    <div className="flex items-center gap-2 px-4 py-2">
                      <input
                        ref={addItemInputRef}
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={handleAddItemKeyDown}
                        onBlur={() => {
                          if (newItemName.trim()) {
                            void handleAddItem();
                          } else {
                            setAddingItem(false);
                          }
                        }}
                        placeholder="Item name… (Enter to save, Esc to cancel)"
                        disabled={isCreatingItem}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        aria-label="New item name"
                        aria-required="true"
                      />
                      {isCreatingItem && (
                        <FiLoader className="animate-spin text-indigo-500 flex-shrink-0" size={14} aria-hidden="true" />
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingItem(true)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/60 transition-colors"
                      aria-label={`Add item to ${group.name}`}
                    >
                      <FiPlus size={13} aria-hidden="true" />
                      Add Item
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sum / average summary row */}
            <GroupSummaryRow items={items} columns={columns} />
          </div>
        )}

        {/* Collapsed summary bar */}
        {isCollapsed && (
          <div
            className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-[#d2d2d4]"
            aria-label={`${group.name} collapsed — ${total} items`}
          >
            {total} item{total !== 1 ? 's' : ''} hidden
          </div>
        )}
      </section>

      {webhookModalOpen && (
        <GroupWebhookModal
          boardId={boardId}
          groupId={group.id}
          groupName={group.name}
          onClose={() => setWebhookModalOpen(false)}
        />
      )}
    </div>
  );
};

export default GroupSection;
