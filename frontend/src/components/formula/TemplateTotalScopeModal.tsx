import React from 'react';
import ReactDOM from 'react-dom';
import { FiX } from 'react-icons/fi';

interface Props {
  /** Template column the running total belongs to — named in the prompt. */
  columnName: string;
  onChoose: (scope: 'item' | 'global') => void;
  onCancel: () => void;
}

/**
 * Asks how a Personal Hub template column's running total should be scoped before it is
 * inserted into a formula: 'global' sums the column across every user's Personal Hub, 'item'
 * narrows that sum to the values entered against the same item the formula is evaluated for.
 *
 * Shared by every place a template total can be picked (the admin template editor and a
 * template column's summary cell in the Personal Hub) so the choice — and its wording — stays
 * identical wherever the ref is created.
 */
const TemplateTotalScopeModal: React.FC<Props> = ({ columnName, onChoose, onCancel }) => {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-by-item-title"
    >
      <div className="bg-white rounded-xl shadow-xl w-full" style={{ maxWidth: '26rem' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="filter-by-item-title" className="text-lg font-semibold text-gray-800">
            Filter by items?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-md p-1"
            aria-label="Close dialog"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            If you select "Yes", only values from the same item of the target formula will be added.
            Select "No" to add all values in "{columnName}".
          </p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onChoose('global')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="No — add all values in this column"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onChoose('item')}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            aria-label="Yes — filter by item"
          >
            Yes
          </button>
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

export default TemplateTotalScopeModal;
