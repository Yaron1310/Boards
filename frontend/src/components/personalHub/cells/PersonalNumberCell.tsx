import React, { useEffect, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useFormulaEdit } from '../../../contexts/FormulaEditContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import { colIndexToLetter } from './cellAddress';
import type { NumberColumnSettings, Column } from '../../../types';
import type { PersonalCellProps, PersonalGridContext } from './types';

interface Props extends PersonalCellProps {
  gridContext?: PersonalGridContext;
}

const PersonalNumberCell: React.FC<Props> = ({ column, itemId, itemName, value, editable, gridContext }) => {
  const rawValue = value as number | null | undefined;
  const settings = column.settings as NumberColumnSettings;
  const { mutate } = useUpdatePersonalItemValue();
  const { push: pushUndo } = useUndo();
  const { isFormulaEditing, insertCellAddress } = useFormulaEdit();
  const [draft, setDraft] = useState<string>(rawValue != null ? String(rawValue) : '');

  useEffect(() => { setDraft(rawValue != null ? String(rawValue) : ''); }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const parsed = draft === '' ? null : parseFloat(draft);
    const next = parsed != null && !isNaN(parsed) ? parsed : null;
    if (next !== rawValue) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: rawValue ?? null }) });
      mutate({ itemId, columnId: column.id, value: next });
    }
    stopEdit();
  };

  const formatDisplay = () => {
    if (rawValue == null) return null;
    const precision = settings?.precision ?? 2;
    const formatted = Number.isInteger(rawValue) ? String(rawValue) : rawValue.toFixed(precision);
    return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
  };

  // When a formula cell (in the same personal-columns table) is being edited,
  // intercept clicks to insert this cell's {ColumnLetter}{RowNumber} address
  // into the formula instead of entering edit mode — same as the real board,
  // any row in this table, not just the row the formula lives on.
  if (isFormulaEditing) {
    const display = formatDisplay();
    const rowIndex = gridContext?.rowOrder.indexOf(itemId) ?? -1;
    const colIndex = gridContext?.columns.findIndex((c) => c.id === column.id) ?? -1;
    const cellAddress = rowIndex >= 0 && colIndex >= 0 ? `${colIndexToLetter(colIndex + 2)}${rowIndex + 1}` : null;
    return (
      <div
        role="gridcell"
        className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-100/60 transition-colors"
        onMouseDown={(e) => { e.preventDefault(); if (cellAddress) insertCellAddress(cellAddress); }}
        title={cellAddress ? `Insert {${cellAddress}} into formula` : undefined}
        aria-label={cellAddress ? `Insert cell ${cellAddress} into formula` : column.name}
        data-cell-address={cellAddress ?? undefined}
      >
        {display != null ? display : <span className="text-gray-300 text-xs">—</span>}
      </div>
    );
  }

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
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

export default React.memo(PersonalNumberCell);
