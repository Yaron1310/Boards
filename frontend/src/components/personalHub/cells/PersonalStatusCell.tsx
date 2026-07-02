import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUpdatePersonalItemValue } from '../../../hooks/queries/usePersonalHubQueries';
import { useUpdatePersonalColumn } from '../../../hooks/queries/usePersonalHubQueries';
import { useUndo } from '../../../contexts/UndoContext';
import CellWrapper from '../../boards/cells/CellWrapper';
import { FiPlus, FiCheck, FiX, FiTrash2 } from 'react-icons/fi';
import ColorPickerPopover, { PRESET_COLORS } from '../../boards/ColorPickerPopover';
import type { Column, StatusColumnSettings, StatusOption } from '../../../types';
import type { PersonalCellProps } from './types';

function getContrastText(hex: string): string {
  const color = hex.startsWith('#') ? hex.slice(1) : hex;
  if (color.length !== 6) return '#FFFFFF';
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1F2937' : '#FFFFFF';
}

const PersonalStatusCell: React.FC<PersonalCellProps> = ({ column, itemId, itemName, value, editable }) => {
  const currentValue = (value ?? '') as string;
  const settings = column.settings as StatusColumnSettings;
  const { mutate } = useUpdatePersonalItemValue();
  const { mutateAsync: updateColumn } = useUpdatePersonalColumn();
  const { push: pushUndo } = useUndo();

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setColorPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerOpen]);

  const currentOption = settings?.options?.find((o) => o.id === currentValue);

  const select = (optionId: string, stopEdit: () => void) => {
    if (optionId !== currentValue) {
      pushUndo({ label: `Changed "${column.name}" on "${itemName}"`, undo: () => mutate({ itemId, columnId: column.id, value: currentValue }) });
      mutate({ itemId, columnId: column.id, value: optionId });
    }
    stopEdit();
  };

  const handleAddLabel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = newName.trim() || 'New Label';
    const newOption: StatusOption = { id: `opt_${Date.now()}`, label: name, color: newColor };
    const newOptions = [...(settings?.options || []), newOption];
    await updateColumn({ id: column.id, patch: { settings: { ...settings, options: newOptions } } });
    setIsAdding(false);
    setNewName('');
  };

  const handleDeleteLabel = async (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();
    const newOptions = (settings?.options || []).filter((opt) => opt.id !== optionId);
    await updateColumn({ id: column.id, patch: { settings: { ...settings, options: newOptions } } });
  };

  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <CellWrapper column={column as unknown as Column} isReadOnly={!editable}>
      {(isEditing, stopEdit) => (
        <>
          <div ref={anchorRef} className="w-full flex justify-center">
            {currentOption ? (
              <span
                className="inline-block py-[0.4rem] rounded-full text-xs font-medium shadow-sm"
                style={{ width: '100%', textAlign: 'center', margin: '3px 10px', minHeight: '26px', backgroundColor: currentOption.color, color: getContrastText(currentOption.color) }}
              >
                {currentOption.label}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>

          {isEditing && createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => { setIsAdding(false); stopEdit(); }} aria-hidden="true" />
              <div
                style={{ position: 'fixed', top: (anchorRef.current?.getBoundingClientRect().bottom ?? 0) + 2, left: anchorRef.current?.getBoundingClientRect().left ?? 0, zIndex: 9999 }}
                className="bg-white border border-gray-200 rounded shadow-lg min-w-[200px] py-1"
                role="listbox"
                aria-label={`Select ${column.name}`}
              >
                <div className="max-h-60 overflow-y-auto">
                  {settings?.options?.map((opt) => (
                    <div key={opt.id} className={`group flex items-center justify-between w-full px-3 py-1 text-sm hover:bg-gray-50 ${opt.id === currentValue ? 'bg-indigo-50' : ''}`}>
                      <button type="button" role="option" aria-selected={opt.id === currentValue} className="flex items-center gap-2 flex-1 text-left py-0.5" onClick={() => select(opt.id, stopEdit)}>
                        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} aria-hidden="true" />
                        <span className="truncate">{opt.label}</span>
                      </button>
                      <button type="button" onClick={(e) => void handleDeleteLabel(e, opt.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded transition-opacity" aria-label={`Delete ${opt.label} label`}>
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-100 mt-1 pt-1">
                  {isAdding ? (
                    <div className="px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <div className="relative flex-shrink-0" ref={colorPickerRef}>
                          <button type="button" aria-label="Pick color" onClick={() => setColorPickerOpen((o) => !o)} className="w-8 h-8 rounded border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors" style={{ backgroundColor: newColor }} />
                          {colorPickerOpen && (
                            <div className="absolute left-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded shadow-lg w-[168px]">
                              <ColorPickerPopover value={newColor} onChange={(c) => { setNewColor(c); setColorPickerOpen(false); }} usedColors={settings?.options?.map((o) => o.color)} />
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          value={newName}
                          autoFocus
                          placeholder="Label name..."
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleAddLabel(e as unknown as React.MouseEvent);
                            if (e.key === 'Escape') setIsAdding(false);
                          }}
                        />
                      </div>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => setIsAdding(false)} className="p-1 text-gray-400 hover:text-gray-600">
                          <FiX size={14} />
                        </button>
                        <button type="button" onClick={(e) => void handleAddLabel(e)} className="p-1 text-indigo-600 hover:text-indigo-700">
                          <FiCheck size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left text-indigo-600 hover:bg-indigo-50 transition-colors" onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}>
                      <FiPlus size={14} />
                      <span>Add label</span>
                    </button>
                  )}
                </div>

                {(!settings?.options || settings.options.length === 0) && !isAdding && (
                  <p className="px-3 py-2 text-xs text-gray-400">No options configured</p>
                )}
              </div>
            </>,
            document.body,
          )}
        </>
      )}
    </CellWrapper>
  );
};

export default React.memo(PersonalStatusCell);
