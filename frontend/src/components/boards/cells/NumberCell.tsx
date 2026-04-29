import React, { useEffect, useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useFormulaEdit } from '../../../contexts/FormulaEditContext';
import type { Item, Column, NumberColumnSettings } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const NumberCell: React.FC<Props> = ({ item, column }) => {
  const rawValue = item.values[column.id] as number | null | undefined;
  const settings = column.settings as NumberColumnSettings;
  const { mutate } = useUpdateItem();
  const { isFormulaEditing, insertColumnRef } = useFormulaEdit();

  const [draft, setDraft] = useState<string>(rawValue != null ? String(rawValue) : '');

  useEffect(() => {
    setDraft(rawValue != null ? String(rawValue) : '');
  }, [rawValue]);

  const commit = (stopEdit: () => void) => {
    const parsed = draft === '' ? null : parseFloat(draft);
    const next = parsed != null && !isNaN(parsed) ? parsed : null;
    if (next !== rawValue) {
      mutate({ id: item.id, patch: { values: { [column.id]: next } } });
    }
    stopEdit();
  };

  const formatDisplay = () => {
    if (rawValue == null) return null;
    const precision = settings?.precision ?? 2;
    const formatted = Number.isInteger(rawValue) ? String(rawValue) : rawValue.toFixed(precision);
    return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
  };

  // When a formula cell in the same row is being edited, intercept clicks
  // to insert this column's reference into the formula instead of entering edit mode.
  if (isFormulaEditing) {
    const display = formatDisplay();
    return (
      <CellWrapper column={column} isReadOnly>
        {() => (
          <div
            className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-100/60 transition-colors"
            onClick={() => insertColumnRef(column.name)}
            title={`Insert {${column.name}} into formula`}
            aria-label={`Insert ${column.name} into formula`}
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

export default NumberCell;
