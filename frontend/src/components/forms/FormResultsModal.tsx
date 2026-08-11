import React from 'react';
import ReactDOM from 'react-dom';
import { FiXCircle, FiLoader, FiFileText, FiAlertCircle } from 'react-icons/fi';
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

  const responses = data?.responses ?? [];
  const submittedCount = responses.filter((r) => r.response.submittedAt).length;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
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
                : `${responses.length} response${responses.length !== 1 ? 's' : ''} · ${submittedCount} submitted`}
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
            {responses.map((row) => (
              <li key={`${row.itemId}-${row.response.formId}`} className="bg-white border border-gray-200 rounded-lg shadow-sm">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
                  <FiFileText size={14} className="text-indigo-500 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {row.itemName ?? '(deleted item)'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {row.response.submittedAt
                        ? `Submitted by ${row.response.submittedByName ?? 'someone'} · ${formatTimestamp(row.response.submittedAt)}`
                        : `Draft · last edited ${formatTimestamp(row.response.updatedAt)}`}
                    </p>
                  </div>
                  {!row.response.submittedAt && (
                    <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      Draft
                    </span>
                  )}
                </div>

                <dl className="px-4 py-3 space-y-2">
                  {form.fields.map((field) => {
                    const answer = formatAnswer(field, row.response.values?.[field.id] ?? null);
                    return (
                      <div key={field.id} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3">
                        <dt className="text-xs text-gray-500 sm:text-right">{field.label}</dt>
                        <dd className="text-sm text-gray-800 sm:col-span-2 break-words">
                          {answer === '' ? <span className="text-gray-300">—</span> : answer}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
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
