import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiTrash2, FiSave, FiLoader, FiCheckCircle, FiAlertCircle, FiArrowUp, FiArrowDown, FiUser, FiHash } from 'react-icons/fi';
import * as apiService from '../../services/geminiService';
import AddColumnModal, { COLUMN_TYPE_LABELS } from '../boards/AddColumnModal';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { formulaRefDomKey } from '../../utils/formulaEngine';
import { ColumnType } from '../../types';
import type { PersonalHubTemplateColumn } from '../../types';

/** Org-admin editor for the Personal Hub default template: an "all groups" column-schema
 *  list only — no groups, items, or data. Materialized into a user's own Personal Hub
 *  (as non-deletable columns) the first time they have none. Edits are staged locally
 *  and persisted in one call via "Save Template". */
const PersonalHubTemplatePage: React.FC = () => {
  const navigate = useNavigate();
  const { isRecording, insertRef } = useFormulaRecording();

  const [columns, setColumns] = useState<PersonalHubTemplateColumn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { columns: loaded } = await apiService.getPersonalHubTemplate();
        if (!cancelled) setColumns([...loaded].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load the Personal Hub template.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAdd = (col: { name: string; type: ColumnType; settings: PersonalHubTemplateColumn['settings'] }) => {
    setColumns((prev) => [
      ...prev,
      { id: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: col.name, type: col.type, settings: col.settings, order: prev.length },
    ]);
    setIsDirty(true);
    setSaveState('idle');
  };

  const handleRemove = (id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i })));
    setIsDirty(true);
    setSaveState('idle');
  };

  const move = (index: number, direction: -1 | 1) => {
    setColumns((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
    setIsDirty(true);
    setSaveState('idle');
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveState('idle');
    setSaveError('');
    try {
      const { columns: saved } = await apiService.updatePersonalHubTemplate(columns);
      setColumns([...saved].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setIsDirty(false);
      setSaveState('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save the Personal Hub template.');
      setSaveState('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        type="button"
        onClick={() => navigate('/admin/templates')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
        aria-label="Back to Templates"
      >
        <FiArrowLeft size={14} aria-hidden="true" />
        Back to Templates
      </button>

      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
            <FiUser className="text-indigo-600" size={20} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Personal Hub Template</h1>
            <p className="text-sm text-gray-500 mt-1">
              Columns every user's Personal Hub starts with. No groups or data here — only "all groups" columns.
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700" role="alert">
          {loadError}
        </div>
      )}

      {isRecording && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700" role="status">
          <FiHash size={15} aria-hidden="true" />
          Recording a formula — click a Number column below to insert its running total across every user's Personal Hub.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <FiLoader size={24} className="animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {columns.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
              <p className="text-sm">No template columns yet.</p>
              <p className="text-xs text-center max-w-sm">
                Add columns below — every user's Personal Hub will start with them, ready to fill in with their own data.
              </p>
            </div>
          ) : (
            <ul role="list" aria-label="Personal Hub template columns" className="divide-y divide-gray-100">
              {columns.map((col, i) => {
                const canInsert = isRecording && col.type === ColumnType.NUMBER;
                const handleInsert = () => insertRef({ kind: 'ph', boardId: '', columnId: col.id, itemId: null });
                return (
                  <li
                    key={col.id}
                    data-formula-cell-key={formulaRefDomKey({ kind: 'ph', boardId: '', columnId: col.id, itemId: null })}
                    className={`flex items-center gap-3 px-4 py-3 ${canInsert ? 'cursor-pointer hover:bg-indigo-50 transition-colors' : ''}`}
                    onClick={canInsert ? handleInsert : undefined}
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); move(i, -1); }}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                        aria-label={`Move ${col.name} up`}
                      >
                        <FiArrowUp size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); move(i, 1); }}
                        disabled={i === columns.length - 1}
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                        aria-label={`Move ${col.name} down`}
                      >
                        <FiArrowDown size={13} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{col.name}</p>
                      <p className="text-xs text-gray-500">{COLUMN_TYPE_LABELS[col.type]}</p>
                    </div>
                    {canInsert && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleInsert(); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                        aria-label={`Insert running total of ${col.name}`}
                      >
                        <FiHash size={12} aria-hidden="true" />
                        Insert total
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemove(col.id); }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1.5"
                      aria-label={`Remove ${col.name} from template`}
                    >
                      <FiTrash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
              aria-label="Add a template column"
            >
              <FiPlus size={15} aria-hidden="true" />
              Add Column
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-6">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
          aria-label="Save Personal Hub template"
        >
          {isSaving ? <FiLoader size={16} className="animate-spin" aria-hidden="true" /> : <FiSave size={16} aria-hidden="true" />}
          {isSaving ? 'Saving…' : 'Save Template'}
        </button>
        {isDirty && saveState === 'idle' && (
          <span className="text-xs text-gray-500">You have unsaved changes.</span>
        )}
        {saveState === 'success' && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <FiCheckCircle size={15} aria-hidden="true" />
            Template saved.
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1.5 text-sm text-red-600" role="alert">
            <FiAlertCircle size={15} aria-hidden="true" />
            {saveError}
          </span>
        )}
      </div>

      {showAddModal && (
        <AddColumnModal mode="template" onSave={handleAdd} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
};

export default PersonalHubTemplatePage;
