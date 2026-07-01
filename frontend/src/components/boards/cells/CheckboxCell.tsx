import React from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import type { Item, Column } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const CheckboxCellInner: React.FC<Props> = ({ item, column }) => {
  const checked = Boolean(item.values[column.id]);
  const { mutate, isPending } = useUpdateItem();
  const { push: pushUndo } = useUndo();

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushUndo({ label: `Toggled "${column.name}" on "${item.name}"`, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: checked } } }) });
    mutate({ id: item.id, patch: { values: { [column.id]: !checked } } });
  };

  return (
    <CellWrapper column={column} isReadOnly>
      {() => (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          disabled={isPending}
          onClick={toggle}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-60"
          aria-label={`Toggle ${column.name}`}
        />
      )}
    </CellWrapper>
  );
};

const CheckboxCell = React.memo(CheckboxCellInner);
export default CheckboxCell;
