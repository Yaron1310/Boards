import React from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { Column } from '../../../types';
import type { PersonalCellProps } from './types';

const PersonalCheckboxCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable }) => {
  const checked = Boolean(value);
  const { mutate, isPending } = useUpdatePersonalItemValue();
  const { push: pushUndo } = useUndo();

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushUndo({ label: `Toggled "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: checked }) });
    mutate({ itemId, columnId: column.id, value: !checked });
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly>
      {() => (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          disabled={isPending || !editable}
          onClick={editable ? toggle : undefined}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-60"
          aria-label={`Toggle ${column.name}`}
        />
      )}
    </CellWrapper>
  );
};

export default React.memo(PersonalCheckboxCell);
