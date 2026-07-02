import React, { useEffect, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { Column, LocationValue } from '../../../types';
import type { PersonalCellProps } from './types';

const PersonalLocationCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable }) => {
  const rawValue = value as LocationValue | null | undefined;
  const address = rawValue?.address ?? '';
  const { mutate } = useUpdatePersonalItemValue();
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState(address);

  useEffect(() => { setDraft(rawValue?.address ?? ''); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== address) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: rawValue ?? null }) });
      mutate({ itemId, columnId: column.id, value: { address: draft } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
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

export default React.memo(PersonalLocationCell);
