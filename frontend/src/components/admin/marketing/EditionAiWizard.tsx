import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiSend, FiX, FiCheck, FiCpu, FiMessageSquare, FiSliders } from 'react-icons/fi';
import { aiGenerateEdition, previewEditionHtml } from '../../../services/geminiService';

const renderWithBold = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
};

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

interface Props {
  campaignId: string;
  initialTitle: string;
  initialSubtitle: string;
  initialMainText: string;
  onClose: () => void;
  onApply: (title: string, subtitle: string, mainText: string) => void;
}

const EditionAiWizard: React.FC<Props> = ({
  campaignId,
  initialTitle,
  initialSubtitle,
  initialMainText,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([{
    id: 'init',
    role: 'ai',
    text: "I'm ready to help you write your newsletter. What topic or message would you like to cover in this edition?",
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [mainText, setMainText] = useState(initialMainText);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Update iframe preview when content changes
  const updatePreview = useCallback(async () => {
    try {
      const { html } = await previewEditionHtml(campaignId, { title, subtitle, mainText });
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      // Silently fail preview updates
    }
  }, [campaignId, title, subtitle, mainText]);

  useEffect(() => {
    void updatePreview();
  }, [updatePreview]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Build conversation history for API (exclude init message)
    const history = messages
      .filter(m => m.id !== 'init')
      .map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, text: m.text }));

    try {
      const result = await aiGenerateEdition(campaignId, {
        conversationHistory: history,
        currentEdition: { title, subtitle, mainText },
        userMessage: text,
      });

      if (result.updatedEdition?.title !== undefined) setTitle(result.updatedEdition.title);
      if (result.updatedEdition?.subtitle !== undefined) setSubtitle(result.updatedEdition.subtitle);
      if (result.updatedEdition?.mainText !== undefined) setMainText(result.updatedEdition.mainText);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: result.aiResponse ?? 'Done! Check the preview on the right.',
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: `Sorry, something went wrong: ${err.message || 'Unknown error'}. Please try again.`,
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-wizard-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ height: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FiCpu className="text-indigo-600" size={20} aria-hidden="true" />
            <h2 id="ai-wizard-title" className="text-xl font-bold text-gray-900">{t('marketing.aiWizard.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile panel toggle */}
            <button
              onClick={() => setIsFormVisible(v => !v)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label={isFormVisible ? t('marketing.aiWizard.showChat') : t('marketing.aiWizard.showPreview')}
            >
              {isFormVisible ? <FiMessageSquare size={18} /> : <FiSliders size={18} />}
            </button>
            <button
              onClick={() => onApply(title, subtitle, mainText)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              aria-label={t('marketing.aiWizard.applyToEditorAriaLabel')}
            >
              <FiCheck size={14} aria-hidden="true" /> {t('marketing.aiWizard.applyToEditor')}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label={t('marketing.aiWizard.closeAriaLabel')}
            >
              <FiX size={20} />
            </button>
          </div>
        </div>

        {/* Body: two panels */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left — Chat (hidden on mobile when preview active) */}
          <div className={`flex flex-col border-r border-gray-200 ${isFormVisible ? 'hidden md:flex' : 'flex'} md:w-1/2 w-full`}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite" aria-label="Chat messages">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {renderWithBold(msg.text)}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3" aria-label="AI is typing">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('marketing.aiWizard.inputPlaceholder')}
                rows={2}
                className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Chat input"
                disabled={isTyping}
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isTyping}
                className="self-end p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                aria-label={t('marketing.aiWizard.sendMessageAriaLabel')}
              >
                <FiSend size={16} />
              </button>
            </div>
          </div>

          {/* Right — Preview (hidden on mobile when chat active) */}
          <div className={`flex flex-col ${isFormVisible ? 'flex' : 'hidden md:flex'} md:w-1/2 w-full`}>
            {/* Content fields summary */}
            <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex-shrink-0 space-y-2">
              <div>
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('marketing.aiWizard.titleLabel')}</span>
                <p className="text-sm text-gray-900 truncate">{title || <em className="text-gray-400">{t('marketing.aiWizard.aiWillGenerate')}</em>}</p>
              </div>
              {subtitle && (
                <div>
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{t('marketing.aiWizard.subtitleLabel')}</span>
                  <p className="text-sm text-gray-900 truncate">{subtitle}</p>
                </div>
              )}
            </div>

            {/* Themed HTML Preview */}
            <div className="flex-1 overflow-hidden">
              <iframe
                ref={iframeRef}
                title="Newsletter preview"
                sandbox="allow-same-origin"
                className="w-full h-full"
                style={{ border: 'none' }}
                aria-label="Live newsletter preview"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const modalRoot = document.getElementById('modal-root');
  return modalRoot ? ReactDOM.createPortal(modalContent, modalRoot) : modalContent;
};

export default EditionAiWizard;
