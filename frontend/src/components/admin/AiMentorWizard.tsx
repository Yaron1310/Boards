
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSend, FiX, FiSave, FiLoader, FiCpu, FiMessageSquare, FiSliders, FiUploadCloud, FiAlertTriangle, FiCheckCircle, FiHelpCircle } from 'react-icons/fi';
import { ChatPersona, Message, ExtractionSetting, AIInsightSetting } from '../../types';
import { mentorWizard } from '../../services/geminiService';
import { useData } from '../../hooks/useData';
import { AutoResizingTextarea, InfoTooltip } from './shared/FormComponents';

const renderWithBold = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
};

interface AiMentorWizardProps {
  onClose: () => void;
  onSave: (persona: Partial<ChatPersona>) => Promise<void>;
  initialPersona?: Partial<ChatPersona>;
}

import { FiEdit } from 'react-icons/fi';

const AiMentorWizard: React.FC<AiMentorWizardProps> = ({ onClose, onSave, initialPersona }) => {
  const { t } = useTranslation();
  const isEditing = !!initialPersona?.id;
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialPersona?.name) {
      return [{
        id: 'init',
        sender: 'ai',
        text: t('aiMentor.wizard.initMessageEdit', { name: initialPersona.name }),
        timestamp: new Date(),
      }];
    }
    return [{
      id: 'init',
      sender: 'ai',
      text: t('aiMentor.wizard.initMessageCreate'),
      timestamp: new Date(),
    }];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Focus the chat input when the wizard first opens
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Persona State (The "Form" on the right)
  const [personaState, setPersonaState] = useState<Partial<ChatPersona>>(() => {
    if (initialPersona) {
      const fullExtraction: ExtractionSetting[] = Array.from({ length: 5 }, (_, i) =>
        initialPersona.extractionSettings?.[i] || { key: `field${i + 1}`, label: '', enabled: false }
      );
      const fullInsights: AIInsightSetting[] = Array.from({ length: 3 }, (_, i) =>
        initialPersona.aiInsightSettings?.[i] || { key: `insight${i + 1}`, label: '', enabled: false }
      );
      return {
        ...initialPersona,
        extractionSettings: fullExtraction,
        aiInsightSettings: fullInsights,
        personaPreamble: initialPersona.personaPreamble ?? '',
        includePersonalization: initialPersona.includePersonalization ?? false,
        isInitialMessageEnabled: initialPersona.isInitialMessageEnabled ?? false,
        initialMessage: initialPersona.initialMessage ?? '',
        summaryInstructions: initialPersona.summaryInstructions ?? 'present your full summary and suggestion for change.',
        aiInsightPrompt: initialPersona.aiInsightPrompt ?? '',
      };
    }
    return {
      name: '',
      description: '',
      personaPreamble: '',
      systemPrompt: '',
      initialMessage: '',
      isInitialMessageEnabled: false,
      includePersonalization: false,
      extractionSettings: Array.from({ length: 5 }, (_, i) => ({ key: `field${i + 1}`, label: '', enabled: false })),
      aiInsightSettings: Array.from({ length: 3 }, (_, i) => ({ key: `insight${i + 1}`, label: '', enabled: false })),
      aiInsightPrompt: '',
      summaryInstructions: ''
    };
  });

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { updatedPersona, aiResponse } = await mentorWizard(
        [...messages, userMsg],
        personaState,
        userMsg.text
      );

      setPersonaState(prev => ({ ...prev, ...updatedPersona }));

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiResponse,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("Wizard Error:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: t('aiMentor.wizard.errorMessage'),
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- File Upload Logic (Copied/Adapted from ChatSettingsPage) ---
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setFileError(null);

    try {
        let text = '';
        if (file.type === 'text/plain') {
            text = await file.text();
        } else if (file.name.endsWith('.docx')) {
            const mammoth = await import('mammoth');
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.default.extractRawText({ arrayBuffer });
            text = result.value;
        } else if (file.type === 'application/pdf') {
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;
            const loadingTask = pdfjsLib.getDocument(await file.arrayBuffer());
            const pdf = await loadingTask.promise;
            const pageTexts = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map((item: any) => item.str).join(' ');
                pageTexts.push(pageText);
            }
            text = pageTexts.join('\n\n');
        } else {
            setFileError(t('aiMentor.wizard.unsupportedFileType'));
        }

        if (text) {
            setPersonaState(prev => ({
                ...prev,
                systemPrompt: (prev.systemPrompt ? prev.systemPrompt + '\n\n' : '') + text
            }));
            // Notify user in chat
            const sysMsg: Message = {
                id: Date.now().toString(),
                sender: 'ai',
                text: t('aiMentor.wizard.fileImportSuccess', { fileName: file.name }),
                timestamp: new Date()
            };
            setMessages(prev => [...prev, sysMsg]);
        }
    } catch (err: any) {
        setFileError(`Failed to read file: ${err.message}`);
    } finally {
        setIsProcessingFile(false);
        e.target.value = '';
    }
  };

  // --- Form Change Handlers ---
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setPersonaState(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleExtractionChange = (index: number, field: 'label' | 'enabled', value: string | boolean) => {
    const newSettings = [...(personaState.extractionSettings || [])];
    (newSettings[index] as any)[field] = value;
    setPersonaState(prev => ({ ...prev, extractionSettings: newSettings }));
  };

  const handleInsightChange = (index: number, field: 'label' | 'enabled', value: string | boolean) => {
    const newSettings = [...(personaState.aiInsightSettings || [])];
    (newSettings[index] as any)[field] = value;
    setPersonaState(prev => ({ ...prev, aiInsightSettings: newSettings }));
  };

  const areExtractionSettingsEnabled = personaState.extractionSettings?.some(s => s.enabled);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-0 md:p-4 z-50">
      <div className="bg-white rounded-none md:rounded-lg shadow-xl w-full h-full md:h-auto md:max-h-[90vh] md:max-w-5xl flex md:flex-row">
        
        {/* Left Panel: Chat (Visible on all screens) */}
        <div className={`w-full md:w-1/3 flex flex-col bg-gray-50 border-r transition-all duration-300 ${isFormVisible ? 'hidden md:flex' : 'flex'}`}>
            {/* Header for Chat Panel */}
            <div className="relative px-4 py-3 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center">
                    <FiCpu className="text-blue-600 h-5 w-5 mr-2" />
                    <h3 className="font-bold text-gray-800">{isEditing ? t('aiMentor.wizard.editTitle') : t('aiMentor.wizard.createTitle')}</h3>
                </div>
                <div className="absolute top-3 right-3 flex items-center space-x-2 md:hidden">
                    <button onClick={() => setIsFormVisible(true)} className="p-1 rounded-full hover:bg-gray-200" title={t('aiMentor.wizard.editManuallyTitle')}>
                        <FiEdit size={20} className="text-blue-600"/>
                    </button>
                    <button data-modal-escape onClick={onClose} className="p-1 rounded-full hover:bg-gray-200" title={t('aiMentor.wizard.closeWizard')}>
                        <FiX size={24}/>
                    </button>
                </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg shadow-sm ${ msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : msg.isError ? 'bg-red-100 text-red-800 rounded-bl-none border border-red-200' : 'bg-white text-gray-800 rounded-bl-none border border-gray-200' }`}>
                            <p className="whitespace-pre-wrap text-sm">{renderWithBold(msg.text)}</p>
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start"><div className="bg-white p-3 rounded-lg rounded-bl-none border border-gray-200 shadow-sm"><FiLoader className="animate-spin text-blue-500" /></div></div>
                )}
                <div ref={messagesEndRef} />
            </div>
            
            <div className="p-4 bg-white border-t">
                <div className="relative">
                    <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={t('aiMentor.wizard.inputPlaceholder')} className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none shadow-sm" rows={3} disabled={isTyping} />
                    <button onClick={handleSendMessage} disabled={!input.trim() || isTyping} className="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors"><FiSend /></button>
                </div>
            </div>
        </div>

        {/* Right Panel: Live Form Preview (Conditionally visible on mobile) */}
        <div className={`w-full md:w-2/3 flex flex-col bg-white transition-all duration-300 ${isFormVisible ? 'flex' : 'hidden md:flex'}`}>
            <div className="relative p-4 md:p-6 border-b flex flex-col items-start md:flex-row md:items-center md:justify-between sticky top-0 bg-white z-20">
                <h3 className="text-lg font-semibold text-gray-700 flex items-center"><FiSliders className="mr-2" /> {t('aiMentor.wizard.configTitle')}</h3>
                <div className="flex items-center space-x-3 mt-2 md:mt-0">
                    <button onClick={() => setIsFormVisible(false)} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 md:hidden flex items-center"><FiMessageSquare className="mr-1.5"/> {t('aiMentor.wizard.backToChat')}</button>
                    <button data-modal-escape onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 hidden md:block"><FiX size={24}/></button>
                </div>
                <button data-modal-escape onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-200 md:hidden" title={t('aiMentor.wizard.closeWizard')}>
                    <FiX size={24}/>
                </button>
            </div>
            <form id="mentor-wizard-form" onSubmit={(e) => { e.preventDefault(); onSave(personaState); }} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <p className="text-xs text-gray-500">{t('aiMentor.wizard.mandatoryNote')}</p>
                   <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('aiMentor.wizard.mentorName')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.mentorName')} />
                        </label>
                        <input type="text" name="name" id="name" value={personaState.name} onChange={handleFormChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md leading-normal" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('aiMentor.wizard.description')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.description')} />
                        </label>
                        <AutoResizingTextarea name="description" id="description" value={personaState.description} onChange={handleFormChange} rows={2} className="mt-1 w-full p-2 border border-gray-300 rounded-md leading-normal" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="personaPreamble" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('aiMentor.wizard.mentorPersona')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.personaPreamble')} />
                        </label>
                        <input
                            type="text"
                            name="personaPreamble"
                            id="personaPreamble"
                            value={personaState.personaPreamble}
                            onChange={handleFormChange}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md leading-normal"
                            placeholder={t('aiMentor.wizard.personaPreamblePlaceholder')}
                            required
                            aria-required="true"
                        />
                    </div>

                    {/* Initial Message */}
                    <div>
                        <label htmlFor="isInitialMessageEnabled" className="flex items-center justify-between text-sm font-medium text-gray-700">
                            <span className="flex items-center">
                                {t('aiMentor.wizard.enableInitialMessage')}
                                <InfoTooltip text={t('aiMentor.wizard.tooltip.initialMessage')} />
                            </span>
                            <div className="relative">
                                {isMobile ? (
                                    <input type="checkbox" id="isInitialMessageEnabled" name="isInitialMessageEnabled" className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={personaState.isInitialMessageEnabled ?? false} onChange={(e) => setPersonaState(prev => ({...prev, isInitialMessageEnabled: e.target.checked }))} />
                                ) : (
                                    <>
                                        <input type="checkbox" id="isInitialMessageEnabled" name="isInitialMessageEnabled" className="toggle-checkbox" checked={personaState.isInitialMessageEnabled ?? false} onChange={(e) => setPersonaState(prev => ({...prev, isInitialMessageEnabled: e.target.checked }))} />
                                        <label htmlFor="isInitialMessageEnabled" className="toggle-label"></label>
                                    </>
                                )}
                            </div>
                        </label>
                        <AutoResizingTextarea name="initialMessage" id="initialMessage" value={personaState.initialMessage || ''} onChange={handleFormChange} rows={2} className="mt-2 w-full p-2 border border-gray-300 rounded-md font-mono text-xs disabled:bg-gray-200 leading-normal" placeholder={t('aiMentor.wizard.initialMessagePlaceholder')} disabled={!personaState.isInitialMessageEnabled}/>
                    </div>

                    <div>
                        <div className="flex flex-col md:flex-row md:justify-between md:items-center">
                            <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 flex items-center">
                                <FiMessageSquare className="mr-2"/> {t('aiMentor.wizard.systemPromptLabel')} <span aria-hidden="true" className="ml-1">*</span>
                                <InfoTooltip text={t('aiMentor.wizard.tooltip.systemPrompt')} />
                            </label>
                            <div className="w-full md:w-auto">
                                <label htmlFor="wizard-file-upload" className="cursor-pointer flex items-center justify-center md:justify-start text-sm text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-2 md:py-1 rounded-md border border-blue-200 mt-2 md:mt-0">
                                    <FiUploadCloud className="mr-1"/> {t('aiMentor.wizard.importFromFile')}
                                </label>
                                <input id="wizard-file-upload" type="file" accept=".txt,.docx,.pdf" className="hidden" onChange={handleFileImport} disabled={isProcessingFile} />
                            </div>
                        </div>
                        {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
                        <AutoResizingTextarea name="systemPrompt" id="systemPrompt" value={personaState.systemPrompt} onChange={handleFormChange} rows={8} className="mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs leading-normal" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="includePersonalization" className="flex items-center text-sm font-medium text-gray-700">
                            <input type="checkbox" id="includePersonalization" name="includePersonalization" checked={personaState.includePersonalization ?? false} onChange={(e) => setPersonaState(prev => ({...prev, includePersonalization: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"/>
                            {t('aiMentor.wizard.includePersonalization')}
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.includePersonalization')} />
                        </label>
                    </div>

                    {/* Extraction Settings */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiSliders className="mr-2"/> {t('aiMentor.wizard.dataExtraction')}
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.dataExtraction')} />
                        </h3>
                        <div className="space-y-4">
                            {personaState.extractionSettings?.map((setting, index) => (
                                <div key={setting.key} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-md border">
                                    {isMobile ? (
                                        <input type="checkbox" id={`enable-toggle-${index}`} className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={setting.enabled} onChange={(e) => handleExtractionChange(index, 'enabled', e.target.checked)}/>
                                    ) : (
                                        <>
                                            <input type="checkbox" id={`enable-toggle-${index}`} className="toggle-checkbox" checked={setting.enabled} onChange={(e) => handleExtractionChange(index, 'enabled', e.target.checked)}/>
                                            <label htmlFor={`enable-toggle-${index}`} className="toggle-label"></label>
                                        </>
                                    )}
                                    <input type="text" value={setting.label} onChange={(e) => handleExtractionChange(index, 'label', e.target.value)} placeholder={t('aiMentor.wizard.extractionFieldLabel', { index: index + 1 })} className="flex-grow p-2 border rounded-md disabled:bg-gray-200 leading-normal" disabled={!setting.enabled}/>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Summary Instructions */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiSliders className="mr-2"/> {t('aiMentor.wizard.summaryInstructions')}
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.summaryInstructions')} />
                        </h3>
                        <div>
                            <label htmlFor="summaryInstructions" className="block text-sm font-medium text-gray-700">{t('aiMentor.wizard.instructionsForAi')}</label>
                            <AutoResizingTextarea 
                                name="summaryInstructions" 
                                id="summaryInstructions" 
                                value={personaState.summaryInstructions || ''} 
                                onChange={handleFormChange} 
                                rows={3} 
                                className={`mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs leading-normal ${!areExtractionSettingsEnabled ? 'bg-gray-200 text-gray-500' : ''}`}
                                disabled={!areExtractionSettingsEnabled}
                                placeholder={t('aiMentor.wizard.summaryInstructionsPlaceholder')}
                            />
                            {!areExtractionSettingsEnabled && (
                                <p className="text-xs text-orange-600 mt-1 flex items-center">
                                    <FiAlertTriangle className="mr-1" />
                                    {t('aiMentor.wizard.extractionDisabledNote')}
                                </p>
                            )}
                        </div>
                    </div>
                    {/* AI Insights Settings */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiCpu className="mr-2 text-purple-600"/> {t('aiMentor.wizard.aiGeneratedInsights')}
                            <InfoTooltip text={t('aiMentor.wizard.tooltip.aiGeneratedInsights')} />
                        </h3>
                        
                        <div className="mb-4">
                            <label htmlFor="aiInsightPrompt" className="block text-sm font-medium text-gray-700">{t('aiMentor.wizard.aiInsightInstructions')}</label>
                            
                            {personaState.extractionSettings?.some(s => s.enabled) && (
                                <div className="mt-1 mb-2">
                                    <span className="text-xs text-gray-500 block mb-1">{t('aiMentor.wizard.availableDynamicFields')}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {personaState.extractionSettings.filter(s => s.enabled).map(s => (
                                            <div key={s.key} className="inline-flex items-center bg-gray-100 text-purple-700 px-2 py-1 rounded text-xs border border-gray-200">
                                                <code className="font-mono font-bold select-all">{`{${s.key}}`}</code>
                                                <div className="relative group ml-1">
                                                    <FiHelpCircle className="h-3 w-3 text-gray-400 hover:text-blue-500 cursor-help" />
                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[100]">
                                                        {t('aiMentor.wizard.represents', { label: s.label || t('aiMentor.wizard.unnamed') })}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <AutoResizingTextarea name="aiInsightPrompt" id="aiInsightPrompt" value={personaState.aiInsightPrompt} onChange={handleFormChange} rows={3} className={`mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs disabled:bg-gray-200 disabled:text-gray-500 leading-normal`} placeholder={t('aiMentor.wizard.aiInsightPromptPlaceholder')} disabled={!personaState.aiInsightSettings?.some(s => s.enabled)}/>
                        </div>
                        
                        <div className="space-y-4">
                            {personaState.aiInsightSettings?.map((setting, index) => (
                                <div key={setting.key} className="flex items-center space-x-4 p-3 bg-purple-50 rounded-md border border-purple-200">
                                    {isMobile ? (
                                        <input type="checkbox" id={`enable-insight-toggle-${index}`} className="h-6 w-6 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={setting.enabled} onChange={(e) => handleInsightChange(index, 'enabled', e.target.checked)}/>
                                    ) : (
                                        <>
                                            <input type="checkbox" id={`enable-insight-toggle-${index}`} className="toggle-checkbox" checked={setting.enabled} onChange={(e) => handleInsightChange(index, 'enabled', e.target.checked)}/>
                                            <label htmlFor={`enable-insight-toggle-${index}`} className="toggle-label"></label>
                                        </>
                                    )}
                                    <input type="text" value={setting.label} onChange={(e) => handleInsightChange(index, 'label', e.target.value)} placeholder={t('aiMentor.wizard.aiInsightLabel', { index: index + 1 })} className="flex-grow p-2 border rounded-md disabled:bg-gray-200 leading-normal" disabled={!setting.enabled}/>
                                </div>
                            ))}
                        </div>
                    </div>
                </form>
            <div className="flex justify-end items-center space-x-3 p-4 border-t bg-gray-50">
                <button type="submit" form="mentor-wizard-form" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm flex items-center transition-colors text-sm" disabled={!personaState.name}><FiSave className="mr-2" /> {t('aiMentor.wizard.saveMentor')}</button>
            </div>
            <style>{`.toggle-checkbox { display: none; } .toggle-label { display: block; overflow: hidden; height: 1.5rem; width: 3.5rem; border-radius: 9999px; background-color: #d1d5db; cursor: pointer; position: relative; transition: background-color 0.2s ease-in-out; } .toggle-label::after { content: ''; display: block; width: 1.25rem; height: 1.25rem; background-color: white; border-radius: 9999px; position: absolute; top: 0.125rem; left: 0.125rem; transition: transform 0.2s ease-in-out; } .toggle-checkbox:checked + .toggle-label { background-color: #3b82f6; } .toggle-checkbox:checked + .toggle-label::after { transform: translateX(2rem); }`}</style>
        </div>

        
      </div>
    </div>
  );
};

export default AiMentorWizard;
