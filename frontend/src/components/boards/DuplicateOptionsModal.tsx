import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { DuplicateMode } from '../../services/workManagementService';

interface Option {
  value: DuplicateMode;
  label: string;
}

const OPTIONS: Option[] = [
  { value: 'columns_only', label: 'Columns only' },
  { value: 'columns_groups', label: 'Columns + groups' },
  { value: 'columns_groups_items', label: 'Columns + groups + items' },
  { value: 'full', label: 'Columns + groups + items + data' },
];

interface DuplicateOptionsModalProps {
  title: string;
  confirmLabel: string;
  onConfirm: (mode: DuplicateMode) => void;
  onClose: () => void;
}

const DuplicateOptionsModal: React.FC<DuplicateOptionsModalProps> = ({
  title,
  confirmLabel,
  onConfirm,
  onClose,
}) => {
  const [selected, setSelected] = useState<DuplicateMode>('full');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dup-modal-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 id="dup-modal-title" className="text-base font-semibold text-gray-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <FiX size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                selected === opt.value
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="dup-mode"
                value={opt.value}
                checked={selected === opt.value}
                onChange={() => setSelected(opt.value)}
                className="accent-indigo-600"
                aria-label={opt.label}
              />
              <span className={`text-sm ${selected === opt.value ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
};

export default DuplicateOptionsModal;
