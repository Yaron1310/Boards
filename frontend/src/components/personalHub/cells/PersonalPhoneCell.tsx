import React, { useEffect, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import { getTextDir } from '../../../utils/textDir';
import type { Column } from '../../../types';
import type { PersonalCellProps } from './types';

const PersonalPhoneCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable, userId }) => {
  const rawValue = (value ?? '') as string;
  const { mutate } = useUpdatePersonalItemValue(userId);
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState(rawValue);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: rawValue }) });
      mutate({ itemId, columnId: column.id, value: draft });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type="tel"
              value={draft}
              autoFocus
              dir={getTextDir(draft)}
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
          <div className="px-3 py-2 text-sm truncate w-full text-center">
            {rawValue ? (
              <a href={`tel:${rawValue}`} className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()} aria-label={`Call ${rawValue}`}>
                {rawValue}
              </a>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default React.memo(PersonalPhoneCell);
