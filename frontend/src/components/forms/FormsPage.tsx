import React, { useCallback, useEffect, useState } from 'react';
import {
  FiFileText, FiEdit, FiPlusCircle, FiArchive, FiCheckCircle, FiAlertCircle, FiBarChart2,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '../../hooks/useAuthSession';
import { UserRole } from '../../types';
import type { Form } from '../../types';
import {
  useForms, useCreateForm, useUpdateForm, useArchiveForm, useRestoreForm,
} from '../../hooks/queries/useFormQueries';
import ArchiveRestoreModal from '../admin/shared/ArchiveRestoreModal';
import FormBuilderModal from './FormBuilderModal';
import FormResultsModal from './FormResultsModal';

/** Same palette the WorkHubs cards cycle through, so the two pages read as a set. */
const CARD_COLORS = ['#4299E133', '#48BB7833', '#9F7AEA33', '#ED893633', '#38B2AC33', '#667EEA33'];

const FormsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  // Same bar as Templates — the route already restricts the page to these roles;
  // this keeps the page's own actions consistent if that ever loosens.
  const canManage =
    user?.role === UserRole.ORGANIZATION_ADMIN ||
    user?.role === UserRole.WORKSPACE_ADMIN ||
    user?.role === UserRole.SYSTEM_ADMIN;

  const [builderOpen, setBuilderOpen] = useState(false);
  const [formToEdit, setFormToEdit] = useState<Form | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [resultsForm, setResultsForm] = useState<Form | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: forms = [], isLoading } = useForms();
  // Archived forms are only needed once the restore modal is open.
  const { data: archivedForms = [], refetch: refetchArchived } = useForms(true, isArchiveModalOpen);
  const { mutateAsync: createForm, isPending: isCreating } = useCreateForm();
  const { mutateAsync: updateForm, isPending: isUpdating } = useUpdateForm();
  const { mutateAsync: archiveForm } = useArchiveForm();
  const { mutateAsync: restoreForm } = useRestoreForm();

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const closeBuilder = () => {
    setBuilderOpen(false);
    setFormToEdit(null);
    setModalError(null);
  };

  const handleSave = async (data: { name: string; description: string; fields: Form['fields'] }) => {
    setModalError(null);
    try {
      if (formToEdit) {
        await updateForm({ id: formToEdit.id, patch: data });
        setFeedback({ type: 'success', text: `Form "${data.name}" updated.` });
      } else {
        await createForm(data);
        setFeedback({ type: 'success', text: `Form "${data.name}" created.` });
      }
      closeBuilder();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to save the form.');
    }
  };

  const handleArchive = async () => {
    if (!formToEdit) return;
    setModalError(null);
    try {
      await archiveForm(formToEdit.id);
      setFeedback({ type: 'success', text: `Form "${formToEdit.name}" archived.` });
      closeBuilder();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to archive the form.');
    }
  };

  const handleRestore = useCallback(async (id: string) => {
    try {
      await restoreForm(id);
      setFeedback({ type: 'success', text: 'Form restored.' });
      return true;
    } catch {
      setFeedback({ type: 'error', text: 'Failed to restore the form.' });
      return false;
    }
  }, [restoreForm]);

  const fetchArchived = useCallback(() => { void refetchArchived(); }, [refetchArchived]);

  if (isLoading && forms.length === 0) {
    return (
      <div className="flex justify-center items-center h-64" role="status" aria-label={t('common.loading')}>
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center">
          <FiFileText className="mr-3 text-blue-500" aria-hidden="true" />{t('layout.forms', 'Forms')}
        </h1>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsArchiveModalOpen(true)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center text-sm transition-colors"
              aria-label={t('common.viewArchived')}
            >
              <FiArchive className="mr-2" aria-hidden="true" /> {t('common.viewArchived')}
            </button>
            <button
              onClick={() => { setFormToEdit(null); setBuilderOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center text-sm transition-colors"
              aria-label="Add form"
            >
              <FiPlusCircle className="mr-2" aria-hidden="true" /> Add Form
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
          role="alert"
        >
          {feedback.type === 'success'
            ? <FiCheckCircle className="mr-2" aria-hidden="true" />
            : <FiAlertCircle className="mr-2" aria-hidden="true" />}
          {feedback.text}
          <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label="Dismiss">&times;</button>
        </div>
      )}

      {forms.length === 0 ? (
        <p className="text-gray-500">
          {canManage ? 'No forms yet. Add one using the button above.' : 'No forms found.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list" aria-label="Forms">
          {forms.map((form, index) => (
            <div key={form.id} className="relative group" role="listitem">
              <button
                type="button"
                onClick={() => { setFormToEdit(form); setBuilderOpen(true); }}
                disabled={!canManage}
                aria-label={canManage ? `Edit form ${form.name}` : `Form ${form.name}`}
                className="w-full min-h-[6.5rem] text-left flex items-start gap-4 p-5 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all disabled:cursor-default disabled:hover:shadow-sm"
                style={{ backgroundColor: CARD_COLORS[index % CARD_COLORS.length] }}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white bg-opacity-60">
                  <FiFileText className="text-gray-700" size={20} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{form.name}</p>
                  {form.description && (
                    <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{form.description}</p>
                  )}
                </div>
              </button>
              {canManage && (
                <div className="absolute top-2 right-2 flex items-center gap-1 pointer-events-none opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setResultsForm(form)}
                    className="pointer-events-auto p-1.5 rounded-full bg-white shadow-sm border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
                    aria-label={`View results for ${form.name}`}
                    title="View results"
                  >
                    <FiBarChart2 size={14} aria-hidden="true" />
                  </button>
                  {/* The card itself is the edit target; this is just its affordance — the
                      whole row is pointer-events-none so hover/cursor fall through to the
                      card button underneath, with the results button opting back in above. */}
                  <span
                    className="p-1.5 rounded-full bg-white shadow-sm border border-gray-200 text-gray-500"
                    aria-hidden="true"
                  >
                    <FiEdit size={14} />
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {builderOpen && (
        <FormBuilderModal
          form={formToEdit}
          onClose={closeBuilder}
          onSave={handleSave}
          onArchive={formToEdit ? handleArchive : undefined}
          isSaving={isCreating || isUpdating}
          error={modalError}
        />
      )}

      {resultsForm && (
        <FormResultsModal form={resultsForm} onClose={() => setResultsForm(null)} />
      )}

      {canManage && (
        <ArchiveRestoreModal
          isOpen={isArchiveModalOpen}
          onClose={() => setIsArchiveModalOpen(false)}
          title="Archived Forms"
          items={archivedForms.map((f) => ({ id: f.id, name: f.name }))}
          onRestore={handleRestore}
          fetchItems={fetchArchived}
        />
      )}
    </div>
  );
};

export default FormsPage;
