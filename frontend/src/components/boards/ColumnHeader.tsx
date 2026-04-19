import React, { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useColumns, useReorderColumns, useDeleteColumn, useUpdateColumn } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type { Column } from '../../types';
import {
  FiType, FiHash, FiCalendar, FiFlag, FiUser, FiChevronDown,
  FiCheckSquare, FiTag, FiClock, FiMail, FiPhone, FiMapPin,
  FiZap, FiPlus, FiArrowUp, FiArrowDown, FiLoader, FiMenu, FiMoreVertical, FiTrash2,
} from 'react-icons/fi';
import { COLUMN_WIDTH_MAP, ITEM_NAME_WIDTH } from '../../utils/columnWidths';

interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

interface ColumnHeaderProps {
  boardId: string;
  canManage: boolean;
  onSortChange?: (sort: SortState | null) => void;
  onAddColumn?: () => void;
}

const COLUMN_TYPE_ICONS: Record<ColumnType, React.ReactNode> = {
  [ColumnType.TEXT]:           <FiType size={13} aria-hidden="true" />,
  [ColumnType.NUMBER]:         <FiHash size={13} aria-hidden="true" />,
  [ColumnType.DATE]:           <FiCalendar size={13} aria-hidden="true" />,
  [ColumnType.STATUS]:         <FiFlag size={13} aria-hidden="true" />,
  [ColumnType.PERSON]:         <FiUser size={13} aria-hidden="true" />,
  [ColumnType.DROPDOWN]:       <FiChevronDown size={13} aria-hidden="true" />,
  [ColumnType.CHECKBOX]:       <FiCheckSquare size={13} aria-hidden="true" />,
  [ColumnType.TAGS]:           <FiTag size={13} aria-hidden="true" />,
  [ColumnType.TIME]:           <FiClock size={13} aria-hidden="true" />,
  [ColumnType.EMAIL]:          <FiMail size={13} aria-hidden="true" />,
  [ColumnType.PHONE]:          <FiPhone size={13} aria-hidden="true" />,
  [ColumnType.LOCATION]:       <FiMapPin size={13} aria-hidden="true" />,
  [ColumnType.TIME_RANGE]:     <FiClock size={13} aria-hidden="true" />,
  [ColumnType.SIMPLE_FORMULA]: <FiZap size={13} aria-hidden="true" />,
};

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  [ColumnType.TEXT]:           'Text',
  [ColumnType.NUMBER]:         'Number',
  [ColumnType.DATE]:           'Date',
  [ColumnType.STATUS]:         'Status',
  [ColumnType.PERSON]:         'Person',
  [ColumnType.DROPDOWN]:       'Dropdown',
  [ColumnType.CHECKBOX]:       'Checkbox',
  [ColumnType.TAGS]:           'Tags',
  [ColumnType.TIME]:           'Time',
  [ColumnType.EMAIL]:          'Email',
  [ColumnType.PHONE]:          'Phone',
  [ColumnType.LOCATION]:       'Location',
  [ColumnType.TIME_RANGE]:     'Time Range',
  [ColumnType.SIMPLE_FORMULA]: 'Formula',
};

interface ColumnHeaderCellProps {
  column: Column;
  sort: SortState | null;
  onSort: (col: Column) => void;
  canManage: boolean;
  boardId: string;
}

const ColumnHeaderCell: React.FC<ColumnHeaderCellProps> = ({ column, sort, onSort, canManage, boardId }) => {
  const isActive = sort?.columnId === column.id;
  const icon = COLUMN_TYPE_ICONS[column.type];
  const label = COLUMN_TYPE_LABELS[column.type];
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(column.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: deleteColumn, isPending: isDeleting } = useDeleteColumn(boardId);
  const { mutateAsync: updateColumn, isPending: isUpdating } = useUpdateColumn(boardId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' as const, column },
    disabled: !canManage,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const widthClass = COLUMN_WIDTH_MAP[column.type];

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

  const handleDelete = async () => {
    await deleteColumn(column.id);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  const handleRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === column.name) {
      setIsRenaming(false);
      setNewName(column.name);
      return;
    }
    await updateColumn({ id: column.id, patch: { name: trimmed } });
    setIsRenaming(false);
    setMenuOpen(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleRename();
    if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(column.name);
    }
  };

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="columnheader"
      className={`flex flex-shrink-0 items-center gap-1.5 ${widthClass} px-3 py-2 border-r border-gray-200 last:border-r-0 group${isDragging ? ' bg-indigo-50' : ''}`}
    >
      {/* Drag handle */}
      {canManage && (
        <span
          className="opacity-0 group-hover:opacity-40 text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          aria-label={`Drag to reorder ${column.name} column`}
          aria-grabbed={isDragging}
          {...attributes}
          {...listeners}
        >
          <FiMenu size={12} aria-hidden="true" />
        </span>
      )}

      <span className="text-gray-400 flex-shrink-0" title={label}>
        {icon}
      </span>

      <span className="flex-1 text-xs font-semibold text-gray-600 truncate">
        {column.name}
      </span>

      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 ${
          isActive ? '!opacity-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600'
        }`}
        aria-label={
          isActive
            ? `Sorted by ${column.name} ${sort?.direction === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`
            : `Sort by ${column.name}`
        }
        aria-pressed={isActive}
      >
        {isActive && sort?.direction === 'desc' ? (
          <FiArrowDown size={12} aria-hidden="true" />
        ) : (
          <FiArrowUp size={12} aria-hidden="true" />
        )}
      </button>

      {/* Delete menu */}
      {canManage && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 rounded p-0.5 flex items-center justify-center"
            aria-label={`Options for ${column.name} column`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <FiMoreVertical size={12} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1"
              aria-label="Column actions"
            >
              {isRenaming ? (
                <div className="px-3 py-2 space-y-2">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onBlur={() => void handleRename()}
                    onKeyDown={handleRenameKeyDown}
                    disabled={isUpdating}
                    className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Column name"
                  />
                </div>
              ) : confirmDelete ? (
                <div className="px-3 py-2 space-y-1">
                  <p className="text-xs text-red-600">Delete this column?</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={isDeleting}
                      className="flex-1 px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition-colors disabled:opacity-60"
                      aria-label="Confirm delete"
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      aria-label="Cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setIsRenaming(true)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    aria-label="Rename column"
                  >
                    Edit name
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Delete column"
                  >
                    <FiTrash2 size={12} aria-hidden="true" />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ boardId, canManage, onSortChange, onAddColumn }) => {
  const { data: columns = [], isLoading } = useColumns(boardId);
  const { mutateAsync: reorderColumns } = useReorderColumns(boardId);
  const [sort, setSort] = useState<SortState | null>(null);
  const [localColumns, setLocalColumns] = useState<Column[]>([]);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const serverColumnsRef = useRef<Column[]>([]);

  useEffect(() => {
    setLocalColumns(columns);
    serverColumnsRef.current = columns;
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleSort = (col: Column) => {
    setSort((prev) => {
      if (prev?.columnId === col.id) {
        if (prev.direction === 'asc') {
          const next: SortState = { columnId: col.id, direction: 'desc' };
          onSortChange?.(next);
          return next;
        }
        onSortChange?.(null);
        return null;
      }
      const next: SortState = { columnId: col.id, direction: 'asc' };
      onSortChange?.(next);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; column?: Column } | undefined;
    if (data?.column) setActiveColumn(data.column);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveColumn(null);
    if (!over || active.id === over.id) return;

    const oldIndex = localColumns.findIndex((c) => c.id === active.id);
    const newIndex = localColumns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const newColumns = arrayMove(localColumns, oldIndex, newIndex);
    setLocalColumns(newColumns);

    const orderUpdates = newColumns.map((c, i) => ({ id: c.id, order: i }));
    reorderColumns(orderUpdates).catch(() => {
      setLocalColumns(serverColumnsRef.current);
    });
  };

  const columnIds = localColumns.map((c) => c.id);

  if (isLoading) {
    return (
      <div
        className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-200"
        role="row"
        aria-label="Loading columns"
      >
        <FiLoader className="animate-spin text-gray-400" size={14} aria-hidden="true" />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="sticky top-0 z-10 flex flex-nowrap items-stretch bg-gray-50 border-b border-gray-200 select-none w-max"
        role="row"
        aria-label="Column headers"
      >
        {/* Item name column — fixed */}
        <div
          role="columnheader"
          className={`flex flex-shrink-0 items-center px-4 py-2 ${ITEM_NAME_WIDTH} border-r border-gray-200 text-xs font-semibold text-gray-600 bg-gray-50`}
        >
          Item
        </div>

        {/* Dynamic sortable columns */}
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {localColumns.map((col) => (
            <ColumnHeaderCell
              key={col.id}
              column={col}
              sort={sort}
              onSort={handleSort}
              canManage={canManage}
              boardId={boardId}
            />
          ))}
        </SortableContext>

        {/* Add column button */}
        {canManage && (
          <div role="columnheader" className="flex items-center px-2 py-2">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              aria-label="Add new column"
              onClick={onAddColumn}
              title="Add column"
            >
              <FiPlus size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Drag overlay for column preview */}
      <DragOverlay>
        {activeColumn && (
          <div
            role="columnheader"
            className="flex items-center gap-1.5 min-w-[120px] px-3 py-2 bg-white border border-indigo-300 shadow-lg rounded text-xs font-semibold text-gray-600 cursor-grabbing"
            aria-hidden="true"
          >
            <span className="text-gray-400 flex-shrink-0">
              {COLUMN_TYPE_ICONS[activeColumn.type]}
            </span>
            {activeColumn.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default ColumnHeader;
