import React, { useRef, useEffect, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import { previewEditionHtml } from '../../../services/geminiService';
import { useAuth } from '../../../hooks/useAuth';
import { useData } from '../../../hooks/useData';

interface Props {
  campaignId: string;
  title: string;
  subtitle: string;
  mainText: string;
  showLogoInHeader?: boolean;
  onClose: () => void;
}

const EditionPreviewModal: React.FC<Props> = ({ campaignId, title, subtitle, mainText, showLogoInHeader, onClose }) => {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const { authUser } = useAuth();
  const { academySettings } = useData();
  const displaySubject = useMemo(() => {
    const text = title || '';
    return text
      .replace(/\{user_name\}/g, authUser?.name || 'User')
      .replace(/\{academy_name\}/g, academySettings?.appName || 'Academy')
      .replace(/\{organization_name\}/g, 'Organization');
  }, [title, authUser?.name, academySettings?.appName]);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      setLoading(true);
      try {
        const { html } = await previewEditionHtml(campaignId, { title, subtitle, mainText, showLogoInHeader });
        if (cancelled) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write(html);
        doc.close();
      } catch {
        if (cancelled) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        doc.open();
        doc.write('<p style="color:#ef4444;padding:16px;">Failed to load preview.</p>');
        doc.close();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadPreview();
    return () => { cancelled = true; };
  }, [campaignId, title, subtitle, mainText, showLogoInHeader]);

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{t('marketing.preview.subject')}</p>
            <h2 id="preview-modal-title" className="text-base font-semibold text-gray-900 truncate">
              {displaySubject || <em className="text-gray-400 font-normal">{t('marketing.preview.noSubject')}</em>}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label={t('marketing.preview.closeAriaLabel')}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Sandboxed preview */}
        <div className="flex-1 overflow-hidden rounded-b-2xl relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10" role="status" aria-label="Loading preview">
              <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            title="Email preview"
            sandbox="allow-same-origin"
            className="w-full h-full"
            style={{ minHeight: '480px', border: 'none' }}
            aria-label="Email content preview"
          />
        </div>
      </div>
    </div>
  );

  const modalRoot = document.getElementById('modal-root');
  return modalRoot ? ReactDOM.createPortal(modalContent, modalRoot) : modalContent;
};

export default EditionPreviewModal;
