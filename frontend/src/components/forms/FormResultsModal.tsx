import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { FiXCircle, FiLoader, FiFileText, FiAlertCircle, FiChevronDown } from 'react-icons/fi';
import type { Form } from '../../types';
import { useFormResults } from '../../hooks/queries/useFormQueries';
import { formatAnswer } from './formFieldTypes';

interface FormResultsModalProps {
  form: Form;
  onClose: () => void;
}

function formatTimestamp(ts: Date | string | undefined): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Read-only view of every answer set collected for one form, grouped by the item
 * it was filled in on. Submitted responses come first (the backend sorts them).
 */
const FormResultsModal: React.FC<FormResultsModalProps> = ({ form, onClose }) => {
  const { data, isLoading, error } = useFormResults(form.id);

  // The backend only ever returns submitted responses here — drafts are private to
  // whoever is filling the form in and never leave their browser.
  const responses = data?.responses ?? [];

  // Each response is collapsed by default — a form can collect many responses, so
  // showing every answer set expanded at once would be an unreadable wall of text.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Results for ${form.name}`}
      >
        <div className="p-6 border-b flex justify-between items-center flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{form.name} — Results</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading
                ? 'Loading…'
                : `${responses.length} response${responses.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 flex-shrink-0" aria-label="Close">
            <FiXCircle size={24} aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar bg-gray-50">
          {isLoading && (
            <div className="flex justify-center py-12" role="status" aria-label="Loading results">
              <FiLoader className="animate-spin h-6 w-6 text-indigo-400" aria-hidden="true" />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md text-sm bg-red-100 text-red-700" role="alert">
              <FiAlertCircle className="inline mr-2" aria-hidden="true" />
              {error instanceof Error ? error.message : 'Failed to load results.'}
            </div>
          )}

          {!isLoading && !error && responses.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-12">
              This form hasn't been filled in on any item yet.
            </p>
          )}

          {data?.truncated && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
              Showing the most recent responses only — this form has more than the page limit.
            </p>
          )}

          <ul className="space-y-3" role="list" aria-label="Form responses">
            {responses.map((row) => {
              const key = `${row.itemId}-${row.response.formId}`;
              const isOpen = expanded.has(key);
              return (
                <li key={key} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(key)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    aria-expanded={isOpen}
                    aria-controls={`response-${key}`}
                  >
                    <FiFileText size={14} className="text-indigo-500 flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {row.itemName ?? '(deleted item)'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Submitted by {row.response.submittedByName ?? 'someone'} · {formatTimestamp(row.response.submittedAt)}
                      </p>
                    </div>
                    <FiChevronDown
                      size={16}
                      className={`flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen && (
                    <dl id={`response-${key}`} className="px-4 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50">
                      {form.fields.map((field) => {
                        const answer = formatAnswer(field, row.response.values?.[field.id] ?? null);
                        return (
                          <div key={field.id} className="bg-white border border-gray-200 rounded-md px-3 py-2">
                            <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">
                              {field.label}
                            </dt>
                            <dd className="text-sm text-gray-800 mt-0.5 break-words">
                              {answer === '' ? <span className="text-gray-300">—</span> : answer}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end p-6 border-t bg-gray-50 rounded-b-lg flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!,
  );
};

export default FormResultsModal;
