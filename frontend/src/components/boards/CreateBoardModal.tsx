import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiX, FiLayout, FiChevronDown, FiBookmark } from 'react-icons/fi';
import { useCreateBoard, useBoardTemplates } from '../../hooks/queries/useBoardQueries';
import { useWorkspacesQuery } from '../../hooks/queries/useOrganizationQueries';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import EmojiPicker from './EmojiPicker';
import type { DuplicateMode } from '../../services/workManagementService';

const TEMPLATE_MODE_OPTIONS: { value: DuplicateMode; label: string }[] = [
  { value: 'columns_only', label: 'Columns only' },
  { value: 'columns_groups', label: 'Columns + groups' },
  { value: 'columns_groups_items', label: 'Columns + groups + items' },
  { value: 'full', label: 'Columns + groups + items + data' },
];

interface CreateBoardModalProps {
  workspaceId?: string;
  isTemplate?: boolean;
  onClose: () => void;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ workspaceId, isTemplate, onClose }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [error, setError] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateMode, setTemplateMode] = useState<DuplicateMode>('full');
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const { mutateAsync: createBoard, isPending } = useCreateBoard();
  const { data: templates = [] } = useBoardTemplates(!isTemplate);
  // Workspace picker only needed for non-template boards
  const { data: allWorkspaces = [] } = useWorkspacesQuery(undefined, !isTemplate && !workspaceId);

  const regularWorkspaces = allWorkspaces.filter((w) => !w.isPersonal && !w.isTemplates);

  // For template boards, workspaceId is determined by the backend (templates workspace).
  // For regular boards, use the provided workspaceId or the picker selection.
  const effectiveWorkspaceId = isTemplate
    ? undefined
    : (workspaceId ?? (selectedWorkspaceId || (regularWorkspaces[0]?.id ?? '')));

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSelectedTemplateId(templateId);
      if (!name.trim()) setName(template.name);
      if (!description.trim() && template.description) setDescription(template.description);
    }
    setShowTemplatePicker(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Board name is required.');
      return;
    }
    if (!isTemplate && !effectiveWorkspaceId) {
      setError('No WorkHub selected. Please navigate into a WorkHub first.');
      return;
    }
    setError('');
    try {
      const finalName = selectedEmoji ? `${selectedEmoji} ${trimmed}` : trimmed;
      const board = await createBoard({
        name: finalName,
        description: description.trim() || undefined,
        ...(isTemplate ? { isTemplate: true } : { workspaceId: effectiveWorkspaceId }),
        ...(selectedTemplateId ? { templateId: selectedTemplateId, templateMode } : {}),
      });
      onClose();
      navigate(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board.');
    }
  };

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  const selectedTemplate = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;
  const selectedWorkspace = regularWorkspaces.find((w) => w.id === (selectedWorkspaceId || regularWorkspaces[0]?.id));

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-title"
    >
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${isTemplate ? 'bg-amber-100' : 'bg-indigo-100'} rounded-lg flex items-center justify-center`}>
              {isTemplate ? (
                <FiBookmark className="text-amber-600" size={16} aria-hidden="true" />
              ) : (
                <FiLayout className="text-indigo-600" size={16} aria-hidden="true" />
              )}
            </div>
            <h2 id="create-board-title" className="text-lg font-semibold text-gray-800">
              {isTemplate ? 'New Template' : 'New Board'}
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

        <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {/* Workspace picker — only for regular boards without a pre-set workspaceId */}
            {!isTemplate && !workspaceId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WorkHub <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowWorkspacePicker((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm text-left hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                    aria-label="Select a WorkHub"
                    aria-expanded={showWorkspacePicker}
                    aria-haspopup="listbox"
                  >
                    <span className="text-gray-700">
                      {selectedWorkspace?.name ?? (regularWorkspaces[0]?.name ?? <span className="text-gray-400">Select a WorkHub…</span>)}
                    </span>
                    <FiChevronDown
                      size={14}
                      className="text-gray-400 flex-shrink-0 transition-transform"
                      style={{ transform: showWorkspacePicker ? 'rotate(180deg)' : 'none' }}
                      aria-hidden="true"
                    />
                  </button>
                  {showWorkspacePicker && (
                    <ul
                      role="listbox"
                      aria-label="Available WorkHubs"
                      className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    >
                      {regularWorkspaces.map((w) => (
                        <li
                          key={w.id}
                          role="option"
                          aria-selected={w.id === (selectedWorkspaceId || regularWorkspaces[0]?.id)}
                          onClick={() => { setSelectedWorkspaceId(w.id); setShowWorkspacePicker(false); }}
                          className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${w.id === (selectedWorkspaceId || regularWorkspaces[0]?.id) ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-700'}`}
                        >
                          {w.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: w.color }}
                              aria-hidden="true"
                            />
                          )}
                          {w.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Name + Template picker in one row */}
            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <label htmlFor="board-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <input
                  id="board-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isTemplate ? 'e.g. Project Kickoff' : 'e.g. Q3 Roadmap'}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  aria-required="true"
                  aria-describedby={error ? 'board-error' : undefined}
                />
              </div>

              {!isTemplate && templates.length > 0 && (
                <div className="w-48 flex-shrink-0">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Use template <span className="text-gray-400 font-normal text-xs">(optional)</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm text-left hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                      aria-label="Select a template"
                      aria-expanded={showTemplatePicker}
                      aria-haspopup="listbox"
                    >
                      <span className="flex items-center gap-2 text-gray-700 truncate">
                        {selectedTemplate ? (
                          <>
                            <FiBookmark size={14} className="text-amber-500 flex-shrink-0" aria-hidden="true" />
                            <span className="truncate">{selectedTemplate.name}</span>
                          </>
                        ) : (
                          <span className="text-gray-400 truncate">Select…</span>
                        )}
                      </span>
                      <FiChevronDown
                        size={14}
                        className="text-gray-400 flex-shrink-0 transition-transform ml-1"
                        style={{ transform: showTemplatePicker ? 'rotate(180deg)' : 'none' }}
                        aria-hidden="true"
                      />
                    </button>
                    {showTemplatePicker && (
                      <ul
                        role="listbox"
                        aria-label="Available templates"
                        className="absolute z-10 w-56 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
                      >
                        {selectedTemplateId && (
                          <li
                            role="option"
                            aria-selected={false}
                            onClick={() => { setSelectedTemplateId(null); setShowTemplatePicker(false); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer"
                          >
                            None
                          </li>
                        )}
                        {templates.map((t) => (
                          <li
                            key={t.id}
                            role="option"
                            aria-selected={t.id === selectedTemplateId}
                            onClick={() => handleTemplateSelect(t.id)}
                            className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${t.id === selectedTemplateId ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-700'}`}
                          >
                            <FiBookmark size={13} className="text-amber-500 flex-shrink-0" aria-hidden="true" />
                            {t.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Inline mode selector */}
            {!isTemplate && selectedTemplateId && (
              <div className="space-y-1.5" role="radiogroup" aria-label="What to copy from the template">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Copy from template</p>
                {TEMPLATE_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      templateMode === opt.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template-mode"
                      value={opt.value}
                      checked={templateMode === opt.value}
                      onChange={() => setTemplateMode(opt.value)}
                      className="accent-indigo-600"
                      aria-label={opt.label}
                    />
                    <span className={`text-sm ${templateMode === opt.value ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Icon
                {selectedEmoji && <span className="ml-2 text-lg">{selectedEmoji}</span>}
              </label>
              <EmojiPicker selected={selectedEmoji} onChange={setSelectedEmoji} />
            </div>

            <div>
              <label htmlFor="board-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="board-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — describe the board's purpose"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p id="board-error" className="text-xs text-red-600" role="alert">
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
              disabled={isPending || (!isTemplate && !effectiveWorkspaceId)}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${isTemplate ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              aria-label={isTemplate ? 'Create template' : 'Create board'}
            >
              {isPending ? 'Creating…' : isTemplate ? 'Create Template' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    modalRoot
  );
};

export default CreateBoardModal;
