import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, LocationValue } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const LocationCellInner: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as LocationValue | null | undefined;
  const address = rawValue?.address ?? '';
  const { mutate } = useUpdateItem();
  const [draft, setDraft] = useState(address);

  useEffect(() => { setDraft(rawValue?.address ?? ''); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== address) {
      mutate({ id: item.id, patch: { values: { [column.id]: { address: draft } } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type="text"
              value={draft}
              autoFocus
              placeholder="Enter address..."
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none text-center"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(stopEdit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                if (e.key === 'Escape') { setDraft(address); stopEdit(); }
              }}
              aria-label={column.name}
            />
          );
        }
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center">
            {address || <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

const LocationCell = React.memo(LocationCellInner);
export default LocationCell;
