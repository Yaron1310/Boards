import React, { useEffect, useState } from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import { useFormulaRecording } from '../../../contexts/FormulaRecordingContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { NumberColumnSettings, Column } from '../../../types';
import type { PersonalCellProps, PersonalGridContext } from './types';
import { formatGroupedNumber } from '../../../utils/numberFormat';
import { formulaRefDomKey } from '../../../utils/formulaEngine';

interface Props extends PersonalCellProps {
  gridContext?: PersonalGridContext;
}

const PersonalNumberCell: React.FC<Props> = ({ column, itemId, itemName, value, editable, gridContext }) => {
  const rawValue = value as number | null | undefined;
  const settings = column.settings as NumberColumnSettings;
  const { mutate } = useUpdatePersonalItemValue();
  const { push: pushUndo } = useUndo();
  const { isRecording, insertRef } = useFormulaRecording();
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
    const formatted = formatGroupedNumber(rawValue, precision);
    return settings?.unit ? `${formatted} ${settings.unit}` : formatted;
  };

  // A cross-board formula is recording (started from any board): clicks add this cell as a
  // stable-ID reference. Personal-hub values are keyed by itemId+columnId, so the board id is
  // only used to tell same-table refs from foreign ones.
  if (isRecording) {
    const display = formatDisplay();
    return (
      <div
        role="gridcell"
        className="px-3 py-2 text-sm text-gray-700 truncate w-full text-center cursor-pointer hover:bg-indigo-100/60 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          insertRef({ kind: 'p', boardId: gridContext?.boardId ?? '', columnId: column.id, itemId });
        }}
        title="Add this cell to the formula"
        aria-label={`Add ${column.name} for ${itemName} to the formula`}
        data-formula-insertable="true"
        data-formula-cell-key={formulaRefDomKey({ kind: 'p', boardId: gridContext?.boardId ?? '', columnId: column.id, itemId })}
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
