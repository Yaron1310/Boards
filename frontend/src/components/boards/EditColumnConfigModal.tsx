import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiSettings, FiPlus, FiTrash2 } from 'react-icons/fi';
import ColorPickerPopover, { PRESET_COLORS } from './ColorPickerPopover';
import { useUpdateColumn } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type {
  Column,
  StatusOption,
  DropdownOption,
  TextColumnSettings,
  NumberColumnSettings,
  StatusColumnSettings,
  DropdownColumnSettings,
} from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface EditColumnConfigModalProps {
  boardId: string;
  column: Column;
  onClose: () => void;
}


const EditColumnConfigModal: React.FC<EditColumnConfigModalProps> = ({ boardId, column, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { mutateAsync: updateColumn, isPending } = useUpdateColumn(boardId);
  const [error, setError] = useState('');

  // TEXT
  const textSettings = column.settings as TextColumnSettings;
  const [maxLength, setMaxLength] = useState(
    textSettings.maxLength != null ? String(textSettings.maxLength) : '',
  );
  const [multiline, setMultiline] = useState(textSettings.multiline ?? false);

  // NUMBER
  const numSettings = column.settings as NumberColumnSettings;
  const [unit, setUnit] = useState(numSettings.unit ?? '');
  const [precision, setPrecision] = useState(
    numSettings.precision != null ? String(numSettings.precision) : '',
  );

  // STATUS
  const statusSettings = column.settings as StatusColumnSettings;
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(
    statusSettings.options ? [...statusSettings.options] : [],
  );
  const [defaultStatusId, setDefaultStatusId] = useState(statusSettings.defaultStatusId ?? '');

  // DROPDOWN
  const dropdownSettings = column.settings as DropdownColumnSettings;
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>(
    dropdownSettings.options ? [...dropdownSettings.options] : [],
  );
  const [dropdownMultiple, setDropdownMultiple] = useState(dropdownSettings.multiple ?? false);

  const [openColorPickerIdx, setOpenColorPickerIdx] = useState<number | null>(null);
  const colorPickerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (openColorPickerIdx === null) return;
    const handler = (e: MouseEvent) => {
      const ref = colorPickerRefs.current[openColorPickerIdx];
      if (ref && !ref.contains(e.target as Node)) setOpenColorPickerIdx(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openColorPickerIdx]);

  const addStatusOption = () => {
    const id = `opt_${Date.now()}`;
    const color = PRESET_COLORS[statusOptions.length % PRESET_COLORS.length];
    setStatusOptions((prev) => [...prev, { id, label: 'New Option', color }]);
  };

  const updateStatusOption = (idx: number, field: 'label' | 'color', value: string) => {
    setStatusOptions((prev) => prev.map((opt, i) => (i === idx ? { ...opt, [field]: value } : opt)));
  };

  const removeStatusOption = (idx: number) => {
    const removed = statusOptions[idx];
    setStatusOptions((prev) => prev.filter((_, i) => i !== idx));
    if (defaultStatusId === removed.id) setDefaultStatusId('');
  };

  const addDropdownOption = () => {
    const id = `opt_${Date.now()}`;
    setDropdownOptions((prev) => [...prev, { id, label: 'New Option' }]);
  };

  const updateDropdownOption = (idx: number, label: string) => {
    setDropdownOptions((prev) => prev.map((opt, i) => (i === idx ? { ...opt, label } : opt)));
  };

  const removeDropdownOption = (idx: number) => {
    setDropdownOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildSettings = () => {
    switch (column.type) {
      case ColumnType.TEXT:
        return { ...(maxLength ? { maxLength: parseInt(maxLength, 10) } : {}), multiline };
      case ColumnType.NUMBER:
        return { ...(unit ? { unit } : {}), ...(precision ? { precision: parseInt(precision, 10) } : {}) };
      case ColumnType.STATUS:
        return { options: statusOptions, ...(defaultStatusId ? { defaultStatusId } : {}) };
      case ColumnType.DROPDOWN:
        return { options: dropdownOptions, multiple: dropdownMultiple };
      default:
        return column.settings;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (column.type === ColumnType.STATUS && statusOptions.length === 0) {
      setError('Status column requires at least one option.');
      return;
    }
    setError('');
    try {
      await updateColumn({ id: column.id, patch: { settings: buildSettings() } });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  };

  const TITLES: Partial<Record<ColumnType, string>> = {
    [ColumnType.TEXT]: 'Text Settings',
    [ColumnType.NUMBER]: 'Number Settings',
    [ColumnType.STATUS]: 'Status Settings',
    [ColumnType.DROPDOWN]: 'Dropdown Settings',
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-col-config-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-h-[90vh] flex flex-col" style={{ maxWidth: '32rem' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FiSettings className="text-indigo-600" size={16} aria-hidden="true" />
            </div>
            <div>
              <h2 id="edit-col-config-title" className="text-base font-semibold text-gray-800">
                Edit Configuration
              </h2>
              <p className="text-xs text-gray-400">{column.name} · {TITLES[column.type]}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
            data-modal-escape
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* TEXT */}
            {column.type === ColumnType.TEXT && (
              <div className="space-y-3">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label htmlFor="edit-text-maxlen" className="block text-xs text-gray-600 mb-1">
                      Max Length
                    </label>
                    <input
                      id="edit-text-maxlen"
                      type="number"
                      value={maxLength}
                      onChange={(e) => setMaxLength(e.target.value)}
                      placeholder="Unlimited"
                      min={1}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-1.5">
                    <input
                      type="checkbox"
                      checked={multiline}
                      onChange={(e) => setMultiline(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label="Allow multiline text"
                    />
                    Multiline
                  </label>
                </div>
              </div>
            )}

            {/* NUMBER */}
            {column.type === ColumnType.NUMBER && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label htmlFor="edit-num-unit" className="block text-xs text-gray-600 mb-1">
                      Unit
                    </label>
                    <input
                      id="edit-num-unit"
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g. $, %, kg"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="w-32">
                    <label htmlFor="edit-num-precision" className="block text-xs text-gray-600 mb-1">
                      Decimal Places
                    </label>
                    <input
                      id="edit-num-precision"
                      type="number"
                      value={precision}
                      onChange={(e) => setPrecision(e.target.value)}
                      placeholder="0"
                      min={0}
                      max={10}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STATUS */}
            {column.type === ColumnType.STATUS && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status Options</p>
                {statusOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <div
                      className="relative flex-shrink-0"
                      ref={(el) => { colorPickerRefs.current[idx] = el; }}
                    >
                      <button
                        type="button"
                        aria-label={`Color for option ${opt.label}`}
                        onClick={() => setOpenColorPickerIdx(openColorPickerIdx === idx ? null : idx)}
                        className="w-7 h-7 rounded border border-gray-300 cursor-pointer hover:border-gray-500 transition-colors"
                        style={{ backgroundColor: opt.color }}
                      />
                      {openColorPickerIdx === idx && (
                        <div className="absolute left-0 top-full mt-1 z-[60] bg-white border border-gray-200 rounded shadow-lg w-[168px]">
                          <ColorPickerPopover
                            value={opt.color}
                            onChange={(c) => { updateStatusOption(idx, 'color', c); setOpenColorPickerIdx(null); }}
                            usedColors={statusOptions.map((o) => o.color)}
                          />
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => updateStatusOption(idx, 'label', e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label={`Label for option ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeStatusOption(idx)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                      aria-label={`Remove option ${opt.label}`}
                    >
                      <FiTrash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStatusOption}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                  aria-label="Add status option"
                >
                  <FiPlus size={13} aria-hidden="true" />
                  Add Option
                </button>
                {statusOptions.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 mt-2">
                    <label htmlFor="edit-default-status" className="block text-xs text-gray-600 mb-1">
                      Default status for new items
                    </label>
                    <select
                      id="edit-default-status"
                      value={defaultStatusId}
                      onChange={(e) => setDefaultStatusId(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="Default status for new items"
                    >
                      <option value="">None</option>
                      {statusOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* DROPDOWN */}
            {column.type === ColumnType.DROPDOWN && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dropdown Options</p>
                {dropdownOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.label}
                      onChange={(e) => updateDropdownOption(idx, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label={`Label for option ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeDropdownOption(idx)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                      aria-label={`Remove option ${opt.label}`}
                    >
                      <FiTrash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDropdownOption}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                  aria-label="Add dropdown option"
                >
                  <FiPlus size={13} aria-hidden="true" />
                  Add Option
                </button>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={dropdownMultiple}
                    onChange={(e) => setDropdownMultiple(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Allow multiple selections"
                  />
                  Allow multiple selections
                </label>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600" role="alert">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
              aria-label="Save configuration"
            >
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot,
  );
};

export default EditColumnConfigModal;
