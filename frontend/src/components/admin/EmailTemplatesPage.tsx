import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMail, FiSave, FiLoader, FiCheckCircle, FiAlertCircle, FiRefreshCw, FiSend, FiEye, FiCode, FiX, FiList, FiCopy } from 'react-icons/fi';
import type { EmailTemplate } from '../../types';
import * as apiService from '../../services/geminiService';

// ---------------------------------------------------------------------------
// Fields editor — helpers
// ---------------------------------------------------------------------------

interface FieldItem {
    fid: number;
    tag: string;
    label: string;
    value: string; // innerHTML of the element
}

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);

function parseFields(html: string): FieldItem[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result: FieldItem[] = [];
    let fid = 0;
    const counts: Record<string, number> = {};

    function walk(node: Element) {
        const tag = node.tagName.toLowerCase();
        const hasText = (node.textContent?.trim() ?? '').length > 0;

        if (BLOCK_TAGS.has(tag) && hasText) {
            counts[tag] = (counts[tag] ?? 0) + 1;
            const n = counts[tag];
            let label: string;
            if (tag === 'p') label = `Paragraph ${n}`;
            else if (tag === 'li') label = `List item ${n}`;
            else label = `Heading (${tag.toUpperCase()})` + (n > 1 ? ` ${n}` : '');
            result.push({ fid: fid++, tag, label, value: node.innerHTML });
            return;
        }

        if (tag === 'a' && hasText) {
            counts['a'] = (counts['a'] ?? 0) + 1;
            const n = counts['a'];
            result.push({ fid: fid++, tag: 'a', label: n === 1 ? 'Button' : `Button ${n}`, value: node.innerHTML });
            return;
        }

        for (const child of Array.from(node.children)) {
            walk(child);
        }
    }

    walk(doc.body);
    return result;
}

function applyFields(currentHtml: string, fields: FieldItem[]): string {
    const isFullDoc = currentHtml.trim().toLowerCase().startsWith('<!doctype');
    const doc = new DOMParser().parseFromString(currentHtml, 'text/html');
    let fid = 0;

    function walk(node: Element) {
        const tag = node.tagName.toLowerCase();
        const hasText = (node.textContent?.trim() ?? '').length > 0;

        if (BLOCK_TAGS.has(tag) && hasText) {
            const field = fields.find(f => f.fid === fid++);
            if (field) node.innerHTML = field.value;
            return;
        }

        if (tag === 'a' && hasText) {
            const field = fields.find(f => f.fid === fid++);
            if (field) node.innerHTML = field.value;
            return;
        }

        for (const child of Array.from(node.children)) {
            walk(child);
        }
    }

    walk(doc.body);
    return isFullDoc ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML : doc.body.innerHTML;
}

// ---------------------------------------------------------------------------
// Auto-resize textarea
// ---------------------------------------------------------------------------

interface AutoTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    value: string;
}

const AutoTextarea: React.FC<AutoTextareaProps> = ({ value, ...props }) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    return <textarea ref={ref} value={value} rows={1} {...props} />;
};

// ---------------------------------------------------------------------------
// Fields editor sub-component
// ---------------------------------------------------------------------------

interface FieldsEditorProps {
    fields: FieldItem[];
    variables: string[];
    onChange: (fid: number, newValue: string) => void;
}

const FieldsEditor: React.FC<FieldsEditorProps> = ({ fields, variables, onChange }) => {
    const { t } = useTranslation();
    const [copiedVar, setCopiedVar] = useState<string | null>(null);

    const copyVariable = (v: string) => {
        navigator.clipboard.writeText(`{{${v}}}`).then(() => {
            setCopiedVar(v);
            setTimeout(() => setCopiedVar(null), 1500);
        });
    };

    if (fields.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <FiList size={32} />
                <p className="text-sm">{t('emailTemplates.fieldsEditor.noFields')}</p>
                <p className="text-xs">{t('emailTemplates.fieldsEditor.noFieldsHint')}</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar px-6 pb-8 pt-2">
            {/* Variable copy chips */}
            {variables.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                        {t('emailTemplates.fieldsEditor.variablesHint')}
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {variables.map(v => (
                            <button
                                key={v}
                                onClick={() => copyVariable(v)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors"
                                title={`Copy {{${v}}} to clipboard`}
                                aria-label={`Copy variable ${v}`}
                            >
                                {copiedVar === v ? <FiCheckCircle size={11} /> : <FiCopy size={11} />}
                                {`{{${v}}}`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Field list */}
            <div className="space-y-5">
                {fields.map(field => (
                    <div key={field.fid}>
                        <div className="flex items-center gap-2 mb-1">
                            <label
                                htmlFor={`field-editor-${field.fid}`}
                                className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
                            >
                                {field.label}
                            </label>
                            {field.tag === 'a' && (
                                <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">
                                    button link
                                </span>
                            )}
                            {field.tag.startsWith('h') && (
                                <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5">
                                    heading
                                </span>
                            )}
                        </div>
                        <AutoTextarea
                            id={`field-editor-${field.fid}`}
                            value={field.value}
                            onChange={e => onChange(field.fid, e.target.value)}
                            className="w-full resize-none border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 bg-white leading-relaxed overflow-hidden"
                            spellCheck={false}
                            aria-label={`Edit ${field.label}`}
                            aria-multiline="true"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            {t('emailTemplates.fieldsEditor.htmlTagsNote')}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Test Email Modal
// ---------------------------------------------------------------------------

interface TestEmailModalProps {
    templateName: string;
    onClose: () => void;
    onSend: (email: string) => Promise<void>;
}

const TestEmailModal: React.FC<TestEmailModalProps> = ({ templateName, onClose, onSend }) => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSend = async () => {
        if (!email.includes('@')) return;
        setSending(true);
        setResult(null);
        try {
            await onSend(email);
            setResult({ type: 'success', text: t('emailTemplates.testModal.successText', { email }) });
        } catch {
            setResult({ type: 'error', text: t('emailTemplates.testModal.errorText') });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="test-email-modal-title">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-start mb-4">
                    <h2 id="test-email-modal-title" className="text-lg font-semibold text-gray-900">{t('emailTemplates.testModal.title')}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label={t('emailTemplates.testModal.closeAriaLabel')}><FiX size={20} /></button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                    {t('emailTemplates.testModal.description', { templateName })}
                </p>
                <label htmlFor="test-email-input" className="block text-sm font-medium text-gray-700 mb-1">{t('emailTemplates.testModal.recipientEmail')}</label>
                <input
                    id="test-email-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    aria-label="Recipient email address"
                />
                {result && (
                    <div className={`mt-3 flex items-center text-sm ${result.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {result.type === 'success' ? <FiCheckCircle className="mr-1.5" /> : <FiAlertCircle className="mr-1.5" />}
                        {result.text}
                    </div>
                )}
                <div className="mt-5 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                        {t('common.close')}
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={sending || !email.includes('@')}
                        className="flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                        aria-label={t('emailTemplates.testModal.sendAriaLabel')}
                    >
                        {sending ? <FiLoader className="animate-spin mr-2" /> : <FiSend className="mr-2" />}
                        {sending ? t('emailTemplates.testModal.sending') : t('emailTemplates.testModal.send')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Reset Confirm Modal
// ---------------------------------------------------------------------------

interface ResetConfirmModalProps {
    templateName: string;
    onClose: () => void;
    onConfirm: () => void;
}

const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({ templateName, onClose, onConfirm }) => {
    const { t } = useTranslation();
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h2 id="reset-confirm-title" className="text-lg font-semibold text-gray-900 mb-2">{t('emailTemplates.resetModal.title')}</h2>
                <p className="text-sm text-gray-500 mb-5">
                    {t('emailTemplates.resetModal.description', { templateName })}
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">{t('common.cancel')}</button>
                    <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700" aria-label={t('emailTemplates.resetModal.confirmAriaLabel')}>{t('emailTemplates.resetModal.resetButton')}</button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type ViewMode = 'code' | 'fields' | 'preview';

const EmailTemplatesPage: React.FC = () => {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editSubject, setEditSubject] = useState('');
    const [editHtml, setEditHtml] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('code');
    const [fields, setFields] = useState<FieldItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [testModalOpen, setTestModalOpen] = useState(false);
    const [resetModalOpen, setResetModalOpen] = useState(false);

    const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;

    // Load templates on mount
    useEffect(() => {
        (async () => {
            try {
                const data = await apiService.getEmailTemplates();
                setTemplates(data);
                if (data.length > 0) {
                    selectTemplate(data[0]);
                }
            } catch {
                setFeedback({ type: 'error', text: t('emailTemplates.page.failedToLoad') });
            } finally {
                setIsLoading(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectTemplate = useCallback((tpl: EmailTemplate) => {
        setSelectedId(tpl.id);
        setEditSubject(tpl.subject);
        setEditHtml(tpl.html);
        setFields([]);
        setIsDirty(false);
        setFeedback(null);
        setViewMode('code');
    }, []);

    const switchToMode = useCallback((mode: ViewMode, currentHtml: string) => {
        if (mode === 'fields') {
            setFields(parseFields(currentHtml));
        }
        setViewMode(mode);
    }, []);

    const handleSubjectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditSubject(e.target.value);
        setIsDirty(true);
    };

    const handleHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditHtml(e.target.value);
        setIsDirty(true);
    };

    const handleFieldChange = useCallback((fid: number, newValue: string) => {
        setFields(prev => {
            const updated = prev.map(f => f.fid === fid ? { ...f, value: newValue } : f);
            setEditHtml(currentHtml => {
                const rebuilt = applyFields(currentHtml, updated);
                return rebuilt;
            });
            return updated;
        });
        setIsDirty(true);
    }, []);

    const handleSave = async () => {
        if (!selectedId) return;
        setIsSaving(true);
        setFeedback(null);
        try {
            const updated = await apiService.updateEmailTemplate(selectedId, { subject: editSubject, html: editHtml });
            setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
            setIsDirty(false);
            setFeedback({ type: 'success', text: t('emailTemplates.page.savedSuccess') });
        } catch (err) {
            setFeedback({ type: 'error', text: (err as Error)?.message || t('emailTemplates.page.failedToSave') });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!selectedId) return;
        setResetModalOpen(false);
        setIsSaving(true);
        setFeedback(null);
        try {
            const updated = await apiService.resetEmailTemplate(selectedId);
            setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
            selectTemplate(updated);
            setFeedback({ type: 'success', text: t('emailTemplates.page.resetSuccess') });
        } catch {
            setFeedback({ type: 'error', text: t('emailTemplates.page.failedToReset') });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSendTest = async (email: string) => {
        if (!selectedId) throw new Error('No template selected');
        await apiService.sendTestEmail(selectedId, email);
    };

    // Auto-dismiss feedback
    useEffect(() => {
        if (!feedback) return;
        const t = setTimeout(() => setFeedback(null), 5000);
        return () => clearTimeout(t);
    }, [feedback]);

    // Warn before leaving with unsaved changes
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full" aria-label="Loading email templates">
                <FiLoader className="animate-spin text-indigo-600" size={32} />
            </div>
        );
    }

    const variables = selectedTemplate?.variables ?? [];

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* Page header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-200 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900">{t('emailTemplates.page.title')}</h1>
                <p className="text-sm text-gray-500 mt-1">
                    {t('emailTemplates.page.subtitle')}
                </p>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Left panel — template list */}
                <aside className="w-72 flex-shrink-0 border-r border-gray-200 overflow-y-auto custom-scrollbar bg-gray-50" aria-label="Email template list">
                    <nav className="p-3 space-y-1">
                        {templates.map(tpl => (
                            <button
                                key={tpl.id}
                                onClick={() => {
                                    if (isDirty && !window.confirm(t('emailTemplates.page.unsavedChangesConfirm'))) return;
                                    selectTemplate(tpl);
                                }}
                                className={`w-full text-left px-3 py-3 rounded-lg transition-colors group ${
                                    selectedId === tpl.id
                                        ? 'bg-indigo-50 border border-indigo-200'
                                        : 'hover:bg-gray-100 border border-transparent'
                                }`}
                                aria-label={`Select ${tpl.name} email template`}
                                aria-pressed={selectedId === tpl.id}
                            >
                                <div className="flex items-center gap-2">
                                    <FiMail
                                        className={`flex-shrink-0 ${selectedId === tpl.id ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`}
                                        size={16}
                                    />
                                    <span className={`text-sm font-medium truncate ${selectedId === tpl.id ? 'text-indigo-700' : 'text-gray-800'}`}>
                                        {tpl.name}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5 pl-6 line-clamp-2 leading-snug">{tpl.description}</p>
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* Right panel — editor */}
                {selectedTemplate ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Editor toolbar */}
                        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.name}</h2>
                                <p className="text-sm text-gray-500">{selectedTemplate.description}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {feedback && (
                                    <span className={`flex items-center text-sm ${feedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                        {feedback.type === 'success' ? <FiCheckCircle className="mr-1" /> : <FiAlertCircle className="mr-1" />}
                                        {feedback.text}
                                    </span>
                                )}
                                <button
                                    onClick={() => setTestModalOpen(true)}
                                    className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                    aria-label={t('emailTemplates.page.testAriaLabel')}
                                >
                                    <FiSend className="mr-1.5" size={14} /> {t('emailTemplates.page.test')}
                                </button>
                                <button
                                    onClick={() => setResetModalOpen(true)}
                                    className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                    aria-label={t('emailTemplates.page.resetAriaLabel')}
                                >
                                    <FiRefreshCw className="mr-1.5" size={14} /> {t('emailTemplates.page.reset')}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !isDirty}
                                    className={`flex items-center px-4 py-1.5 text-sm font-medium text-white rounded-md disabled:opacity-50 ${
                                        isDirty ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-orange-400 ring-offset-1' : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                                    aria-label={t('emailTemplates.page.saveAriaLabel')}
                                >
                                    {isSaving ? <FiLoader className="animate-spin mr-1.5" size={14} /> : <FiSave className="mr-1.5" size={14} />}
                                    {isSaving ? t('emailTemplates.page.saving') : t('emailTemplates.page.save')}
                                </button>
                            </div>
                        </div>

                        {/* Variable chips (code + preview modes only — fields mode handles its own) */}
                        {viewMode !== 'fields' && variables.length > 0 && (
                            <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex-shrink-0">
                                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide mr-2">{t('emailTemplates.page.availableVariables')}</span>
                                {variables.map(v => (
                                    <button
                                        key={v}
                                        onClick={() => {
                                            if (viewMode !== 'code') return;
                                            const el = document.getElementById('html-editor') as HTMLTextAreaElement | null;
                                            if (!el) return;
                                            const start = el.selectionStart;
                                            const end = el.selectionEnd;
                                            const tag = `{{${v}}}`;
                                            const next = editHtml.slice(0, start) + tag + editHtml.slice(end);
                                            setEditHtml(next);
                                            setIsDirty(true);
                                            requestAnimationFrame(() => {
                                                el.selectionStart = el.selectionEnd = start + tag.length;
                                                el.focus();
                                            });
                                        }}
                                        className="inline-flex items-center mr-1 mb-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors cursor-pointer"
                                        title={viewMode === 'code' ? `Click to insert {{${v}}} at cursor` : `{{${v}}}`}
                                        aria-label={`Insert variable ${v}`}
                                    >
                                        {`{{${v}}}`}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Subject field */}
                        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
                            <label htmlFor="subject-input" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('emailTemplates.page.subject')}</label>
                            <input
                                id="subject-input"
                                type="text"
                                value={editSubject}
                                onChange={handleSubjectChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                                aria-label="Email subject line"
                            />
                        </div>

                        {/* Mode toggle + editor area */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-6 pt-3 pb-2 flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={() => switchToMode('fields', editHtml)}
                                    className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${viewMode === 'fields' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    aria-label="Switch to fields editor"
                                    aria-pressed={viewMode === 'fields'}
                                >
                                    <FiList className="mr-1" size={13} /> {t('emailTemplates.page.fieldsEditor')}
                                </button>
                                <button
                                    onClick={() => switchToMode('code', editHtml)}
                                    className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${viewMode === 'code' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    aria-label="Switch to HTML code editor"
                                    aria-pressed={viewMode === 'code'}
                                >
                                    <FiCode className="mr-1" size={13} /> {t('emailTemplates.page.htmlEditor')}
                                </button>
                                <button
                                    onClick={() => switchToMode('preview', editHtml)}
                                    className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${viewMode === 'preview' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                    aria-label="Switch to email preview"
                                    aria-pressed={viewMode === 'preview'}
                                >
                                    <FiEye className="mr-1" size={13} /> {t('emailTemplates.page.preview')}
                                </button>
                                {isDirty && (
                                    <span className="ml-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-300 rounded px-2 py-0.5">
                                        {t('emailTemplates.page.unsavedChanges')}
                                    </span>
                                )}
                            </div>

                            <div className="flex-1 overflow-hidden px-6 pb-6">
                                {viewMode === 'fields' && (
                                    <FieldsEditor
                                        fields={fields}
                                        variables={variables}
                                        onChange={handleFieldChange}
                                    />
                                )}
                                {viewMode === 'code' && (
                                    <textarea
                                        id="html-editor"
                                        value={editHtml}
                                        onChange={handleHtmlChange}
                                        className="w-full h-full resize-none border border-gray-300 rounded-md p-3 font-mono text-xs text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 leading-relaxed custom-scrollbar"
                                        spellCheck={false}
                                        aria-label="Email HTML body editor"
                                        aria-multiline="true"
                                    />
                                )}
                                {viewMode === 'preview' && (
                                    <div className="w-full h-full border border-gray-300 rounded-md overflow-hidden">
                                        <iframe
                                            srcDoc={editHtml}
                                            title={t('emailTemplates.page.previewIframeTitle')}
                                            className="w-full h-full bg-white"
                                            sandbox="allow-same-origin"
                                            aria-label={t('emailTemplates.page.previewIframeTitle')}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                        <p>{t('emailTemplates.page.selectTemplate')}</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            {testModalOpen && selectedTemplate && (
                <TestEmailModal
                    templateName={selectedTemplate.name}
                    onClose={() => setTestModalOpen(false)}
                    onSend={handleSendTest}
                />
            )}
            {resetModalOpen && selectedTemplate && (
                <ResetConfirmModal
                    templateName={selectedTemplate.name}
                    onClose={() => setResetModalOpen(false)}
                    onConfirm={handleReset}
                />
            )}
        </div>
    );
};

export default EmailTemplatesPage;
