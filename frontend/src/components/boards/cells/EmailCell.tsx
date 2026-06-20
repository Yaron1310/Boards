import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import type { Item, Column } from '../../../types';
import CellWrapper from './CellWrapper';
import { getTextDir } from '../../../utils/textDir';

interface Props { item: Item; column: Column }

const EmailCellInner: React.FC<Props> = ({ item, column }) => {
  const rawValue = (item.values[column.id] ?? '') as string;
  const { mutate } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState(rawValue);

  useEffect(() => { setDraft(rawValue); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    if (draft !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${item.name}"`, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: rawValue } } }) });
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
              type="email"
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
              <a
                href={`mailto:${rawValue}`}
                className="text-indigo-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Email ${rawValue}`}
              >
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

const EmailCell = React.memo(EmailCellInner);
export default EmailCell;
