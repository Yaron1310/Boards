import React, { useState } from 'react';
// Force refresh
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUpdateColumn } from '../../../hooks/queries/useColumnQueries';
import type { Item, Column, StatusColumnSettings, StatusOption } from '../../../types';
import CellWrapper from './CellWrapper';
import { FiPlus, FiCheck, FiX, FiTrash2 } from 'react-icons/fi';

interface Props { item: Item; column: Column }

const STATUS_PALETTE = [
  '#6B7280', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

function getContrastText(hex: string): string {
  const color = hex.startsWith('#') ? hex.slice(1) : hex;
  if (color.length !== 6) return '#FFFFFF';
  
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);

  // Perceptive luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? '#1F2937' : '#FFFFFF'; // Dark gray or White
}

const StatusCellInner: React.FC<Props> = ({ item, column }) => {
  const value = (item.values[column.id] ?? '') as string;
  const settings = column.settings as StatusColumnSettings;
  const { mutate } = useUpdateItem();
  const { mutateAsync: updateColumn } = useUpdateColumn(column.boardId);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(STATUS_PALETTE[0]);

  const currentOption = settings?.options?.find((o) => o.id === value);

  const select = (optionId: string, stopEdit: () => void) => {
    if (optionId !== value) {
      mutate({ id: item.id, patch: { values: { [column.id]: optionId } } });
    }
    stopEdit();
  };

  const handleAddLabel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = newName.trim() || 'New Label';
    const newOption: StatusOption = {
      id: `opt_${Date.now()}`,
      label: name,
      color: newColor,
    };
    const newOptions = [...(settings?.options || []), newOption];
    await updateColumn({
      id: column.id,
      patch: { settings: { ...settings, options: newOptions } } as any,
    });
    setIsAdding(false);
    setNewName('');
  };

  const handleDeleteLabel = async (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();
    const newOptions = (settings?.options || []).filter((opt) => opt.id !== optionId);
    await updateColumn({
      id: column.id,
      patch: { settings: { ...settings, options: newOptions } } as any,
    });
  };

  return (
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => (
        <>
          <div className="w-full flex justify-center">
            {currentOption ? (
              <span
                className="inline-block py-[0.4rem] rounded-full text-xs font-medium shadow-sm"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  margin: '3px 10px',
                  backgroundColor: currentOption.color,
                  color: getContrastText(currentOption.color)
                }}
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
                onClick={() => {
                  setIsAdding(false);
                  stopEdit();
                }}
                aria-hidden="true"
              />
              <div
                className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg mt-0.5 min-w-[200px] py-1"
                role="listbox"
                aria-label={`Select ${column.name}`}
              >
                <div className="max-h-60 overflow-y-auto">
                  {settings?.options?.map((opt) => (
                    <div
                      key={opt.id}
                      className={`group flex items-center justify-between w-full px-3 py-1 text-sm hover:bg-gray-50 ${opt.id === value ? 'bg-indigo-50' : ''}`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={opt.id === value}
                        className="flex items-center gap-2 flex-1 text-left py-0.5"
                        onClick={() => select(opt.id, stopEdit)}
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: opt.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{opt.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteLabel(e, opt.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded transition-opacity"
                        aria-label={`Delete ${opt.label} label`}
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-100 mt-1 pt-1">
                  {isAdding ? (
                    <div className="px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={newColor}
                          onChange={(e) => setNewColor(e.target.value)}
                          className="w-8 h-8 rounded border border-gray-200 p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={newName}
                          autoFocus
                          placeholder="Label name..."
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddLabel(e as any);
                            if (e.key === 'Escape') setIsAdding(false);
                          }}
                        />
                      </div>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setIsAdding(false)}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <FiX size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleAddLabel(e)}
                          className="p-1 text-indigo-600 hover:text-indigo-700"
                        >
                          <FiCheck size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left text-indigo-600 hover:bg-indigo-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAdding(true);
                      }}
                    >
                      <FiPlus size={14} />
                      <span>Add label</span>
                    </button>
                  )}
                </div>

                {(!settings?.options || settings.options.length === 0) && !isAdding && (
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

const StatusCell = React.memo(StatusCellInner);
export default StatusCell;
