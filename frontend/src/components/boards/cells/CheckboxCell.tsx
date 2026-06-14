import React from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import type { Item, Column } from '../../../types';

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
    <div
      role="gridcell"
      aria-label={column.name}
      className="flex items-center justify-center min-w-[120px] px-3 py-2 border-r border-gray-100 last:border-r-0"
    >
      <input
        type="checkbox"
        checked={checked}
        readOnly
        disabled={isPending}
        onClick={toggle}
        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-60"
        aria-label={`Toggle ${column.name}`}
      />
    </div>
  );
};

const CheckboxCell = React.memo(CheckboxCellInner);
export default CheckboxCell;
