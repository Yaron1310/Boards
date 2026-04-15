import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { FiSend, FiX, FiCheck, FiCpu, FiMessageSquare, FiCode, FiEye } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { aiGenerateAssignmentHtml } from '../../../services/geminiService';

const renderWithBold = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
};

export interface Message {
  id: string;
  role: 'user' | 'ai' | 'system';
  text: string;
}

const INITIAL_AI_MESSAGE: Message = {
  id: 'init',
  role: 'ai',
  text: "I'm ready to help you build your HTML assignment. Describe the interactive exercise you'd like to create.",
};

// Script injected into every iframe to forward runtime JS errors to the parent frame.
const IFRAME_ERROR_BRIDGE = `<script>
window.onerror = function(msg, src, line, col) {
  window.parent.postMessage({ type: 'GYMIND_IFRAME_ERROR', error: String(msg) }, '*');
  return true;
};
window.addEventListener('unhandledrejection', function(e) {
  window.parent.postMessage({ type: 'GYMIND_IFRAME_ERROR', error: 'Unhandled promise rejection: ' + String(e.reason) }, '*');
});
</script>`;

function assemblePreview(html: string, css: string, js: string): string {
  let result = html;
  // Inject error bridge first so it catches errors from user's own scripts
  if (result.includes('<body>')) {
    result = result.replace('<body>', `<body>\n${IFRAME_ERROR_BRIDGE}`);
  } else if (result.includes('<body ')) {
    result = result.replace(/<body([^>]*)>/, `<body$1>\n${IFRAME_ERROR_BRIDGE}`);
  } else {
    result = IFRAME_ERROR_BRIDGE + result;
  }
  if (css) {
    const tag = `<style>\n${css}\n</style>`;
    result = result.includes('</head>') ? result.replace('</head>', `${tag}\n</head>`) : tag + result;
  }
  if (js) {
    const tag = `<script>\n${js}\n</script>`;
    result = result.includes('</body>') ? result.replace('</body>', `${tag}\n</body>`) : result + tag;
  }
  return result;
}

const MAX_AUTO_RETRIES = 2;

interface Props {
  initialHtml: string;
  initialCss: string;
  initialJs: string;
  onClose: () => void;
  onApply: (html: string, css: string, js: string) => void;
  initialMessages?: Message[];
  onSessionChange?: (messages: Message[], html: string, css: string, js: string) => void;
}

const AssignmentHtmlAiWizard: React.FC<Props> = ({
  initialHtml,
  initialCss,
  initialJs,
  onClose,
  onApply,
  initialMessages,
  onSessionChange,
}) => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [INITIAL_AI_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentHtml, setCurrentHtml] = useState(initialHtml);
  const [currentCss, setCurrentCss] = useState(initialCss);
  const [currentJs, setCurrentJs] = useState(initialJs);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [activeCodeSection, setActiveCodeSection] = useState<'html' | 'css' | 'js'>('html');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-fix state
  const pendingAutoFixRef = useRef(false);
  const autoRetryCountRef = useRef(0);
  // Store latest code in refs so the auto-fix effect can read current values
  const currentHtmlRef = useRef(currentHtml);
  const currentCssRef = useRef(currentCss);
  const currentJsRef = useRef(currentJs);
  const messagesRef = useRef(messages);
  const isTypingRef = useRef(isTyping);

  useEffect(() => { currentHtmlRef.current = currentHtml; }, [currentHtml]);
  useEffect(() => { currentCssRef.current = currentCss; }, [currentCss]);
  useEffect(() => { currentJsRef.current = currentJs; }, [currentJs]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isTypingRef.current = isTyping; }, [isTyping]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    onSessionChange?.(messages, currentHtml, currentCss, currentJs);
  }, [messages, currentHtml, currentCss, currentJs, onSessionChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Listen for runtime errors forwarded from inside the iframe
  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'GYMIND_IFRAME_ERROR') return;
      const errorText = String(event.data.error || 'Unknown runtime error');
      triggerAutoFix(errorText);
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerAutoFix = useCallback((errorText: string) => {
    if (!pendingAutoFixRef.current) return;
    if (autoRetryCountRef.current >= MAX_AUTO_RETRIES) {
      pendingAutoFixRef.current = false;
      return;
    }
    if (isTypingRef.current) return;

    pendingAutoFixRef.current = false;
    autoRetryCountRef.current += 1;

    const systemMsg: Message = {
      id: Date.now().toString(),
      role: 'system',
      text: `Auto-detected error: "${errorText}" — fixing automatically…`,
    };
    setMessages(prev => [...prev, systemMsg]);
    setIsTyping(true);

    const history = messagesRef.current
      .filter(m => m.id !== 'init' && m.role !== 'system')
      .map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, text: m.text }));

    aiGenerateAssignmentHtml({
      conversationHistory: history,
      currentHtml: currentHtmlRef.current,
      currentCss: currentCssRef.current,
      currentJs: currentJsRef.current,
      userMessage: `The code has this error: "${errorText}". Please fix it.`,
    })
      .then(result => {
        if (result.html !== undefined) { setCurrentHtml(result.html); currentHtmlRef.current = result.html; }
        if (result.css !== undefined) { setCurrentCss(result.css); currentCssRef.current = result.css; }
        if (result.js !== undefined) { setCurrentJs(result.js); currentJsRef.current = result.js; }

        // Allow another auto-fix attempt if this fix also has an error
        pendingAutoFixRef.current = true;
        setActiveTab('preview');

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: result.aiResponse ?? 'Fixed the error. Check the preview.',
        };
        setMessages(prev => [...prev, aiMsg]);
      })
      .catch((err: any) => {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: `Auto-fix failed: ${err.message || 'Unknown error'}. You can describe the issue manually.`,
        };
        setMessages(prev => [...prev, errMsg]);
      })
      .finally(() => {
        setIsTyping(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const writeToIframe = useCallback((assembled: string) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    try {
      doc.open();
      doc.write(assembled || '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#9ca3af;font-size:14px;">Preview will appear here</body></html>');
      doc.close();
    } catch (err: any) {
      // Parse-time SyntaxError — show error in iframe and trigger auto-fix
      const errorText = err.message || 'Syntax error in generated code';
      try {
        doc.open();
        doc.write(`<html><body style="margin:0;padding:20px;font-family:sans-serif;color:#dc2626;background:#fef2f2;font-size:13px;"><strong>Preview error:</strong><br><code>${errorText}</code></body></html>`);
        doc.close();
      } catch { /* ignore secondary error */ }
      triggerAutoFix(errorText);
    }
  }, [triggerAutoFix]);

  const updatePreview = useCallback(() => {
    if (activeTab !== 'preview') return;
    writeToIframe(assemblePreview(currentHtml, currentCss, currentJs));
  }, [currentHtml, currentCss, currentJs, activeTab, writeToIframe]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const history = messages
      .filter(m => m.id !== 'init' && m.role !== 'system')
      .map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, text: m.text }));

    try {
      const result = await aiGenerateAssignmentHtml({
        conversationHistory: history,
        currentHtml,
        currentCss,
        currentJs,
        userMessage: text,
      });

      if (result.html !== undefined) setCurrentHtml(result.html);
      if (result.css !== undefined) setCurrentCss(result.css);
      if (result.js !== undefined) setCurrentJs(result.js);

      // Arm the auto-fix detector for the upcoming preview render
      pendingAutoFixRef.current = true;
      autoRetryCountRef.current = 0;
      setActiveTab('preview');

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

  const codeSectionLabel: Record<'html' | 'css' | 'js', string> = { html: 'HTML', css: 'CSS', js: 'JS' };
  const codeSectionContent: Record<'html' | 'css' | 'js', string> = {
    html: currentHtml,
    css: currentCss,
    js: currentJs,
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="html-wizard-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ height: '85vh' }}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiCpu className="text-indigo-600" size={20} aria-hidden="true" />
              <h2 id="html-wizard-title" className="text-xl font-bold text-gray-900">{t('admin.wizard.title')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFormVisible(v => !v)}
                className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label={isFormVisible ? t('admin.wizard.showChat') : t('admin.wizard.showPreview')}
              >
                {isFormVisible ? <FiMessageSquare size={18} /> : <FiEye size={18} />}
              </button>
              <button
                onClick={() => onApply(currentHtml, currentCss, currentJs)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                aria-label={t('admin.wizard.applyToEditor')}
              >
                <FiCheck size={14} aria-hidden="true" /> {t('admin.wizard.applyToEditor')}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                aria-label={t('admin.wizard.closeWizard')}
              >
                <FiX size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-2 md:hidden">
            <button
              onClick={() => onApply(currentHtml, currentCss, currentJs)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              aria-label={t('admin.wizard.applyToEditor')}
            >
              <FiCheck size={14} aria-hidden="true" /> {t('admin.wizard.applyToEditor')}
            </button>
          </div>
        </div>

        {/* Body: two panels */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left — Chat */}
          <div className={`flex flex-col border-r border-gray-200 ${isFormVisible ? 'hidden md:flex' : 'flex'} md:w-1/2 w-full`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite" aria-label={t('admin.wizard.chatMessages')}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'system' ? (
                    <div className="w-full rounded-xl px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 text-center">
                      {msg.text}
                    </div>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                      }`}
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {renderWithBold(msg.text)}
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3" aria-label={t('admin.wizard.coding')}>
                    <span className="text-sm text-gray-500 italic flex">
                      {t('admin.wizard.coding').split('').map((char, i) => (
                        <span
                          key={i}
                          style={{
                            display: 'inline-block',
                            animation: 'wave-char 1.4s ease-in-out infinite',
                            animationDelay: `${i * 0.1}s`,
                          }}
                        >
                          {char}
                        </span>
                      ))}
                    </span>
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
                placeholder={t('admin.wizard.inputPlaceholder')}
                rows={2}
                className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label={t('admin.wizard.chatInput')}
                disabled={isTyping}
              />
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isTyping}
                className="self-end p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                aria-label={t('admin.wizard.sendMessage')}
              >
                <FiSend size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Right — Preview / Code */}
          <div className={`flex flex-col ${isFormVisible ? 'flex' : 'hidden md:flex'} md:w-1/2 w-full`}>
            {/* Tab bar */}
            <div className="flex border-b border-gray-200 flex-shrink-0" role="tablist" aria-label={t('admin.wizard.viewMode')}>
              <button
                role="tab"
                aria-selected={activeTab === 'preview'}
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                aria-label={t('admin.wizard.previewTab')}
              >
                <FiEye size={14} aria-hidden="true" /> {t('admin.wizard.previewTab')}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'code'}
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'code'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                aria-label={t('admin.wizard.codeTab')}
              >
                <FiCode size={14} aria-hidden="true" /> {t('admin.wizard.codeTab')}
              </button>
            </div>

            {/* Preview panel */}
            <div className={`flex-1 overflow-hidden ${activeTab === 'preview' ? 'block' : 'hidden'}`}>
              <iframe
                ref={iframeRef}
                title={t('admin.wizard.htmlAssignmentPreview')}
                sandbox="allow-scripts allow-same-origin"
                className="w-full h-full"
                style={{ border: 'none' }}
                aria-label={t('admin.wizard.liveHtmlPreview')}
              />
            </div>

            {/* Code panel */}
            {activeTab === 'code' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex border-b border-gray-100 flex-shrink-0" role="tablist" aria-label={t('admin.wizard.codeSection')}>
                  {(['html', 'css', 'js'] as const).map(section => (
                    <button
                      key={section}
                      role="tab"
                      aria-selected={activeCodeSection === section}
                      onClick={() => setActiveCodeSection(section)}
                      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                        activeCodeSection === section
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                      aria-label={t('admin.wizard.codeSectionLabel', { section: codeSectionLabel[section] })}
                    >
                      {codeSectionLabel[section]}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {codeSectionContent[activeCodeSection] ? (
                    <pre
                      className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words"
                      aria-label={t('admin.wizard.codeSectionCode', { section: codeSectionLabel[activeCodeSection] })}
                    >
                      {codeSectionContent[activeCodeSection]}
                    </pre>
                  ) : (
                    <p className="text-sm text-gray-400 text-center mt-8">
                      {t('admin.wizard.noCodeYet', { section: codeSectionLabel[activeCodeSection] })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const modalRoot = document.getElementById('modal-root');
  return modalRoot ? ReactDOM.createPortal(modalContent, modalRoot) : modalContent;
};

export default AssignmentHtmlAiWizard;
