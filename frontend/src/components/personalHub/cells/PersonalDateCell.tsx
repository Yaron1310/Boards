import React, { useEffect, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { DateColumnSettings, Column } from '../../../types';
import type { PersonalCellProps } from './types';

const toInputValue = (val: string | Date | null | undefined, includeTime: boolean): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  return includeTime ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10);
};

const formatDisplay = (val: string | Date | null | undefined, includeTime: boolean): string => {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val as string);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (includeTime) {
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
  return `${dd}/${mm}/${yyyy}`;
};

const PersonalDateCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable }) => {
  const rawValue = value as string | Date | null | undefined;
  const settings = column.settings as DateColumnSettings;
  const includeTime = settings?.includeTime ?? false;
  const { mutate } = useUpdatePersonalItemValue();
  const { push: pushUndo } = useUndo();
  const [draft, setDraft] = useState<string>(toInputValue(rawValue, includeTime));

  useEffect(() => { setDraft(toInputValue(rawValue, includeTime)); }, [rawValue, includeTime]);

  const commit = (stopEdit: () => void) => {
    const next = draft ? new Date(draft).toISOString() : null;
    const current = rawValue ? new Date(rawValue as string).toISOString() : null;
    if (next !== current) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: current }) });
      mutate({ itemId, columnId: column.id, value: next });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type={includeTime ? 'datetime-local' : 'date'}
              value={draft}
              autoFocus
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none text-center"
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
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center">
            {display || <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

export default React.memo(PersonalDateCell);
