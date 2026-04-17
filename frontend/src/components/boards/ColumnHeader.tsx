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
import { useColumns, useReorderColumns } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type { Column } from '../../types';
import {
  FiType, FiHash, FiCalendar, FiFlag, FiUser, FiChevronDown,
  FiCheckSquare, FiTag, FiClock, FiMail, FiPhone, FiMapPin,
  FiZap, FiPlus, FiArrowUp, FiArrowDown, FiLoader, FiMenu,
} from 'react-icons/fi';

interface SortState {
  columnId: string;
  direction: 'asc' | 'desc';
}

interface ColumnHeaderProps {
  canManage: boolean;
  onSortChange?: (sort: SortState | null) => void;
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
}

const ColumnHeaderCell: React.FC<ColumnHeaderCellProps> = ({ column, sort, onSort, canManage }) => {
  const isActive = sort?.columnId === column.id;
  const icon = COLUMN_TYPE_ICONS[column.type];
  const label = COLUMN_TYPE_LABELS[column.type];

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="columnheader"
      className={`flex items-center gap-1.5 min-w-[120px] px-3 py-2 border-r border-gray-200 last:border-r-0 group${isDragging ? ' bg-indigo-50' : ''}`}
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
    </div>
  );
};

const ColumnHeader: React.FC<ColumnHeaderProps> = ({ canManage, onSortChange }) => {
  const { data: columns = [], isLoading } = useColumns();
  const { mutateAsync: reorderColumns } = useReorderColumns();
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
        className="sticky top-0 z-10 flex items-stretch bg-gray-50 border-b border-gray-200 select-none"
        role="row"
        aria-label="Column headers"
      >
        {/* Item name column — fixed */}
        <div
          role="columnheader"
          className="flex items-center px-4 py-2 min-w-[240px] border-r border-gray-200 text-xs font-semibold text-gray-600 bg-gray-50"
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
            />
          ))}
        </SortableContext>

        {/* Add column button */}
        {canManage && (
          <div role="columnheader" className="flex items-center px-2 py-2">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              aria-label="Add new column (available in Column Management)"
              onClick={() => {/* AddColumnModal — available in Column Management page */}}
              title="Manage columns in Admin → Columns"
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
