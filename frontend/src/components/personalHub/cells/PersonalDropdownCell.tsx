import React from 'react';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import type { Column, DropdownColumnSettings } from '../../../types';
import type { PersonalCellProps } from './types';

const PersonalDropdownCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable, userId }) => {
  const selected = (value ?? []) as string[];
  const settings = column.settings as DropdownColumnSettings;
  const multiple = settings?.multiple ?? false;
  const { mutate } = useUpdatePersonalItemValue(userId);
  const { push: pushUndo } = useUndo();

  const selectedOptions = settings?.options?.filter((o) => selected.includes(o.id)) ?? [];

  const toggle = (optionId: string, stopEdit: () => void) => {
    const prev = selected;
    let next: string[];
    if (selected.includes(optionId)) {
      next = selected.filter((id) => id !== optionId);
    } else {
      next = multiple ? [...selected, optionId] : [optionId];
    }
    pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: prev }) });
    mutate({ itemId, columnId: column.id, value: next });
    if (!multiple) stopEdit();
  };

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => (
        <>
          <div className="px-3 py-2 w-full flex flex-wrap gap-1 min-h-[36px] items-center justify-center">
            {selectedOptions.length > 0 ? selectedOptions.map((o) => (
              <span key={o.id} className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-medium">
                {o.label}
              </span>
            )) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>

          {isEditing && (
            <>
              <div className="fixed inset-0 z-40" onClick={stopEdit} aria-hidden="true" />
              <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg mt-0.5 min-w-[160px] py-1" role="listbox" aria-label={`Select ${column.name}`} aria-multiselectable={multiple}>
                {settings?.options?.map((opt) => {
                  const isChecked = selected.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={isChecked}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${isChecked ? 'bg-indigo-50' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggle(opt.id, stopEdit); }}
                    >
                      <span className="flex-1">{opt.label}</span>
                      {isChecked && <span className="text-indigo-600 text-xs">✓</span>}
                    </button>
                  );
                })}
                {(!settings?.options || settings.options.length === 0) && (
                  <p className="px-3 py-2 text-xs text-gray-400">No options configured</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </CellWrapper>
  );
};

export default React.memo(PersonalDropdownCell);
