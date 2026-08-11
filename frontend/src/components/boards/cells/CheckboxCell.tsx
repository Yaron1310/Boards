import React from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useBoardRender } from '../../../contexts/BoardRenderContext';
import type { Item, Column } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const CheckboxCellInner: React.FC<Props> = ({ item, column }) => {
  const checked = Boolean(item.values[column.id]);
  const { mutate, isPending } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  // The wrapper is told isReadOnly so the input can own its click — which also means
  // the wrapper's own read-only gate never applies here. Check it directly instead.
  const { isBoardReadOnly } = useBoardRender();

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
          disabled={isPending || isBoardReadOnly}
          onClick={isBoardReadOnly ? undefined : toggle}
          className={`w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 ${
            isBoardReadOnly ? 'disabled:opacity-100' : 'cursor-pointer disabled:opacity-60'
          }`}
          aria-label={`Toggle ${column.name}`}
        />
      )}
    </CellWrapper>
  );
};

const CheckboxCell = React.memo(CheckboxCellInner);
export default CheckboxCell;
