import React from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import type { Item, Column, StatusColumnSettings } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const StatusCell: React.FC<Props> = ({ item, column }) => {
  const value = (item.values[column.id] ?? '') as string;
  const settings = column.settings as StatusColumnSettings;
  const { mutate } = useUpdateItem();

  const currentOption = settings?.options?.find((o) => o.id === value);

  const select = (optionId: string, stopEdit: () => void) => {
    if (optionId !== value) {
      mutate({ id: item.id, patch: { values: { [column.id]: optionId } } });
    }
    stopEdit();
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => (
        <>
          <div className="px-3 py-2 w-full">
            {currentOption ? (
              <span
                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ backgroundColor: currentOption.color + '33', color: currentOption.color }}
              >
                {currentOption.label}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>

          {isEditing && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={stopEdit}
                aria-hidden="true"
              />
              <div
                className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg mt-0.5 min-w-[160px] py-1"
                role="listbox"
                aria-label={`Select ${column.name}`}
              >
                {settings?.options?.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={opt.id === value}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${opt.id === value ? 'bg-indigo-50' : ''}`}
                    onClick={() => select(opt.id, stopEdit)}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: opt.color }}
                      aria-hidden="true"
                    />
                    {opt.label}
                  </button>
                ))}
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

export default StatusCell;
