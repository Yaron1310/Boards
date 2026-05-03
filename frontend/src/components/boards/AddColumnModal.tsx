import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  FiX, FiColumns, FiPlus, FiTrash2,
  FiType, FiHash, FiCalendar, FiClock,
  FiFlag, FiUser, FiChevronDown, FiCheckSquare, FiTag,
  FiMail, FiPhone, FiMapPin, FiZap,
} from 'react-icons/fi';
import { useCreateColumn, useColumns, useReorderColumns } from '../../hooks/queries/useColumnQueries';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { ColumnType } from '../../types';
import type { StatusOption, DropdownOption } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface AddColumnModalProps {
  boardId: string;
  onClose: () => void;
  insertAfterColumnId?: string;
  insertBeforeColumnId?: string;
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
  [ColumnType.SIMPLE_FORMULA]: 'Formula',
};

const COLUMN_TYPE_ICONS: Record<ColumnType, React.ReactNode> = {
  [ColumnType.TEXT]: <FiType size={16} aria-hidden="true" />,
  [ColumnType.NUMBER]: <FiHash size={16} aria-hidden="true" />,
  [ColumnType.DATE]: <FiCalendar size={16} aria-hidden="true" />,
  [ColumnType.TIME]: <FiClock size={16} aria-hidden="true" />,
  [ColumnType.TIME_RANGE]: (
    <span className="flex items-center gap-[2px]" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="12" height="10" rx="1.5" /><line x1="1" y1="6.5" x2="13" y2="6.5" /><line x1="4" y1="1" x2="4" y2="4" /><line x1="10" y1="1" x2="10" y2="4" />
      </svg>
      <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="1" y1="5" x2="9" y2="5" /><polyline points="6 2 9 5 6 8" />
      </svg>
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="12" height="10" rx="1.5" /><line x1="1" y1="6.5" x2="13" y2="6.5" /><line x1="4" y1="1" x2="4" y2="4" /><line x1="10" y1="1" x2="10" y2="4" />
      </svg>
    </span>
  ),
  [ColumnType.STATUS]: <FiFlag size={16} aria-hidden="true" />,
  [ColumnType.DROPDOWN]: <FiChevronDown size={16} aria-hidden="true" />,
  [ColumnType.CHECKBOX]: <FiCheckSquare size={16} aria-hidden="true" />,
  [ColumnType.PERSON]: <FiUser size={16} aria-hidden="true" />,
  [ColumnType.EMAIL]: <FiMail size={16} aria-hidden="true" />,
  [ColumnType.PHONE]: <FiPhone size={16} aria-hidden="true" />,
  [ColumnType.TAGS]: <FiTag size={16} aria-hidden="true" />,
  [ColumnType.LOCATION]: <FiMapPin size={16} aria-hidden="true" />,
  [ColumnType.SIMPLE_FORMULA]: <FiZap size={16} aria-hidden="true" />,
};

type GroupStyle = {
  dot: string;
  unselectedBg: string;
  unselectedBorder: string;
  unselectedText: string;
  unselectedIcon: string;
  selectedBg: string;
  selectedBorder: string;
  selectedText: string;
  selectedIcon: string;
  hoverBg: string;
  hoverBorder: string;
  hoverText: string;
};

const GROUP_STYLES: Record<string, GroupStyle> = {
  Inputs: {
    dot: 'bg-blue-500',
    unselectedBg: 'bg-blue-50',
    unselectedBorder: 'border-blue-200',
    unselectedText: 'text-blue-600',
    unselectedIcon: 'text-blue-500',
    selectedBg: 'bg-blue-50',
    selectedBorder: 'border-blue-500',
    selectedText: 'text-blue-700',
    selectedIcon: 'text-blue-600',
    hoverBg: 'hover:bg-blue-100',
    hoverBorder: 'hover:border-blue-400',
    hoverText: 'hover:text-blue-800',
  },
  Time: {
    dot: 'bg-violet-500',
    unselectedBg: 'bg-violet-50',
    unselectedBorder: 'border-violet-200',
    unselectedText: 'text-violet-600',
    unselectedIcon: 'text-violet-500',
    selectedBg: 'bg-violet-50',
    selectedBorder: 'border-violet-500',
    selectedText: 'text-violet-700',
    selectedIcon: 'text-violet-600',
    hoverBg: 'hover:bg-violet-100',
    hoverBorder: 'hover:border-violet-400',
    hoverText: 'hover:text-violet-800',
  },
  Selection: {
    dot: 'bg-teal-500',
    unselectedBg: 'bg-teal-50',
    unselectedBorder: 'border-teal-200',
    unselectedText: 'text-teal-600',
    unselectedIcon: 'text-teal-500',
    selectedBg: 'bg-teal-50',
    selectedBorder: 'border-teal-500',
    selectedText: 'text-teal-700',
    selectedIcon: 'text-teal-600',
    hoverBg: 'hover:bg-teal-100',
    hoverBorder: 'hover:border-teal-400',
    hoverText: 'hover:text-teal-800',
  },
  Information: {
    dot: 'bg-orange-500',
    unselectedBg: 'bg-orange-50',
    unselectedBorder: 'border-orange-200',
    unselectedText: 'text-orange-600',
    unselectedIcon: 'text-orange-500',
    selectedBg: 'bg-orange-50',
    selectedBorder: 'border-orange-500',
    selectedText: 'text-orange-700',
    selectedIcon: 'text-orange-600',
    hoverBg: 'hover:bg-orange-100',
    hoverBorder: 'hover:border-orange-400',
    hoverText: 'hover:text-orange-800',
  },
  Calculation: {
    dot: 'bg-yellow-500',
    unselectedBg: 'bg-yellow-50',
    unselectedBorder: 'border-yellow-200',
    unselectedText: 'text-yellow-600',
    unselectedIcon: 'text-yellow-500',
    selectedBg: 'bg-yellow-50',
    selectedBorder: 'border-yellow-500',
    selectedText: 'text-yellow-700',
    selectedIcon: 'text-yellow-600',
    hoverBg: 'hover:bg-yellow-100',
    hoverBorder: 'hover:border-yellow-400',
    hoverText: 'hover:text-yellow-800',
  },
};

const COLUMN_TYPE_GROUPS: { label: string; types: ColumnType[] }[] = [
  { label: 'Inputs', types: [ColumnType.TEXT, ColumnType.NUMBER] },
  { label: 'Time', types: [ColumnType.DATE, ColumnType.TIME, ColumnType.TIME_RANGE] },
  { label: 'Selection', types: [ColumnType.STATUS, ColumnType.DROPDOWN, ColumnType.CHECKBOX, ColumnType.TAGS] },
  { label: 'Information', types: [ColumnType.EMAIL, ColumnType.PHONE, ColumnType.PERSON, ColumnType.LOCATION] },
  { label: 'Calculation', types: [ColumnType.SIMPLE_FORMULA] },
];

const BUTTON_DISPLAY_ORDER = ['Inputs', 'Selection', 'Time', 'Calculation', 'Information'];

const TYPE_TO_GROUP: Record<ColumnType, string> = {} as Record<ColumnType, string>;
COLUMN_TYPE_GROUPS.forEach(({ label, types }) => {
  types.forEach((t) => { TYPE_TO_GROUP[t] = label; });
});

const STATUS_PALETTE = [
  '#6B7280', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

const AddColumnModal: React.FC<AddColumnModalProps> = ({ boardId, onClose, insertAfterColumnId, insertBeforeColumnId }) => {
  const qc = useQueryClient();
  const { mutateAsync: createColumn, isPending } = useCreateColumn(boardId);
  const { data: allColumns = [] } = useColumns(boardId);
  const { mutateAsync: reorderColumns } = useReorderColumns(boardId);
  const previousColumnsRef = useRef<string[]>([]);

  useEffect(() => {
    previousColumnsRef.current = allColumns.map(c => c.id);
  }, []);

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
        return { ...(maxLength ? { maxLength: parseInt(maxLength, 10) } : {}), multiline };
      case ColumnType.NUMBER:
        return { ...(unit ? { unit } : {}), ...(precision ? { precision: parseInt(precision, 10) } : {}) };
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
        return { defaultFormula: '' };
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

    setError('');
    try {
      await createColumn({ name: trimmedName, type, settings: buildSettings() });

      await qc.refetchQueries({ queryKey: queryKeys.columns.board(boardId) });
      const rawColumns = qc.getQueryData(queryKeys.columns.board(boardId)) as any[] ?? [];

      const updatedColumns = [...rawColumns].sort((a: any, b: any) => {
        const aOrder = typeof a.order === 'number' ? a.order : Infinity;
        const bOrder = typeof b.order === 'number' ? b.order : Infinity;
        return aOrder - bOrder;
      });

      if (updatedColumns.length > 0) {
        const newColumnId = updatedColumns.find(col => !previousColumnsRef.current.includes(col.id))?.id;

        if (newColumnId) {
          let targetIndex = updatedColumns.length - 1;

          if (insertAfterColumnId) {
            const afterIdx = updatedColumns.findIndex(c => c.id === insertAfterColumnId);
            if (afterIdx !== -1) targetIndex = afterIdx + 1;
          } else if (insertBeforeColumnId) {
            const beforeIdx = updatedColumns.findIndex(c => c.id === insertBeforeColumnId);
            if (beforeIdx !== -1) targetIndex = beforeIdx;
          }

          const currentIndex = updatedColumns.findIndex(c => c.id === newColumnId);
          if (currentIndex !== -1) {
            const reordered = updatedColumns.filter(c => c.id !== newColumnId);
            reordered.splice(Math.min(targetIndex, reordered.length), 0, updatedColumns[currentIndex]);
            const finalOrder = reordered.map((col, idx) => ({ id: col.id, order: idx }));
            await reorderColumns(finalOrder);
          }
        }
      }

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
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-h-[90vh] flex flex-col" style={{ maxWidth: '40rem' }}>
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
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

            {/* Section 1: Column Type */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Select column type</p>
              <div className="flex flex-wrap gap-6" role="group" aria-label="Column type selector">
                {BUTTON_DISPLAY_ORDER.map((groupLabel) => {
                  const groupData = COLUMN_TYPE_GROUPS.find(g => g.label === groupLabel);
                  if (!groupData) return null;
                  const { label, types } = groupData;
                  const s = GROUP_STYLES[label];
                  const isInformationGroup = label === 'Information';

                  return (
                    <div key={label} className={isInformationGroup ? 'w-full' : ''}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} aria-hidden="true" />
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {types.map((ct) => {
                          const isSelected = type === ct;
                          return (
                            <button
                              key={ct}
                              type="button"
                              onClick={() => setType(ct)}
                              aria-pressed={isSelected}
                              aria-label={`${COLUMN_TYPE_LABELS[ct]} column type`}
                              className={[
                                'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 transition-all duration-150',
                                'w-[76px] h-[50px] px-1',
                                isSelected
                                  ? `${s.selectedBg} ${s.selectedBorder} ${s.selectedText}`
                                  : `${s.unselectedBg} ${s.unselectedBorder} ${s.unselectedText} ${s.hoverBg} ${s.hoverBorder} ${s.hoverText}`,
                              ].join(' ')}
                            >
                              <span className={isSelected ? s.selectedIcon : s.unselectedIcon}>
                                {COLUMN_TYPE_ICONS[ct]}
                              </span>
                              <span className="text-[11px] font-medium leading-tight text-center">
                                {COLUMN_TYPE_LABELS[ct]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Name */}
            <div className="pt-1 border-t border-gray-100">
              <label htmlFor="col-name" className="block text-sm font-semibold text-gray-700 mb-2">
                Column name <span aria-hidden="true" className="text-red-500">*</span>
              </label>
              <input
                id="col-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priority"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                aria-required="true"
                aria-describedby={error ? 'col-error' : undefined}
              />
            </div>

            {/* Section 3: Type-specific settings */}

            {/* TEXT settings */}
            {type === ColumnType.TEXT && (
              <div className="space-y-3 pt-1 border-t border-gray-100">
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
              <div className="space-y-3 pt-1 border-t border-gray-100">
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
              <div className="pt-1 border-t border-gray-100">
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
              <div className="space-y-2 pt-1 border-t border-gray-100">
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
              <div className="pt-1 border-t border-gray-100">
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
              <div className="space-y-2 pt-1 border-t border-gray-100">
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
              <div className="pt-1 border-t border-gray-100">
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
