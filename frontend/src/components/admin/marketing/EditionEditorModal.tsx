import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiX, FiEye, FiCpu } from 'react-icons/fi';
import { NewsletterEdition } from '../../../types';
import { updateEdition } from '../../../services/geminiService';
import EditionPreviewModal from './EditionPreviewModal';
import EditionAiWizard from './EditionAiWizard';

interface Props {
  campaignId: string;
  edition: NewsletterEdition | null;
  onClose: () => void;
  onSave: (saved: NewsletterEdition) => void;
}

const EditionEditorModal: React.FC<Props> = ({ campaignId, edition, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(edition?.title ?? '');
  const [subtitle, setSubtitle] = useState(edition?.subtitle ?? '');
  const [mainText, setMainText] = useState(edition?.mainText ?? '');
  const [showLogoInHeader, setShowLogoInHeader] = useState(edition?.showLogoInHeader ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showAiWizard, setShowAiWizard] = useState(false);

  const handleSave = async (newStatus?: 'draft' | 'scheduled') => {
    if (!edition) return;
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {
        title,
        subtitle,
        mainText,
        subject: title,
        showLogoInHeader,
      };
      if (newStatus) {
        data.status = newStatus;
      }
      const saved = await updateEdition(campaignId, edition.id, data);
      onSave(saved);
    } catch (e: any) {
      setError(e.message || 'Failed to save edition.');
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edition-editor-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 id="edition-editor-title" className="text-xl font-bold text-gray-900">
            {t('marketing.editionEditor.title')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 border border-indigo-300 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              aria-label={t('marketing.editionEditor.createWithAiAriaLabel')}
            >
              <FiCpu size={14} aria-hidden="true" /> {t('marketing.editionEditor.createWithAi')}
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label={t('marketing.editionEditor.previewAriaLabel')}
            >
              <FiEye size={14} aria-hidden="true" /> {t('marketing.editionEditor.preview')}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label={t('marketing.editionEditor.closeAriaLabel')}
            >
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Show logo in header checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="edition-show-logo"
              type="checkbox"
              checked={showLogoInHeader}
              onChange={e => setShowLogoInHeader(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              aria-label={t('marketing.editionEditor.showLogoAriaLabel')}
            />
            <label htmlFor="edition-show-logo" className="text-sm text-gray-700">
              {t('marketing.editionEditor.showLogoLabel')}
            </label>
          </div>

          {/* Personalization variables note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            <span className="font-semibold">{t('marketing.editionEditor.personalizationNote')}</span> {t('marketing.editionEditor.personalizationDesc', { user_name: '{user_name}', academy_name: '{academy_name}', organization_name: '{organization_name}' })}
          </div>

          {/* Title */}
          <div>
            <label htmlFor="edition-title" className="block text-sm font-medium text-gray-700 mb-1">
              {t('marketing.editionEditor.titleField')} <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
              id="edition-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('marketing.editionEditor.titlePlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-required="true"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('marketing.editionEditor.titleNote')}
            </p>
          </div>

          {/* Subtitle */}
          <div>
            <label htmlFor="edition-subtitle" className="block text-sm font-medium text-gray-700 mb-1">
              {t('marketing.editionEditor.subtitleField')}
            </label>
            <input
              id="edition-subtitle"
              type="text"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
              placeholder={t('marketing.editionEditor.subtitlePlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Main Text */}
          <div className="flex-1">
            <label htmlFor="edition-main-text" className="block text-sm font-medium text-gray-700 mb-1">
              {t('marketing.editionEditor.mainTextField')}
            </label>
            <textarea
              id="edition-main-text"
              value={mainText}
              onChange={e => setMainText(e.target.value)}
              placeholder={t('marketing.editionEditor.mainTextPlaceholder')}
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              aria-label="Newsletter main text content"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('marketing.editionEditor.mainTextNote')}
            </p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave('draft')}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            aria-busy={saving}
          >
            {saving ? t('marketing.editionEditor.saving') : t('marketing.editionEditor.saveDraft')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave('scheduled')}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            aria-busy={saving}
          >
            {saving ? t('marketing.editionEditor.saving') : t('marketing.editionEditor.saveFinal')}
          </button>
        </div>
      </div>

      {showPreview && (
        <EditionPreviewModal
          campaignId={campaignId}
          title={title}
          subtitle={subtitle}
          mainText={mainText}
          showLogoInHeader={showLogoInHeader}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showAiWizard && (
        <EditionAiWizard
          campaignId={campaignId}
          initialTitle={title}
          initialSubtitle={subtitle}
          initialMainText={mainText}
          onClose={() => setShowAiWizard(false)}
          onApply={(newTitle, newSubtitle, newMainText) => {
            setTitle(newTitle);
            setSubtitle(newSubtitle);
            setMainText(newMainText);
            setShowAiWizard(false);
          }}
        />
      )}
    </div>
  );

  const modalRoot = document.getElementById('modal-root');
  return modalRoot ? ReactDOM.createPortal(modalContent, modalRoot) : modalContent;
};

export default EditionEditorModal;
