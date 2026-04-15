
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import type { ChatPersona, ExtractionSetting, AIInsightSetting, Plan } from '../../types';
import { UserRole } from '../../types';
import { FiPlusCircle, FiEdit, FiTrash2, FiSave, FiXCircle, FiAlertTriangle, FiMessageSquare, FiSliders, FiLoader, FiCheckCircle, FiAlertCircle as FiErrorCircle, FiHelpCircle, FiCpu, FiCopy, FiUploadCloud, FiArchive } from 'react-icons/fi';
import TutorialSection from '../common/TutorialSection';
import { ModalWrapper } from './course/billing/Shared';
import ConfirmationModal from './shared/ConfirmationModal';
import ArchiveRestoreModal from './shared/ArchiveRestoreModal';
import { InfoTooltip, AutoResizingTextarea } from './shared/FormComponents';
import AiMentorWizard from './AiMentorWizard';

const ChatSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { 
    chatPersonas, addChatPersona, updateChatPersona, deleteChatPersona, confirmArchiveChatPersona,
    archivedChatPersonas, fetchArchivedChatPersonas, restoreChatPersona,
    isLoading, dataError, clearDataError, tutorialSettings 
  } = useData();
  
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', text: string} | null>(null);
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);
  const [modalError, setModalError] = useState<string|null>(null);
  useEffect(() => {
    if (modalError) {
      const timer = setTimeout(() => {
        setModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [modalError]);
  
  // Modal State
    const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardInitialPersona, setWizardInitialPersona] = useState<Partial<ChatPersona> | null>(null);

  const [editingPersona, setEditingPersona] = useState<Partial<ChatPersona> | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [archiveConfirmData, setArchiveConfirmData] = useState<{ resource: ChatPersona; dependencies?: { name: string; id: string }[] } | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  
  useEffect(() => {
    if (dataError && !isPersonaModalOpen) { // Only show page-level feedback if modal is closed
      setFeedback({ type: 'error', text: dataError });
    }
  }, [dataError, isPersonaModalOpen]);

  if (user?.role !== UserRole.ACADEMY_ADMIN && user?.role !== UserRole.SYSTEM_ADMIN) {
    return <div className="p-6 text-red-600">{t('admin.chat.accessDenied')}</div>;
  }
  
  const clearFeedback = () => {
    setFeedback(null);
    if(dataError) clearDataError();
  }

  const handleSaveWizardPersona = async (personaData: Partial<ChatPersona>) => {
    // Basic validation
    if (!personaData.name?.trim()) {
        alert(t('admin.chat.mentorNameRequired'));
        return;
    }
    const result = personaData.id
        ? await updateChatPersona(personaData.id, personaData)
        : await addChatPersona(personaData);
    if (result) {
        setFeedback({ type: 'success', text: t(personaData.id ? 'admin.chat.mentorUpdated' : 'admin.chat.mentorCreated', { name: result.name }) });
        setIsWizardOpen(false);
        setWizardInitialPersona(null);
    } else {
        alert(t('admin.chat.mentorSaveFailed'));
    }
  };

  const handleEditWithWizard = (persona: ChatPersona) => {
    clearFeedback();
    setWizardInitialPersona(persona);
    setIsWizardOpen(true);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setModalError(null);
    clearFeedback();

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
        } else if (file.name.endsWith('.doc')) {
            setModalError(t('admin.chat.docFileNotSupported'));
        } else {
            setModalError(t('admin.chat.unsupportedFileType'));
        }

        if (text) {
            setEditingPersona(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    systemPrompt: (prev.systemPrompt ? prev.systemPrompt + '\n\n' : '') + text
                }
            });
            setFeedback({ type: 'success', text: t('admin.chat.fileImportSuccess') });
        }
    } catch (err: any) {
        setModalError(t('admin.chat.fileImportFailed', { message: err.message }));
    } finally {
        setIsProcessingFile(false);
        e.target.value = ''; // Reset file input
    }
  };
  
  // --- Persona Modal Handlers ---
  const handleOpenPersonaModal = (persona?: ChatPersona) => {
    clearFeedback();
    setModalError(null);
    if (persona) {
        // Ensure settings arrays are full for the UI
        const fullExtraction: ExtractionSetting[] = Array.from({ length: 5 }, (_, i) => 
            persona.extractionSettings?.[i] || { key: `field${i + 1}`, label: '', enabled: false }
        );
        const fullInsights: AIInsightSetting[] = Array.from({ length: 3 }, (_, i) => 
            persona.aiInsightSettings?.[i] || { key: `insight${i + 1}`, label: '', enabled: false }
        );
        setEditingPersona({ 
            ...persona, 
            extractionSettings: fullExtraction, 
            aiInsightSettings: fullInsights,
            personaPreamble: persona.personaPreamble ?? '',
            // Default new fields for old personas
            includePersonalization: persona.includePersonalization ?? false,
            isInitialMessageEnabled: persona.isInitialMessageEnabled ?? false,
            initialMessage: persona.initialMessage ?? '',
            summaryInstructions: persona.summaryInstructions ?? 'present your full summary and suggestion for change.',
        });
    } else {
        setEditingPersona({
            name: '', description: '', systemPrompt: '',
            personaPreamble: '',
            extractionSettings: Array.from({ length: 5 }, (_, i) => ({ key: `field${i + 1}`, label: '', enabled: false })),
            aiInsightPrompt: "Based on the conversation, create the following insights. The insights should be your own analysis and not direct quotes unless absolutely necessary.",
            aiInsightSettings: Array.from({ length: 3 }, (_, i) => ({ key: `insight${i + 1}`, label: '', enabled: false })),
            includePersonalization: false,
            isInitialMessageEnabled: false,
            initialMessage: '',
            summaryInstructions: 'present your full summary and suggestion for change.',
        });
    }
    setIsPersonaModalOpen(true);
  };

  const handleClosePersonaModal = () => {
    setIsPersonaModalOpen(false);
    setEditingPersona(null);
  };

  const handleSavePersona = async (personaData: Partial<ChatPersona>) => {
    clearFeedback();
    setModalError(null);

    // --- Client-Side Validation ---
    if (!personaData.name?.trim()) {
        setModalError(t('admin.chat.validation.chatNameRequired'));
        return;
    }
    if (!personaData.personaPreamble?.trim()) {
        setModalError(t('admin.chat.validation.personaRequired'));
        return;
    }
    if (!personaData.description?.trim()) {
        setModalError(t('admin.chat.validation.descriptionRequired'));
        return;
    }
    if (!personaData.systemPrompt?.trim()) {
        setModalError(t('admin.chat.validation.systemPromptRequired'));
        return;
    }
    if (personaData.isInitialMessageEnabled && !personaData.initialMessage?.trim()) {
      setModalError(t('admin.chat.validation.initialMessageRequired'));
      return;
    }
    for (const [index, setting] of (personaData.extractionSettings || []).entries()) {
        if (setting.enabled && !setting.label.trim()) {
            setModalError(t('admin.chat.validation.extractionFieldLabelRequired', { index: index + 1 }));
            return;
        }
    }
    const isAnyInsightEnabled = personaData.aiInsightSettings?.some(s => s.enabled);
    if (isAnyInsightEnabled && !personaData.aiInsightPrompt?.trim()) {
        setModalError(t('admin.chat.validation.aiInsightPromptRequired'));
        return;
    }
    for (const [index, setting] of (personaData.aiInsightSettings || []).entries()) {
        if (setting.enabled && !setting.label.trim()) {
            setModalError(t('admin.chat.validation.aiInsightLabelRequired', { index: index + 1 }));
            return;
        }
    }

    const result = personaData.id
        ? await updateChatPersona(personaData.id, personaData)
        : await addChatPersona(personaData);

    if (result) {
        setFeedback({ type: 'success', text: t('admin.chat.mentorSaved', { name: result.name }) });
        handleClosePersonaModal();
    } else {
        setModalError(dataError || t('admin.chat.mentorSaveFailedRetry'));
    }
  };
  
  const handleDuplicatePersona = async (personaToDuplicate: ChatPersona) => {
    clearFeedback();
    const newPersonaData: Partial<ChatPersona> = {
        ...personaToDuplicate,
        name: t('admin.chat.copyOf', { name: personaToDuplicate.name }),
    };
    delete newPersonaData.id; // Remove id to create a new one

    const result = await addChatPersona(newPersonaData);
    if (result) {
        setFeedback({ type: 'success', text: t('admin.chat.mentorDuplicated', { name: personaToDuplicate.name }) });
    } else {
        setFeedback({ type: 'error', text: dataError || t('admin.chat.mentorDuplicateFailed') });
    }
  };

  const handleAttemptArchive = async (persona: ChatPersona) => {
    clearFeedback();
    const result = await deleteChatPersona(persona.id);
    if (result.isConflict) {
        setArchiveConfirmData({ resource: persona, dependencies: result.dependencies.plans || [] });
    } else if (dataError) {
        setFeedback({ type: 'error', text: dataError });
    } else {
        setArchiveConfirmData({ resource: persona });
    }
  };
  
  const handleConfirmArchive = async () => {
    if (!archiveConfirmData) return;
    const { resource } = archiveConfirmData;
    const success = await confirmArchiveChatPersona(resource.id);
    if (success) {
        setFeedback({ type: 'success', text: t('admin.chat.mentorArchived') });
    }
    setArchiveConfirmData(null);
  };

  const handlePersonaFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!editingPersona) return;
    setEditingPersona(prev => ({...prev, [e.target.name]: e.target.value }));
  };
  
  const handleExtractionSettingChange = (index: number, field: 'label' | 'enabled', value: string | boolean) => {
    if (!editingPersona) return;
    const newSettings = [...(editingPersona.extractionSettings || [])];
    (newSettings[index] as any)[field] = value;
    setEditingPersona(prev => ({ ...prev, extractionSettings: newSettings }));
  };

  const handleAIInsightSettingChange = (index: number, field: 'label' | 'enabled', value: string | boolean) => {
    if (!editingPersona) return;
    const newSettings = [...(editingPersona.aiInsightSettings || [])];
    (newSettings[index] as any)[field] = value;
    setEditingPersona(prev => ({ ...prev, aiInsightSettings: newSettings }));
  };

  const areExtractionSettingsEnabled = editingPersona?.extractionSettings?.some(s => s.enabled);
  const activePersonas = chatPersonas.filter(p => p.status !== 'archived');

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-gray-100 px-4 md:px-8 pt-4 md:pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center"><FiMessageSquare className="mr-3 text-blue-500"/>{t('admin.chat.title')}</h1>
                <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
                    <button onClick={() => setIsArchiveModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors text-sm w-full sm:w-auto">
                        <FiArchive className="mr-2" /> {t('admin.chat.viewArchived')}
                    </button>
                    <button onClick={() => setIsWizardOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center transition-colors w-full sm:w-auto">
                        <FiPlusCircle className="mr-2" /> {t('admin.chat.addMentor')}
                    </button>
                </div>
            </div>
            <div className="mt-4">
                <TutorialSection videoUrl={tutorialSettings?.aiMentor?.videoUrl} />
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-8 pb-8 pt-4">
        <div className="max-w-4xl mx-auto">
            <p className="text-gray-600 mb-6">
                {t('admin.chat.pageDescription')}
            </p>

            {feedback && (
            <div className={`p-3 mb-4 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {feedback.type === 'success' ? <FiCheckCircle className="mr-2"/> : <FiErrorCircle className="mr-2"/>}
                {feedback.text}
                <button onClick={clearFeedback} className="ml-auto text-lg font-semibold">&times;</button>
            </div>
            )}

            <div className="space-y-4">
                {isLoading && activePersonas.length === 0 ? (
                    <div className="text-center py-4"><FiLoader className="animate-spin h-6 w-6 text-blue-500 mx-auto"/></div>
                ) : activePersonas.length === 0 ? (
                    <div className="text-center p-8 bg-gray-50 border-2 border-dashed rounded-lg">
                        <FiMessageSquare className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-lg font-medium text-gray-900">{t('admin.chat.noMentorsYet')}</h3>
                        <p className="mt-1 text-sm text-gray-500">{t('admin.chat.noMentorsDescription')}</p>
                        <div className="mt-6">
                            <button onClick={() => setIsWizardOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm flex items-center justify-center mx-auto transition-colors">
                                <FiPlusCircle className="mr-2" /> {t('admin.chat.addMentor')}
                            </button>
                        </div>
                    </div>
                ) : (
                    activePersonas.map(persona => (
                        <div key={persona.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                            <div className="p-4 flex justify-between items-center">
                                <div>
                                    <div className="flex items-center">
                                        <h2 className="text-xl font-bold text-gray-800">{persona.name}</h2>
                                        <button onClick={() => handleEditWithWizard(persona)} className="p-2 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 ml-2" title={t('admin.chat.editMentor')} aria-label={t('admin.chat.editMentor')}>
                                            <FiEdit size={18}/>
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-600">{persona.description}</p>
                                </div>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => handleDuplicatePersona(persona)} className="p-2 text-green-600 hover:text-green-800 rounded-full hover:bg-green-100" title={t('admin.chat.duplicateMentor')} aria-label={t('admin.chat.duplicateMentor')}><FiCopy size={18} /></button>
                                    <button onClick={() => handleAttemptArchive(persona)} className="p-2 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100" title={t('admin.chat.archiveMentor')} aria-label={t('admin.chat.archiveMentor')}><FiTrash2 size={18} /></button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
      
      
              {isWizardOpen && ReactDOM.createPortal(
        <AiMentorWizard
            onClose={() => { setIsWizardOpen(false); setWizardInitialPersona(null); }}
            onSave={handleSaveWizardPersona}
            initialPersona={wizardInitialPersona ?? undefined}
        />,
        document.getElementById('modal-root')!
      )}

      {isPersonaModalOpen && editingPersona && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-xl font-bold">{editingPersona.id ? t('admin.chat.editAiMentor') : t('admin.chat.addNewAiMentor')}</h2>
                    <button onClick={handleClosePersonaModal} className="p-2 rounded-full hover:bg-gray-200" aria-label={t('common.close')}><FiXCircle size={24}/></button>
                </div>
                {modalError && <div className="p-3 mx-6 mt-4 rounded-md flex items-center text-sm bg-red-100 text-red-700 border border-red-200"><FiErrorCircle className="inline mr-2"/><span>{modalError}</span><button onClick={() => setModalError(null)} className="ml-auto text-lg font-semibold">&times;</button></div>}
                
                <form onSubmit={(e) => { e.preventDefault(); handleSavePersona(editingPersona); }} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <p className="text-xs text-gray-500">{t('admin.chat.requiredFieldsNote')}</p>
                   <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('admin.chat.mentorName')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('admin.chat.mentorNameTooltip')} />
                        </label>
                        <input type="text" name="name" id="name" value={editingPersona.name} onChange={handlePersonaFormChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('common.description')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('admin.chat.descriptionTooltip')} />
                        </label>
                        <AutoResizingTextarea name="description" id="description" value={editingPersona.description} onChange={handlePersonaFormChange} rows={2} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="personaPreamble" className="block text-sm font-medium text-gray-700 flex items-center">
                            {t('admin.chat.aiMentorPersona')} <span aria-hidden="true" className="ml-1">*</span>
                            <InfoTooltip text={t('admin.chat.personaPreambleTooltip')} />
                        </label>
                        <input
                            type="text"
                            name="personaPreamble"
                            id="personaPreamble"
                            value={editingPersona.personaPreamble}
                            onChange={handlePersonaFormChange}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md"
                            placeholder={t('admin.chat.personaPreamblePlaceholder')}
                            required
                            aria-required="true"
                        />
                    </div>

                    {/* Initial Message */}
                    <div>
                        <label htmlFor="isInitialMessageEnabled" className="flex items-center justify-between text-sm font-medium text-gray-700">
                            <span className="flex items-center">
                                {t('admin.chat.enableInitialMessage')}
                                <InfoTooltip text={t('admin.chat.enableInitialMessageTooltip')} />
                            </span>
                            <div className="relative">
                                <input type="checkbox" id="isInitialMessageEnabled" name="isInitialMessageEnabled" className="toggle-checkbox" checked={editingPersona.isInitialMessageEnabled ?? false} onChange={(e) => setEditingPersona(prev => ({...prev, isInitialMessageEnabled: e.target.checked }))} />
                                <label htmlFor="isInitialMessageEnabled" className="toggle-label"></label>
                            </div>
                        </label>
                        <AutoResizingTextarea name="initialMessage" id="initialMessage" value={editingPersona.initialMessage || ''} onChange={handlePersonaFormChange} rows={2} className="mt-2 w-full p-2 border border-gray-300 rounded-md font-mono text-xs disabled:bg-gray-200" placeholder={t('admin.chat.initialMessagePlaceholder')} disabled={!editingPersona.isInitialMessageEnabled}/>
                    </div>

                    <div>
                        <div className="flex justify-between items-center">
                            <label htmlFor="systemPrompt" className="block text-sm font-medium text-gray-700 flex items-center">
                                <FiMessageSquare className="mr-2"/> {t('admin.chat.systemPromptLabel')} <span aria-hidden="true" className="ml-1">*</span>
                                <InfoTooltip text={t('admin.chat.systemPromptTooltip')} />
                            </label>
                            <label htmlFor="systemPrompt-file-upload" className="cursor-pointer flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                                <FiUploadCloud className="mr-1"/> {t('admin.chat.importFromFile')}
                            </label>
                            <input id="systemPrompt-file-upload" type="file" accept=".txt,.docx,.pdf" className="hidden" onChange={handleFileImport} disabled={isLoading || isProcessingFile} />
                        </div>
                        <AutoResizingTextarea name="systemPrompt" id="systemPrompt" value={editingPersona.systemPrompt} onChange={handlePersonaFormChange} rows={8} className="mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs" required aria-required="true"/>
                    </div>
                    <div>
                        <label htmlFor="includePersonalization" className="flex items-center text-sm font-medium text-gray-700">
                            <input type="checkbox" id="includePersonalization" name="includePersonalization" checked={editingPersona.includePersonalization ?? false} onChange={(e) => setEditingPersona(prev => ({...prev, includePersonalization: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"/>
                            {t('admin.chat.includePersonalization')}
                            <InfoTooltip text={t('admin.chat.includePersonalizationTooltip')} />
                        </label>
                    </div>

                    {/* Extraction Settings */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiSliders className="mr-2"/> {t('admin.chat.dataExtractionSettings')}
                            <InfoTooltip text={t('admin.chat.dataExtractionTooltip')} />
                        </h3>
                        <div className="space-y-4">
                            {editingPersona.extractionSettings?.map((setting, index) => (
                                <div key={setting.key} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-md border">
                                    <input type="checkbox" id={`enable-toggle-${index}`} className="toggle-checkbox" checked={setting.enabled} onChange={(e) => handleExtractionSettingChange(index, 'enabled', e.target.checked)}/>
                                    <label htmlFor={`enable-toggle-${index}`} className="toggle-label"></label>
                                    <input type="text" value={setting.label} onChange={(e) => handleExtractionSettingChange(index, 'label', e.target.value)} placeholder={t('admin.chat.extractionFieldPlaceholder', { index: index + 1 })} className="flex-grow p-2 border rounded-md disabled:bg-gray-200" disabled={!setting.enabled} aria-label={t('admin.chat.extractionFieldAriaLabel', { index: index + 1 })}/>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Summary Instructions */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiSliders className="mr-2"/> {t('admin.chat.summaryInstructions')}
                            <InfoTooltip text={t('admin.chat.summaryInstructionsTooltip')} />
                        </h3>
                        <div>
                            <label htmlFor="summaryInstructions" className="block text-sm font-medium text-gray-700">{t('admin.chat.instructionsForAI')}</label>
                            <AutoResizingTextarea 
                                name="summaryInstructions" 
                                id="summaryInstructions" 
                                value={editingPersona.summaryInstructions || ''} 
                                onChange={handlePersonaFormChange} 
                                rows={3} 
                                className={`mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs ${!areExtractionSettingsEnabled ? 'bg-gray-200 text-gray-500' : ''}`}
                                disabled={!areExtractionSettingsEnabled}
                            />
                            {!areExtractionSettingsEnabled && (
                                <p className="text-xs text-orange-600 mt-1 flex items-center">
                                    <FiAlertTriangle className="mr-1" />
                                    {t('admin.chat.summaryInstructionsDisabledNote')}
                                </p>
                            )}
                        </div>
                    </div>
                    {/* AI Insights Settings */}
                    <div className="pt-4 border-t">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2 flex items-center">
                            <FiCpu className="mr-2 text-purple-600"/> {t('admin.chat.aiInsightsSettings')}
                            <InfoTooltip text={t('admin.chat.aiInsightsTooltip')} />
                        </h3>

                        <div className="mb-4">
                            <label htmlFor="aiInsightPrompt" className="block text-sm font-medium text-gray-700">{t('admin.chat.aiInsightPromptLabel')}</label>
                            
                            {editingPersona.extractionSettings?.some(s => s.enabled) && (
                                <div className="mt-1 mb-2">
                                    <span className="text-xs text-gray-500 block mb-1">{t('admin.chat.availableDynamicFields')}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {editingPersona.extractionSettings.filter(s => s.enabled).map(s => (
                                            <div key={s.key} className="inline-flex items-center bg-gray-100 text-purple-700 px-2 py-1 rounded text-xs border border-gray-200">
                                                <code className="font-mono font-bold select-all">{`{${s.key}}`}</code>
                                                <div className="relative group ml-1">
                                                    <FiHelpCircle className="h-3 w-3 text-gray-400 hover:text-blue-500 cursor-help" />
                                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                                        {t('admin.chat.represents', { label: s.label || t('admin.chat.unnamed') })}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <AutoResizingTextarea name="aiInsightPrompt" id="aiInsightPrompt" value={editingPersona.aiInsightPrompt} onChange={handlePersonaFormChange} rows={3} className="mt-1 w-full p-2 border border-gray-300 rounded-md font-mono text-xs disabled:bg-gray-200 disabled:text-gray-500" disabled={!editingPersona.aiInsightSettings?.some(s => s.enabled)}/>
                        </div>
                        
                        <div className="space-y-4">
                            {editingPersona.aiInsightSettings?.map((setting, index) => (
                                <div key={setting.key} className="flex items-center space-x-4 p-3 bg-purple-50 rounded-md border border-purple-200">
                                    <input type="checkbox" id={`enable-insight-toggle-${index}`} className="toggle-checkbox" checked={setting.enabled} onChange={(e) => handleAIInsightSettingChange(index, 'enabled', e.target.checked)}/>
                                    <label htmlFor={`enable-insight-toggle-${index}`} className="toggle-label"></label>
                                    <input type="text" value={setting.label} onChange={(e) => handleAIInsightSettingChange(index, 'label', e.target.value)} placeholder={t('admin.chat.aiInsightFieldPlaceholder', { index: index + 1 })} className="flex-grow p-2 border rounded-md disabled:bg-gray-200" disabled={!setting.enabled} aria-label={t('admin.chat.aiInsightFieldAriaLabel', { index: index + 1 })}/>
                                </div>
                            ))}
                        </div>
                    </div>
                </form>
                 <div className="flex justify-end space-x-3 p-6 border-t mt-auto flex-shrink-0">
                    <button type="button" onClick={handleClosePersonaModal} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('common.cancel')}</button>
                    <button type="button" onClick={() => handleSavePersona(editingPersona)} disabled={isLoading || isProcessingFile} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center">
                        {(isLoading || isProcessingFile) ? <FiLoader className="animate-spin mr-2"/> : <FiSave className="mr-2"/>} {t('admin.chat.saveMentor')}
                    </button>
                </div>
            </div>
            <style>{`.toggle-checkbox { display: none; } .toggle-label { display: block; overflow: hidden; height: 1.5rem; width: 3rem; border-radius: 9999px; background-color: #d1d5db; cursor: pointer; position: relative; transition: background-color 0.2s ease-in-out; } .toggle-label::after { content: ''; display: block; width: 1.25rem; height: 1.25rem; background-color: white; border-radius: 9999px; position: absolute; top: 0.125rem; left: 0.125rem; transition: transform 0.2s ease-in-out; } .toggle-checkbox:checked + .toggle-label { background-color: #3b82f6; } .toggle-checkbox:checked + .toggle-label::after { transform: translateX(1.5rem); }`}</style>
        </div>,
        document.getElementById('modal-root')!
      )}
      
      <ConfirmationModal
        isOpen={!!archiveConfirmData}
        onClose={() => setArchiveConfirmData(null)}
        onConfirm={handleConfirmArchive}
        isLoading={isLoading}
        title={t('admin.chat.confirmArchiveTitle')}
        message={<>{t('admin.chat.confirmArchiveMessage', { name: archiveConfirmData?.resource.name })}</>}
        confirmText={t('admin.chat.confirmArchiveButton')}
        dependencies={archiveConfirmData?.dependencies}
        dependencyWarning={archiveConfirmData?.dependencies ? t('admin.chat.dependencyWarning', { count: archiveConfirmData.dependencies.length }) : undefined}
      />

      <ArchiveRestoreModal
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        title={t('admin.chat.archivedMentors')}
        items={archivedChatPersonas}
        onRestore={restoreChatPersona}
        fetchItems={fetchArchivedChatPersonas}
      />
    </div>
  );
};

export default ChatSettingsPage;