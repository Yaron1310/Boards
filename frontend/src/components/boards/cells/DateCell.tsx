import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, DateColumnSettings } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const toInputValue = (val: string | Date | null | undefined, includeTime: boolean): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  if (includeTime) {
    // datetime-local format: YYYY-MM-DDTHH:mm
    return d.toISOString().slice(0, 16);
  }
  return d.toISOString().slice(0, 10);
};

const formatDisplay = (val: string | Date | null | undefined, includeTime: boolean): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return includeTime
    ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString([], { dateStyle: 'medium' });
};

const DateCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as string | Date | null | undefined;
  const settings = column.settings as DateColumnSettings;
  const includeTime = settings?.includeTime ?? false;
  const { mutate } = useUpdateItem();
  const [draft, setDraft] = useState<string>(toInputValue(rawValue, includeTime));

  useEffect(() => {
    setDraft(toInputValue(rawValue, includeTime));
  }, [rawValue, includeTime]);

  const commit = (stopEdit: () => void) => {
    const next = draft ? new Date(draft).toISOString() : null;
    const current = rawValue ? new Date(rawValue as string).toISOString() : null;
    if (next !== current) {
      mutate({ id: item.id, patch: { values: { [column.id]: next } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type={includeTime ? 'datetime-local' : 'date'}
              value={draft}
              autoFocus
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(stopEdit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                if (e.key === 'Escape') { setDraft(toInputValue(rawValue, includeTime)); stopEdit(); }
              }}
              aria-label={column.name}
            />
          );
        }
        const display = formatDisplay(rawValue, includeTime);
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full">
            {display || <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default DateCell;
