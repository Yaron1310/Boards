import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const TimeCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = (item.values[column.id] ?? '') as string;
  const { mutate } = useUpdateItem();
  const [draft, setDraft] = useState(rawValue);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== rawValue) {
      mutate({ id: item.id, patch: { values: { [column.id]: draft } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type="time"
              value={draft}
              autoFocus
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none text-center"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(stopEdit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                if (e.key === 'Escape') { setDraft(rawValue); stopEdit(); }
              }}
              aria-label={column.name}
            />
          );
        }
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center">
            {rawValue || <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default TimeCell;
