import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, TimeRangeValue } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const formatDate = (val: string | Date | null | undefined): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { dateStyle: 'short' });
};

const TimeRangeCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as TimeRangeValue | null | undefined;
  const { mutate } = useUpdateItem();
  const [start, setStart] = useState(toDateInput(rawValue?.start));
  const [end, setEnd] = useState(toDateInput(rawValue?.end));

  useEffect(() => {
    setStart(toDateInput(rawValue?.start));
    setEnd(toDateInput(rawValue?.end));
  }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const nextStart = start ? new Date(start).toISOString() : null;
    const nextEnd = end ? new Date(end).toISOString() : null;
    mutate({
      id: item.id,
      patch: { values: { [column.id]: { start: nextStart, end: nextEnd } } },
    });
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <div className="flex items-center gap-1 px-2 py-1 w-full">
              <input
                type="date"
                value={start}
                autoFocus
                className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-indigo-400"
                onChange={(e) => setStart(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setStart(toDateInput(rawValue?.start)); setEnd(toDateInput(rawValue?.end)); stopEdit(); }
                }}
                aria-label={`${column.name} start date`}
              />
              <span className="text-gray-400 text-xs flex-shrink-0">→</span>
              <input
                type="date"
                value={end}
                className="flex-1 text-xs border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-indigo-400"
                onChange={(e) => setEnd(e.target.value)}
                onBlur={() => commit(stopEdit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                  if (e.key === 'Escape') { setStart(toDateInput(rawValue?.start)); setEnd(toDateInput(rawValue?.end)); stopEdit(); }
                }}
                aria-label={`${column.name} end date`}
              />
            </div>
          );
        }
        const startDisplay = formatDate(rawValue?.start);
        const endDisplay = formatDate(rawValue?.end);
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full">
            {startDisplay || endDisplay ? (
              <span>{startDisplay || '?'} → {endDisplay || '?'}</span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TimeRangeCell;
