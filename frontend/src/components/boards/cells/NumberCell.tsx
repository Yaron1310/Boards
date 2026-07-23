import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useFormulaRecording } from '../../../contexts/FormulaRecordingContext';
import type { Item, Column, NumberColumnSettings } from '../../../types';
import { formatGroupedNumber } from '../../../utils/numberFormat';
import { formulaRefDomKey } from '../../../utils/formulaEngine';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const NumberCellInner: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as number | null | undefined;
  const settings = column.settings as NumberColumnSettings;
  const { mutate } = useUpdateItem();
  const { push: pushUndo } = useUndo();
  const { isRecording, insertRef } = useFormulaRecording();

  const [draft, setDraft] = useState<string>(rawValue != null ? String(rawValue) : '');

  useEffect(() => {
    setDraft(rawValue != null ? String(rawValue) : '');
  }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const parsed = draft === '' ? null : parseFloat(draft);
    const next = parsed != null && !isNaN(parsed) ? parsed : null;
    if (next !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${item.name}"`, undo: () => mutate({ id: item.id, patch: { values: { [column.id]: rawValue ?? null } } }) });
      mutate({ id: item.id, patch: { values: { [column.id]: next } } });
    }
    stopEdit();
  };

  const formatDisplay = () => {
    if (rawValue == null) return null;
    const precision = settings?.precision ?? 2;
    const formatted = formatGroupedNumber(rawValue, precision);
    return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
  };

  // While any formula is recording (this board or another), clicks insert this cell's reference.
  if (isRecording) {
    const display = formatDisplay();
    return (
      <CellWrapper column={column} isReadOnly>
        {() => (
          <div
            className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-100/60 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              insertRef({ kind: 'b', boardId: item.boardId, columnId: column.id, itemId: item.id });
            }}
            title="Add this cell to the formula"
            aria-label={`Add ${column.name} for ${item.name} to the formula`}
            data-formula-insertable="true"
            data-formula-cell-key={formulaRefDomKey({ kind: 'b', boardId: item.boardId, columnId: column.id, itemId: item.id })}
          >
            {display != null ? display : <span className="text-gray-300 text-xs">—</span>}
          </div>
        )}
      </CellWrapper>
    );
  }

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => {
        if (isEditing) {
          return (
            <input
              type="number"
              value={draft}
              autoFocus
              step={settings?.precision != null ? Math.pow(10, -settings.precision) : 'any'}
              className="w-full px-3 py-2 text-sm text-gray-800 bg-white outline-none text-center"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(stopEdit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(stopEdit); }
                if (e.key === 'Escape') { setDraft(rawValue != null ? String(rawValue) : ''); stopEdit(); }
              }}
              aria-label={column.name}
            />
          );
        }
        const display = formatDisplay();
        return (
          <div className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center">
            {display != null ? display : <span className="text-gray-300 text-xs">—</span>}
          </div>
        );
      }}
    </CellWrapper>
  );
};

const NumberCell = React.memo(NumberCellInner);
export default NumberCell;
