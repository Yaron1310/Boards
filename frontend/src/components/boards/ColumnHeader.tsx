import React, { useState } from 'react';
import { useColumns } from '../../hooks/queries/useColumnQueries';
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
  [ColumnType.TEXT]:          <FiType size={13} aria-hidden="true" />,
  [ColumnType.NUMBER]:        <FiHash size={13} aria-hidden="true" />,
  [ColumnType.DATE]:          <FiCalendar size={13} aria-hidden="true" />,
  [ColumnType.STATUS]:        <FiFlag size={13} aria-hidden="true" />,
  [ColumnType.PERSON]:        <FiUser size={13} aria-hidden="true" />,
  [ColumnType.DROPDOWN]:      <FiChevronDown size={13} aria-hidden="true" />,
  [ColumnType.CHECKBOX]:      <FiCheckSquare size={13} aria-hidden="true" />,
  [ColumnType.TAGS]:          <FiTag size={13} aria-hidden="true" />,
  [ColumnType.TIME]:          <FiClock size={13} aria-hidden="true" />,
  [ColumnType.EMAIL]:         <FiMail size={13} aria-hidden="true" />,
  [ColumnType.PHONE]:         <FiPhone size={13} aria-hidden="true" />,
  [ColumnType.LOCATION]:      <FiMapPin size={13} aria-hidden="true" />,
  [ColumnType.TIME_RANGE]:    <FiClock size={13} aria-hidden="true" />,
  [ColumnType.SIMPLE_FORMULA]: <FiZap size={13} aria-hidden="true" />,
};

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  [ColumnType.TEXT]:          'Text',
  [ColumnType.NUMBER]:        'Number',
  [ColumnType.DATE]:          'Date',
  [ColumnType.STATUS]:        'Status',
  [ColumnType.PERSON]:        'Person',
  [ColumnType.DROPDOWN]:      'Dropdown',
  [ColumnType.CHECKBOX]:      'Checkbox',
  [ColumnType.TAGS]:          'Tags',
  [ColumnType.TIME]:          'Time',
  [ColumnType.EMAIL]:         'Email',
  [ColumnType.PHONE]:         'Phone',
  [ColumnType.LOCATION]:      'Location',
  [ColumnType.TIME_RANGE]:    'Time Range',
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

  return (
    <div
      role="columnheader"
      className="flex items-center gap-1.5 min-w-[120px] px-3 py-2 border-r border-gray-200 last:border-r-0 group"
    >
      {/* Drag handle — visual only; DnD wired in Phase 7F */}
      {canManage && (
        <span
          className="opacity-0 group-hover:opacity-40 text-gray-400 cursor-grab flex-shrink-0"
          aria-hidden="true"
        >
          <FiMenu size={12} />
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
  const [sort, setSort] = useState<SortState | null>(null);

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

      {/* Dynamic columns */}
      {columns.map((col) => (
        <ColumnHeaderCell
          key={col.id}
          column={col}
          sort={sort}
          onSort={handleSort}
          canManage={canManage}
        />
      ))}

      {/* Add column button */}
      {canManage && (
        <div role="columnheader" className="flex items-center px-2 py-2">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
            aria-label="Add new column (available in Column Management)"
            onClick={() => {/* AddColumnModal — Phase 7E */}}
            title="Manage columns in Admin → Columns"
          >
            <FiPlus size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ColumnHeader;
