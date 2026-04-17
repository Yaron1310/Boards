import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { FiX, FiColumns, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useCreateColumn, useColumns } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type { StatusOption, DropdownOption } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface AddColumnModalProps {
  onClose: () => void;
}

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  [ColumnType.TEXT]: 'Text',
  [ColumnType.NUMBER]: 'Number',
  [ColumnType.DATE]: 'Date',
  [ColumnType.STATUS]: 'Status',
  [ColumnType.PERSON]: 'Person',
  [ColumnType.DROPDOWN]: 'Dropdown',
  [ColumnType.CHECKBOX]: 'Checkbox',
  [ColumnType.TAGS]: 'Tags',
  [ColumnType.TIME]: 'Time',
  [ColumnType.EMAIL]: 'Email',
  [ColumnType.PHONE]: 'Phone',
  [ColumnType.LOCATION]: 'Location',
  [ColumnType.TIME_RANGE]: 'Time Range',
  [ColumnType.SIMPLE_FORMULA]: 'Simple Formula',
};

const STATUS_PALETTE = [
  '#6B7280', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

const AddColumnModal: React.FC<AddColumnModalProps> = ({ onClose }) => {
  const { mutateAsync: createColumn, isPending } = useCreateColumn();
  const { data: allColumns = [] } = useColumns();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>(ColumnType.TEXT);
  const [error, setError] = useState('');

  // TEXT
  const [maxLength, setMaxLength] = useState('');
  const [multiline, setMultiline] = useState(false);

  // NUMBER
  const [unit, setUnit] = useState('');
  const [precision, setPrecision] = useState('');

  // DATE
  const [includeTime, setIncludeTime] = useState(false);

  // STATUS
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([
    { id: 'todo', label: 'To Do', color: '#6B7280' },
    { id: 'in_progress', label: 'In Progress', color: '#3B82F6' },
    { id: 'done', label: 'Done', color: '#10B981' },
  ]);

  // PERSON
  const [personMultiple, setPersonMultiple] = useState(true);

  // DROPDOWN
  const [dropdownOptions, setDropdownOptions] = useState<DropdownOption[]>([]);
  const [dropdownMultiple, setDropdownMultiple] = useState(false);

  // TAGS
  const [allowCustom, setAllowCustom] = useState(true);

  // SIMPLE_FORMULA
  const [formulaOperation, setFormulaOperation] = useState<'add' | 'subtract' | 'multiply' | 'divide'>('add');
  const [formulaField1, setFormulaField1] = useState('');
  const [formulaField2, setFormulaField2] = useState('');

  const numberColumns = allColumns.filter((c) => c.type === ColumnType.NUMBER);

  const addStatusOption = () => {
    const id = `opt_${Date.now()}`;
    const color = STATUS_PALETTE[statusOptions.length % STATUS_PALETTE.length];
    setStatusOptions((prev) => [...prev, { id, label: 'New Option', color }]);
  };

  const updateStatusOption = (idx: number, field: 'label' | 'color', value: string) => {
    setStatusOptions((prev) => prev.map((opt, i) => (i === idx ? { ...opt, [field]: value } : opt)));
  };

  const removeStatusOption = (idx: number) => {
    setStatusOptions((prev) => prev.filter((_, i) => i !== idx));
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
    switch (type) {
      case ColumnType.TEXT:
        return {
          ...(maxLength ? { maxLength: parseInt(maxLength, 10) } : {}),
          multiline,
        };
      case ColumnType.NUMBER:
        return {
          ...(unit ? { unit } : {}),
          ...(precision ? { precision: parseInt(precision, 10) } : {}),
        };
      case ColumnType.DATE:
        return { includeTime };
      case ColumnType.STATUS:
        return { options: statusOptions };
      case ColumnType.PERSON:
        return { multiple: personMultiple };
      case ColumnType.DROPDOWN:
        return { options: dropdownOptions, multiple: dropdownMultiple };
      case ColumnType.TAGS:
        return { allowCustom };
      case ColumnType.SIMPLE_FORMULA:
        return {
          operation: formulaOperation,
          fields: [formulaField1, formulaField2] as [string, string],
        };
      default:
        return {};
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Column name is required.');
      return;
    }
    if (type === ColumnType.STATUS && statusOptions.length === 0) {
      setError('Status column requires at least one option.');
      return;
    }
    if (type === ColumnType.SIMPLE_FORMULA && (!formulaField1 || !formulaField2)) {
      setError('Formula column requires two field selections.');
      return;
    }
    if (type === ColumnType.SIMPLE_FORMULA && formulaField1 === formulaField2) {
      setError('Formula fields must be different columns.');
      return;
    }

    setError('');
    try {
      await createColumn({ name: trimmedName, type, settings: buildSettings() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create column.');
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-column-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FiColumns className="text-indigo-600" size={16} aria-hidden="true" />
            </div>
            <h2 id="add-column-title" className="text-lg font-semibold text-gray-800">
              Add Column
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
            data-modal-escape
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Name */}
            <div>
              <label htmlFor="col-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="col-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priority"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-required="true"
                aria-describedby={error ? 'col-error' : undefined}
              />
            </div>

            {/* Type */}
            <div>
              <label htmlFor="col-type" className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                id="col-type"
                value={type}
                onChange={(e) => setType(e.target.value as ColumnType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                aria-label="Column type"
              >
                {Object.values(ColumnType).map((ct) => (
                  <option key={ct} value={ct}>
                    {COLUMN_TYPE_LABELS[ct]}
                  </option>
                ))}
              </select>
            </div>

            {/* TEXT settings */}
            {type === ColumnType.TEXT && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Text Settings</p>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label htmlFor="text-maxlen" className="block text-xs text-gray-600 mb-1">
                      Max Length
                    </label>
                    <input
                      id="text-maxlen"
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

            {/* NUMBER settings */}
            {type === ColumnType.NUMBER && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Number Settings</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label htmlFor="num-unit" className="block text-xs text-gray-600 mb-1">
                      Unit
                    </label>
                    <input
                      id="num-unit"
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g. $, %, kg"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="w-32">
                    <label htmlFor="num-precision" className="block text-xs text-gray-600 mb-1">
                      Decimal Places
                    </label>
                    <input
                      id="num-precision"
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

            {/* DATE settings */}
            {type === ColumnType.DATE && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date Settings</p>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTime}
                    onChange={(e) => setIncludeTime(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Include time in date"
                  />
                  Include time
                </label>
              </div>
            )}

            {/* STATUS settings */}
            {type === ColumnType.STATUS && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status Options</p>
                {statusOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={opt.color}
                      onChange={(e) => updateStatusOption(idx, 'color', e.target.value)}
                      className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0.5 flex-shrink-0"
                      aria-label={`Color for option ${opt.label}`}
                    />
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
              </div>
            )}

            {/* PERSON settings */}
            {type === ColumnType.PERSON && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Person Settings</p>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={personMultiple}
                    onChange={(e) => setPersonMultiple(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Allow multiple assignees"
                  />
                  Allow multiple people
                </label>
              </div>
            )}

            {/* DROPDOWN settings */}
            {type === ColumnType.DROPDOWN && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
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

            {/* TAGS settings */}
            {type === ColumnType.TAGS && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags Settings</p>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowCustom}
                    onChange={(e) => setAllowCustom(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label="Allow custom tags"
                  />
                  Allow custom tags
                </label>
              </div>
            )}

            {/* SIMPLE_FORMULA settings */}
            {type === ColumnType.SIMPLE_FORMULA && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Formula Settings</p>
                {numberColumns.length < 2 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded" role="note">
                    You need at least 2 Number columns to create a formula.
                  </p>
                )}
                <div>
                  <label htmlFor="formula-op" className="block text-xs text-gray-600 mb-1">
                    Operation
                  </label>
                  <select
                    id="formula-op"
                    value={formulaOperation}
                    onChange={(e) => setFormulaOperation(e.target.value as typeof formulaOperation)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    aria-label="Formula operation"
                  >
                    <option value="add">Add (+)</option>
                    <option value="subtract">Subtract (−)</option>
                    <option value="multiply">Multiply (×)</option>
                    <option value="divide">Divide (÷)</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label htmlFor="formula-f1" className="block text-xs text-gray-600 mb-1">
                      Field 1
                    </label>
                    <select
                      id="formula-f1"
                      value={formulaField1}
                      onChange={(e) => setFormulaField1(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="Formula field 1"
                    >
                      <option value="">Select column</option>
                      {numberColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="formula-f2" className="block text-xs text-gray-600 mb-1">
                      Field 2
                    </label>
                    <select
                      id="formula-f2"
                      value={formulaField2}
                      onChange={(e) => setFormulaField2(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label="Formula field 2"
                    >
                      <option value="">Select column</option>
                      {numberColumns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p id="col-error" className="text-xs text-red-600" role="alert">
                {error}
              </p>
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
              aria-label="Create column"
            >
              {isPending ? 'Creating…' : 'Create Column'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default AddColumnModal;
