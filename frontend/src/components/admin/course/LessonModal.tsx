import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CourseQuestion, CourseAnswer, Lesson, ChatPersona, Questionnaire, LessonAssignment, InsightField } from '../../../types';
import * as apiService from '../../../services/geminiService';
import { FiSave, FiXCircle, FiLoader, FiAlertCircle, FiCheckCircle, FiHelpCircle, FiZap, FiMessageSquare, FiCpu, FiCode, FiPlusCircle, FiTrash2, FiCopy, FiCircle, FiEdit, FiChevronDown, FiChevronUp, FiUploadCloud, FiSettings, FiPlay } from 'react-icons/fi';
import QuestionnaireIcon from '../../common/QuestionnaireIcon';
import BridgeSettingsModal from './BridgeSettingsModal';
import AssignmentHtmlAiWizard, { Message as WizardMessage } from './AssignmentHtmlAiWizard';
import { useData } from '@/hooks/useData';
import { useVideoDuration } from '@/hooks/useVideoDuration';

// --- VIDEO EMBED URL HELPER ---
const getEmbedUrl = (url: string): string => {
    // Vimeo: https://vimeo.com/123456 → https://player.vimeo.com/video/123456
    const vimeoMatch = url.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    // YouTube: https://youtube.com/watch?v=ID or youtu.be/ID → https://www.youtube.com/embed/ID
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    return url;
};

// --- TIME FORMATTING HELPERS ---
const secondsToHMS = (seconds: number | undefined | null): string => {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const hStr = h.toString().padStart(2, '0');
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
};

// --- TIME PICKER COMPONENTS ---
const TimeSegment = React.forwardRef<HTMLInputElement, {
    value: number; max: number; label: string;
    onChange: (v: number) => void;
    onAutoAdvance?: () => void;
}>(({ value, max, label, onChange, onAutoAdvance }, ref) => {
    const [str, setStr] = useState<string | null>(null);
    return (
        <input
            ref={ref}
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={str !== null ? str : String(value).padStart(2, '0')}
            onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                setStr(digits);
                onChange(digits ? Math.min(max, parseInt(digits, 10)) : 0);
                if (digits.length === 2) onAutoAdvance?.();
            }}
            onFocus={(e) => { setStr(String(value).padStart(2, '0')); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => setStr(null)}
            className="p-1 w-10 border rounded-md text-sm text-center font-mono"
            aria-label={label}
        />
    );
});
TimeSegment.displayName = 'TimeSegment';

const TimePicker = ({ value, onChange }: { value: number; onChange: (s: number) => void }) => {
    const { t } = useTranslation();
    const mRef = useRef<HTMLInputElement>(null);
    const sRef = useRef<HTMLInputElement>(null);
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    return (
        <div className="flex items-center gap-1" dir="ltr">
            <TimeSegment value={h} max={99} label={t('admin.lesson.hours')} onChange={(v) => onChange(v * 3600 + m * 60 + s)} onAutoAdvance={() => mRef.current?.focus()} />
            <span className="text-gray-400 select-none font-medium">:</span>
            <TimeSegment ref={mRef} value={m} max={59} label={t('admin.lesson.minutes')} onChange={(v) => onChange(h * 3600 + v * 60 + s)} onAutoAdvance={() => sRef.current?.focus()} />
            <span className="text-gray-400 select-none font-medium">:</span>
            <TimeSegment ref={sRef} value={s} max={59} label={t('admin.lesson.seconds')} onChange={(v) => onChange(h * 3600 + m * 60 + v)} />
        </div>
    );
};

// --- AUDIO PROCESSING HELPERS ---
const writeWavHeader = (sampleRate: number, numChannels: number, numFrames: number) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numFrames * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numFrames * 2, true);
    return buffer;
};
const extractAndConvertAudio = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const originalBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const targetSampleRate = 16000;
    const targetChannels = 1;
    const offlineCtx = new OfflineAudioContext(targetChannels, originalBuffer.duration * targetSampleRate, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = originalBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    const renderedBuffer = await offlineCtx.startRendering();
    const numFrames = renderedBuffer.length;
    const wavHeader = writeWavHeader(targetSampleRate, targetChannels, numFrames);
    const wavBytes = new Int16Array(numFrames);
    const channelData = renderedBuffer.getChannelData(0);
    for (let i = 0; i < numFrames; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        wavBytes[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const blob = new Blob([wavHeader, wavBytes], { type: 'audio/wav' });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// --- Reusable Tooltip Component ---
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative group ml-2 inline-block align-middle">
    <FiHelpCircle className="h-4 w-4 text-gray-400 hover:text-blue-500 cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 p-3 bg-gray-800 text-white text-xs rounded-md shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 leading-relaxed text-left">
      {text}
      <div className="absolute top-100 left-1/2 -ml-1 border-4 border-transparent border-t-gray-800"></div>
    </div>
  </div>
  );

// --- Validation Modal Component ---
interface ValidationModalProps {
    type: 'error' | 'warning' | 'info';
    message: string;
    onClose: () => void;
    onConfirm?: () => void;
}

const ValidationModal: React.FC<ValidationModalProps> = ({ type, message, onClose, onConfirm }) => {
    const { t } = useTranslation();
    const headerBg = type === 'error' ? 'bg-red-50' : type === 'info' ? 'bg-blue-50' : 'bg-orange-50';
    const icon = type === 'error'
        ? <FiAlertCircle className="text-red-600 mr-2" size={20}/>
        : type === 'info'
        ? <FiCheckCircle className="text-blue-600 mr-2" size={20}/>
        : <FiHelpCircle className="text-orange-600 mr-2" size={20}/>;
    const titleColor = type === 'error' ? 'text-red-800' : type === 'info' ? 'text-blue-800' : 'text-orange-800';
    const title = type === 'error'
        ? t('admin.lesson.validation.invalidTiming')
        : type === 'info'
        ? t('admin.lesson.previewSandboxTitle')
        : t('admin.lesson.validation.timingWarning');
    return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]">
        <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`p-4 ${headerBg} border-b flex items-center`}>
                {icon}
                <h3 className={`font-bold ${titleColor}`}>{title}</h3>
            </div>
            <div className="p-6">
                <p className="text-gray-700 leading-relaxed">{message}</p>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end space-x-3">
                {type === 'warning' && (
                    <>
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
                            {t('common.cancel')}
                        </button>
                        <button onClick={() => { onConfirm?.(); onClose(); }} className="px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-md hover:bg-orange-700 shadow-sm transition-colors">
                            {t('admin.lesson.validation.keepTiming')}
                        </button>
                    </>
                )}
                {(type === 'error' || type === 'info') && (
                    <button onClick={onClose} className={`px-4 py-2 text-white text-sm font-bold rounded-md shadow-sm transition-colors ${type === 'info' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
                        {t('admin.lesson.validation.understood')}
                    </button>
                )}
            </div>
        </div>
    </div>
    );
};
  
// --- Auto-Resizing Textarea Component ---
const AutoResizingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const adjustHeight = () => {
        const element = textareaRef.current;
        if (element) {
            element.style.height = 'auto';
            element.style.height = `${element.scrollHeight}px`;
        }
    };
    useLayoutEffect(() => { adjustHeight(); }, [props.value]);
    return <textarea ref={textareaRef} {...props} style={{ ...props.style, overflow: 'hidden', resize: 'none' }} onInput={(e) => { adjustHeight(); props.onInput?.(e); }} />;
};

interface LessonModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (courseId: string, lessonData: Partial<Lesson>) => Promise<void>;
    lessonData: Partial<Lesson> | null;
    courseId?: string;
    chatPersonas: ChatPersona[];
    questionnaires: Questionnaire[];
    onDuplicateQuestion: (courseId: string, lessonId: string, question: CourseQuestion) => Promise<void>;
}

const LessonModal: React.FC<LessonModalProps> = ({ isOpen, onClose, onSave, lessonData, courseId, chatPersonas, questionnaires, onDuplicateQuestion }) => {
    const { t } = useTranslation();
    const { academySettings, enableBridge, disableBridge } = useData();
    const [formData, setFormData] = useState<Partial<Omit<Lesson, 'id' | 'courseId' | 'createdAt' | 'updatedAt'>> & { questions?: CourseQuestion[], assignments?: LessonAssignment[] }>({});
    const [modalError, setModalError] = useState<string | null>(null);
    const [showBridgeSettings, setShowBridgeSettings] = useState(false);
    const [bridgeTestStatus, setBridgeTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    useEffect(() => {
    if (modalError) {
      const timer = setTimeout(() => {
        setModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [modalError]);
    const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [conversionStatus, setConversionStatus] = useState<string>('');
    const [videoDuration, setVideoDuration] = useState<number | null>(null);
    const [videoUrlInput, setVideoUrlInput] = useState<string>('');
    const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
    const [codePreviewHtml, setCodePreviewHtml] = useState<string | null>(null);
    const [activeCodeEditTab, setActiveCodeEditTab] = useState<'html' | 'css' | 'js'>('html');
    const [newAssignmentActiveTab, setNewAssignmentActiveTab] = useState<'html' | 'css' | 'js'>('html');
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

    // Assignment state
    const [newAssignmentType, setNewAssignmentType] = useState<'chat' | 'questionnaire' | 'custom_code'>('chat');
    const [newAssignmentId, setNewAssignmentId] = useState<string>('');
    const [newAssignmentName, setNewAssignmentName] = useState<string>('');
    const [newAssignmentMandatory, setNewAssignmentMandatory] = useState<boolean>(false);
    const [newAssignmentInsightsPrivate, setNewAssignmentInsightsPrivate] = useState<boolean>(false);
    const [newAssignmentCustomHtml, setNewAssignmentCustomHtml] = useState<string>('');
    const [newAssignmentCustomCss, setNewAssignmentCustomCss] = useState<string>('');
    const [newAssignmentCustomJs, setNewAssignmentCustomJs] = useState<string>('');
    const [newAssignmentAutoOpenEnabled, setNewAssignmentAutoOpenEnabled] = useState<boolean>(false);
    const [newAssignmentAutoOpenTimestamp, setNewAssignmentAutoOpenTimestamp] = useState<number>(0);
    const [newAssignmentEndButtonId, setNewAssignmentEndButtonId] = useState<string>('');
    const [newAssignmentInsightFields, setNewAssignmentInsightFields] = useState<InsightField[]>([]);
    
    const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);
    const [alertModal, setAlertModal] = useState<{ type: 'error' | 'warning' | 'info', message: string, onConfirm?: () => void } | null>(null);
    const [showAddAssignmentForm, setShowAddAssignmentForm] = useState(false);
    const [showHtmlWizard, setShowHtmlWizard] = useState(false);
    const [editingHtmlWizardIndex, setEditingHtmlWizardIndex] = useState<number | null>(null);
    type WizardSession = { messages: WizardMessage[]; html: string; css: string; js: string };
    const [newAssignmentWizardSession, setNewAssignmentWizardSession] = useState<WizardSession | null>(null);
    const [editWizardSessions, setEditWizardSessions] = useState<Record<number, WizardSession>>({});

    useEffect(() => {
        if (lessonData) {
            setFormData({
                name: lessonData.name || '',
                description: lessonData.description || '',
                order: lessonData.order || 1,
                transcript: lessonData.transcript || '',
                videoUrl: lessonData.videoUrl || '',
                powerpointUrl: lessonData.powerpointUrl || '',
                questions: lessonData.questions ? [...lessonData.questions] : [],
                assignments: lessonData.assignments ? [...lessonData.assignments] : [],
                isBridgeVideo: lessonData.isBridgeVideo || false,
                bridgeVideoUrl: lessonData.bridgeVideoUrl || '',
                videoDuration: lessonData.videoDuration,
            });
            setVideoUrlInput(lessonData.videoUrl || '');
        }
    }, [lessonData]);

    useEffect(() => {
        if (isOpen) {
            setShowAddAssignmentForm(false);
            setNewAssignmentType('chat');
            setNewAssignmentId('');
            setNewAssignmentName('');
            setNewAssignmentMandatory(false);
            setNewAssignmentInsightsPrivate(false);
            setNewAssignmentCustomHtml('');
            setNewAssignmentCustomCss('');
            setNewAssignmentCustomJs('');
            setNewAssignmentAutoOpenEnabled(false);
            setNewAssignmentAutoOpenTimestamp(0);
            setNewAssignmentEndButtonId('');
            setNewAssignmentInsightFields([]);
            setExpandedAssignmentId(null);
        }
    }, [isOpen]);

    const { duration: detectedDuration, isLoading: isDurationLoading } = useVideoDuration(
        isOpen && !formData.isBridgeVideo ? (formData.videoUrl ?? '') : ''
    );

    useEffect(() => {
        if (detectedDuration !== null) {
            setVideoDuration(detectedDuration);
            setFormData(prev => ({ ...prev, videoDuration: detectedDuration }));
        }
    }, [detectedDuration]);

    useEffect(() => {
        if (codePreviewHtml === null) return;
        const handlePreviewMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'GYMIND_PREVIEW_SANDBOX_SAVE') {
                setAlertModal({ type: 'info', message: t('admin.lesson.previewSandboxMessage') });
            }
        };
        window.addEventListener('message', handlePreviewMessage);
        return () => window.removeEventListener('message', handlePreviewMessage);
    }, [codePreviewHtml, t]);

    const clearMessages = () => {
        setModalError(null);
        setSuccess(null);
    }
    
    const doSave = async (finalAssignments?: LessonAssignment[]) => {
        setIsLoading(true);
        const dataToSave = finalAssignments !== undefined
            ? { ...lessonData, ...formData, assignments: finalAssignments }
            : { ...lessonData, ...formData };
        await onSave(courseId!, dataToSave);
        setIsLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!courseId) return;
        setModalError(null);

        // Validate quiz questions
        for (const q of formData.questions || []) {
            if (!q.text.trim() || q.answers.length < 2 || q.answers.some(a => !a.text.trim()) || !q.correctAnswerId) {
                setModalError(t('admin.lesson.error.questionValidation'));
                return;
            }
        }

        // If the add-assignment form is open, validate and include the pending assignment
        if (showAddAssignmentForm) {
            const result = buildPendingAssignment();
            if (result.error) { setModalError(result.error); return; }
            const finalAssignments = [result.assignment!, ...(formData.assignments || [])];
            if (result.conflictMessage) {
                setAlertModal({ type: 'warning', message: result.conflictMessage, onConfirm: async () => { await doSave(finalAssignments); resetAssignmentForm(); } });
                return;
            }
            await doSave(finalAssignments);
            resetAssignmentForm();
            return;
        }

        // Validate that mandatory custom_code assignments always have a finish button ID
        for (const a of formData.assignments || []) {
            if (a.type === 'custom_code' && a.isMandatory && !a.endButtonId?.trim()) {
                setModalError(t('admin.lesson.error.endButtonIdRequiredForMandatory'));
                return;
            }
        }

        // Validate assignment time conflicts for existing assignments
        for (const a of formData.assignments || []) {
            if (!a.autoOpenEnabled || a.autoOpenTimestamp === undefined) continue;
            const check = checkAssignmentTimeConflict(a.autoOpenTimestamp, a.id);
            if (check.status === 'error') { setModalError(check.message!); return; }
            if (check.status === 'warning') {
                setAlertModal({ type: 'warning', message: check.message!, onConfirm: async () => { await doSave(); } });
                return;
            }
        }

        await doSave();
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setModalError(null);
        const { name, value } = e.target;
        setFormData(prev => ({...prev, [name]: name === 'order' ? parseInt(value, 10) : value }));
    }

    const handleTranscribeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 500 * 1024 * 1024) { setModalError(t('admin.lesson.error.fileTooLarge')); e.target.value = ''; return; }
        setIsTranscribing(true); setConversionStatus(t('admin.lesson.analyzingMedia')); setModalError(null);
        try {
            setConversionStatus(t('admin.lesson.convertingAudio'));
            await new Promise(resolve => setTimeout(resolve, 100));
            const base64Data = await extractAndConvertAudio(file);
            setConversionStatus(t('admin.lesson.sendingToAi'));
            const result = await apiService.transcribeMediaFile(base64Data, 'audio/wav');
            setFormData(prev => ({ ...prev, transcript: (prev.transcript ? prev.transcript + '\n\n' : '') + result.transcript }));
            setSuccess(t('admin.lesson.success.transcribed'));
        } catch (err: any) { setModalError(t('admin.lesson.error.transcribeFailed')); }
        finally { setIsTranscribing(false); setConversionStatus(''); e.target.value = ''; }
    };

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
    
        setIsProcessingFile(true);
        setModalError(null);
        setSuccess(null);
    
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
                setModalError(t('admin.lesson.error.docNotSupported'));
            } else {
                setModalError(t('admin.lesson.error.unsupportedFileType'));
            }

            if (text) {
                setFormData(prev => ({ ...prev, transcript: (prev.transcript ? prev.transcript + '\n\n' : '') + text }));
                setSuccess(t('admin.lesson.success.fileImported'));
            }
        } catch (err: any) {
            setModalError(t('admin.lesson.error.fileReadFailed', { message: err.message }));
        } finally {
            setIsProcessingFile(false);
            e.target.value = ''; // Reset file input
        }
    };
    
    // --- QUESTION HANDLERS ---
  const handleQuestionChange = (qIndex: number, field: keyof CourseQuestion, value: any) => {
    setModalError(null);
    setFormData(prev => {
        const newQuestions = [...(prev.questions || [])];
        (newQuestions[qIndex] as any)[field] = value;
        return { ...prev, questions: newQuestions };
    });
  };

  const handleAnswerChange = (qIndex: number, aIndex: number, value: string) => {
      setModalError(null);
      setFormData(prev => {
        const newQuestions = [...(prev.questions || [])];
        newQuestions[qIndex].answers[aIndex].text = value;
        return { ...prev, questions: newQuestions };
      });
  };

  const handleAddQuestion = () => {
      setModalError(null);
      const newQuestion: CourseQuestion = {
          id: crypto.randomUUID(),
          order: (formData.questions?.length || 0) + 1,
          text: '',
          answers: [{ id: crypto.randomUUID(), text: '' }, {id: crypto.randomUUID(), text: ''}],
          correctAnswerId: ''
      };
      setFormData(prev => ({
          ...prev,
          questions: [...(prev.questions || []), newQuestion]
      }));
  };
  
    const handleGenerateQuestionWithAI = async () => {
        clearMessages();
        if (!formData.transcript?.trim()) { setModalError(t('admin.lesson.error.noTranscriptForAi')); return; }
        setIsGeneratingQuestion(true);
        try {
            const existingQuestions = (formData.questions || []).map(q => q.text).filter(Boolean);
            const generatedData = await apiService.generateQuizQuestionFromTranscript(formData.transcript, existingQuestions);
            const answersWithOptions: CourseAnswer[] = generatedData.answers.map(ansText => ({ id: crypto.randomUUID(), text: ansText }));
            const newQuestion: CourseQuestion = {
                id: crypto.randomUUID(),
                order: (formData.questions?.length || 0) + 1,
                text: generatedData.questionText,
                answers: answersWithOptions,
                correctAnswerId: answersWithOptions[generatedData.correctAnswerIndex].id
            };
            setFormData(prev => ({ ...prev, questions: [...(prev.questions || []), newQuestion] }));
            setSuccess(t('admin.lesson.success.aiQuestion'));
        } catch (err: any) { setModalError(err.message || t('admin.lesson.error.aiQuestionFailed')); } 
        finally { setIsGeneratingQuestion(false); }
    };

  const handleDeleteQuestion = (qIndex: number) => {
      setModalError(null);
      setFormData(prev => ({ ...prev, questions: prev.questions?.filter((_, index) => index !== qIndex) }));
  };
  
  const handleAddAnswer = (qIndex: number) => {
      setModalError(null);
      setFormData(prev => {
          const newQuestions = [...(prev.questions || [])];
          newQuestions[qIndex].answers.push({ id: crypto.randomUUID(), text: '' });
          return { ...prev, questions: newQuestions };
      });
  };

  const handleDeleteAnswer = (qIndex: number, aIndex: number) => {
      setModalError(null);
      setFormData(prev => {
          const newQuestions = [...(prev.questions || [])];
          const answerToDelete = newQuestions[qIndex].answers[aIndex];
          newQuestions[qIndex].answers = newQuestions[qIndex].answers.filter((_, index) => index !== aIndex);
          if(newQuestions[qIndex].correctAnswerId === answerToDelete.id) newQuestions[qIndex].correctAnswerId = '';
          return { ...prev, questions: newQuestions };
      });
  };

  // --- ASSIGNMENT HANDLERS ---
    const resetAssignmentForm = () => {
        setNewAssignmentType('chat');
        setNewAssignmentId('');
        setNewAssignmentName('');
        setNewAssignmentMandatory(false);
        setNewAssignmentInsightsPrivate(false);
        setNewAssignmentCustomHtml('');
        setNewAssignmentCustomCss('');
        setNewAssignmentCustomJs('');
        setNewAssignmentActiveTab('html');
        setNewAssignmentAutoOpenEnabled(false);
        setNewAssignmentAutoOpenTimestamp(0);
        setNewAssignmentEndButtonId('');
        setNewAssignmentInsightFields([]);
        setShowAddAssignmentForm(false);
    };

    const buildPendingAssignment = (): { assignment?: LessonAssignment; error?: string; conflictMessage?: string } => {
        let name = '';
        let finalId = newAssignmentId;

        if (newAssignmentType === 'custom_code') {
            if (!newAssignmentName.trim()) return { error: t('admin.lesson.error.assignmentNameRequired') };
            if (!newAssignmentCustomHtml.trim()) return { error: t('admin.lesson.error.customHtmlRequired') };
            if (newAssignmentMandatory && !newAssignmentEndButtonId.trim()) return { error: t('admin.lesson.error.endButtonIdRequiredForMandatory') };
            name = newAssignmentName;
            finalId = `custom_${crypto.randomUUID()}`;
        } else {
            if (!newAssignmentId) return { error: t('admin.lesson.error.selectResource') };
            if (newAssignmentType === 'chat') name = chatPersonas.find(cp => cp.id === newAssignmentId)?.name || '';
            else if (newAssignmentType === 'questionnaire') name = questionnaires.find(qn => qn.id === newAssignmentId)?.name || '';
        }

        const assignment: LessonAssignment = {
            type: newAssignmentType,
            id: finalId,
            name: name || 'Unknown Assignment',
            isMandatory: newAssignmentMandatory,
            isInsightsPrivate: newAssignmentType === 'chat' ? newAssignmentInsightsPrivate : undefined,
            customHtml: newAssignmentType === 'custom_code' ? newAssignmentCustomHtml : undefined,
            customCss: newAssignmentType === 'custom_code' ? newAssignmentCustomCss : undefined,
            customJs: newAssignmentType === 'custom_code' ? newAssignmentCustomJs : undefined,
            autoOpenEnabled: newAssignmentAutoOpenEnabled,
            autoOpenTimestamp: newAssignmentAutoOpenEnabled ? newAssignmentAutoOpenTimestamp : undefined,
            endButtonId: newAssignmentType === 'custom_code' ? newAssignmentEndButtonId : undefined,
            insightFields: newAssignmentType === 'custom_code' ? newAssignmentInsightFields : undefined,
        };

        if (newAssignmentAutoOpenEnabled) {
            const check = checkAssignmentTimeConflict(newAssignmentAutoOpenTimestamp);
            if (check.status === 'error') return { error: check.message };
            if (check.status === 'warning') return { assignment, conflictMessage: check.message };
        }

        return { assignment };
    };

    const handleNewInsightFieldChange = (fieldIndex: number, prop: keyof InsightField, value: string) => {
        const newFields = [...newAssignmentInsightFields];
        const updatedField = { ...newFields[fieldIndex], [prop]: value };

        if (prop === 'label') {
            const toSnakeCase = (str: string) => str
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/[^\p{L}\p{N}]+/gu, ' ')
                .trim()
                .split(/\s+/)
                .map(word => word.toLowerCase())
                .filter(word => word.length > 0)
                .join('_');
            updatedField.key = toSnakeCase(value);
        }

        newFields[fieldIndex] = updatedField;
        setNewAssignmentInsightFields(newFields);
    };

    const addNewInsightField = () => setNewAssignmentInsightFields([...newAssignmentInsightFields, { htmlElementId: '', key: '', label: '' }]);
    const removeNewInsightField = (index: number) => setNewAssignmentInsightFields(newAssignmentInsightFields.filter((_, i) => i !== index));
    
  const handleDeleteAssignment = (indexToRemove: number) => setFormData(prev => ({ ...prev, assignments: prev.assignments?.filter((_, index) => index !== indexToRemove) }));
  const handleAssignmentPropChange = (index: number, prop: keyof LessonAssignment, value: any) => {
    setFormData(prev => {
        const newAssignments = [...(prev.assignments || [])];
        const targetAssignment = { ...newAssignments[index] };
        (targetAssignment as any)[prop] = value;
        if (prop === 'autoOpenEnabled' && !value) targetAssignment.autoOpenTimestamp = undefined;
        newAssignments[index] = targetAssignment;
        return { ...prev, assignments: newAssignments };
    });
  };
  const handleInsightFieldChange = (assignmentIndex: number, fieldIndex: number, prop: keyof InsightField, value: string) => {
    setFormData(prev => {
        const newAssignments = [...(prev.assignments || [])];
        const targetAssignment = { ...newAssignments[assignmentIndex] };
        const newInsightFields = [...(targetAssignment.insightFields || [])];
        const updatedField = { ...newInsightFields[fieldIndex], [prop]: value };

        if (prop === 'label') {
            const toSnakeCase = (str: string) => str
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .replace(/[^\p{L}\p{N}]+/gu, ' ')
                .trim()
                .split(/\s+/)
                .map(word => word.toLowerCase())
                .filter(word => word.length > 0)
                .join('_');
            updatedField.key = toSnakeCase(value);
        }

        newInsightFields[fieldIndex] = updatedField;
        targetAssignment.insightFields = newInsightFields;
        newAssignments[assignmentIndex] = targetAssignment;
        return { ...prev, assignments: newAssignments };
    });
  };
  const addInsightField = (assignmentIndex: number) => setFormData(prev => {
    const newAssignments = [...(prev.assignments || [])];
    const targetAssignment = { ...newAssignments[assignmentIndex] };
    targetAssignment.insightFields = [...(targetAssignment.insightFields || []), { htmlElementId: '', key: '', label: '' }];
    newAssignments[assignmentIndex] = targetAssignment;
    return { ...prev, assignments: newAssignments };
  });
  const removeInsightField = (assignmentIndex: number, fieldIndex: number) => setFormData(prev => {
    const newAssignments = [...(prev.assignments || [])];
    const targetAssignment = { ...newAssignments[assignmentIndex] };
    targetAssignment.insightFields = (targetAssignment.insightFields || []).filter((_, i) => i !== fieldIndex);
    newAssignments[assignmentIndex] = targetAssignment;
    return { ...prev, assignments: newAssignments };
  });

    const checkAssignmentTimeConflict = (timestamp: number, currentId?: string): { status: 'ok' | 'error' | 'warning', message?: string } => {
        if (!formData.assignments) return { status: 'ok' };
        
        for (const other of formData.assignments) {
            if (!other.autoOpenEnabled || other.autoOpenTimestamp === undefined) continue;
            if (currentId && other.id === currentId) continue;
            
            if (other.autoOpenTimestamp === timestamp) {
                return {
                    status: 'error',
                    message: t('admin.lesson.error.duplicateTimestamp', { time: secondsToHMS(timestamp) })
                };
            }

            if (Math.abs(other.autoOpenTimestamp - timestamp) < 20) {
                return {
                    status: 'warning',
                    message: t('admin.lesson.warning.closeTimestamp', { time: secondsToHMS(timestamp), otherTime: secondsToHMS(other.autoOpenTimestamp) })
                };
            }
        }
        return { status: 'ok' };
    };


    if (!isOpen) return null;
    
    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
               <div className="p-6 border-b"><h2 className="text-xl font-bold">{lessonData?.id ? t('admin.lesson.editLesson') : t('admin.lesson.createLesson')}</h2></div>
               {modalError && <div className="p-3 mx-6 mt-4 rounded-md flex items-center text-sm bg-red-100 text-red-700 border border-red-200"><FiAlertCircle className="mr-2 flex-shrink-0"/><span>{modalError}</span><button onClick={() => setModalError(null)} className="ml-auto text-lg font-semibold" aria-label={t('common.close')}>&times;</button></div>}
               <form id="lesson-form" onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                   <p className="text-xs text-gray-500">{t('admin.lesson.requiredFieldsNote')}</p>
                   {/* Lesson Details */}
                   <div>
                       <label htmlFor="lesson_name" className="block text-sm font-medium text-gray-700">{t('admin.lesson.lessonName')} <span aria-hidden="true">*</span></label>
                       <input type="text" name="name" id="lesson_name" value={formData.name || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                   </div>
                   <div>
                       <label htmlFor="lesson_description" className="block text-sm font-medium text-gray-700">{t('common.description')} <span aria-hidden="true">*</span></label>
                       <AutoResizingTextarea name="description" id="lesson_description" value={formData.description || ''} onChange={handleFormChange} rows={2} className="mt-1 w-full p-2 border border-gray-300 rounded-md" required aria-required="true"/>
                   </div>
                   <div>
                       <div className="flex items-center justify-between mb-2">
                           <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                               <input
                                   type="checkbox"
                                   checked={formData.isBridgeVideo || false}
                                   onChange={async (e) => {
                                       const checked = e.target.checked;
                                       setFormData(prev => ({ ...prev, isBridgeVideo: checked }));
                                       if (checked && !academySettings?.bridgeEnabled) {
                                           await enableBridge();
                                       }
                                   }}
                                   className="mr-2 rounded border-gray-300"
                                   aria-label={t('admin.lesson.bridgeVideoHost')}
                               />
                               {t('admin.lesson.bridgeVideoHost')}
                           </label>
                           {formData.isBridgeVideo && (
                               <button
                                   type="button"
                                   onClick={() => setShowBridgeSettings(true)}
                                   className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                   aria-label={t('admin.lesson.bridgeSettings')}
                                   title={t('admin.lesson.bridgeSettings')}
                               >
                                   <FiSettings size={16} />
                               </button>
                           )}
                       </div>
                       {formData.isBridgeVideo ? (
                           <>
                               <label htmlFor="lesson_bridgeVideoUrl" className="block text-sm font-medium text-gray-700">{t('admin.lesson.bridgeVideoUrl')} <span aria-hidden="true">*</span></label>
                               <div className="flex items-center gap-2 mt-1">
                                   <input
                                       type="url"
                                       name="bridgeVideoUrl"
                                       id="lesson_bridgeVideoUrl"
                                       value={formData.bridgeVideoUrl || ''}
                                       onChange={handleFormChange}
                                       className="flex-1 p-2 border border-gray-300 rounded-md"
                                       required
                                       aria-required="true"
                                       placeholder="https://video.company.com/video/training/module1/lesson1.mp4"
                                   />
                                   <button
                                       type="button"
                                       onClick={async () => {
                                           const url = formData.bridgeVideoUrl;
                                           if (!url) return;
                                           setBridgeTestStatus('loading');
                                           try {
                                               const baseUrl = new URL(url);
                                               const healthUrl = `${baseUrl.protocol}//${baseUrl.host}/health`;
                                               const response = await fetch(healthUrl, { mode: 'cors' });
                                               if (response.ok) {
                                                   setBridgeTestStatus('success');
                                               } else {
                                                   setBridgeTestStatus('error');
                                               }
                                           } catch {
                                               setBridgeTestStatus('error');
                                           }
                                           setTimeout(() => setBridgeTestStatus('idle'), 3000);
                                       }}
                                       disabled={!formData.bridgeVideoUrl || bridgeTestStatus === 'loading'}
                                       className="px-3 py-2 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
                                       aria-label={t('admin.lesson.testBridgeConnection')}
                                   >
                                       {bridgeTestStatus === 'loading' && <FiLoader className="animate-spin" size={14} />}
                                       {bridgeTestStatus === 'success' && <FiCheckCircle className="text-green-600" size={14} />}
                                       {bridgeTestStatus === 'error' && <FiAlertCircle className="text-red-600" size={14} />}
                                       {bridgeTestStatus === 'idle' && t('admin.lesson.bridgeTest')}
                                       {bridgeTestStatus === 'loading' && t('admin.lesson.bridgeTesting')}
                                       {bridgeTestStatus === 'success' && t('admin.lesson.bridgeConnected')}
                                       {bridgeTestStatus === 'error' && t('admin.lesson.bridgeFailed')}
                                   </button>
                               </div>
                           </>
                       ) : (
                           <>
                               <label htmlFor="lesson_videoUrl" className="block text-sm font-medium text-gray-700">{t('admin.lesson.videoUrl')}</label>
                               <input type="url" name="videoUrl" id="lesson_videoUrl" value={videoUrlInput} onChange={(e) => setVideoUrlInput(e.target.value)} onBlur={(e) => setFormData(prev => ({ ...prev, videoUrl: e.target.value }))} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder={t('admin.lesson.videoUrlPlaceholder')}/>
                               {isDurationLoading && (
                                   <p className="mt-1 flex items-center text-xs text-gray-500" aria-live="polite">
                                       <FiLoader className="animate-spin mr-1" aria-hidden="true" />{t('admin.lesson.detectingDuration')}
                                   </p>
                               )}
                               {!isDurationLoading && detectedDuration !== null && (
                                   <p className="mt-1 flex items-center text-xs text-green-600" aria-live="polite">
                                       <FiCheckCircle className="mr-1" aria-hidden="true" />{t('admin.lesson.durationDetected', { duration: secondsToHMS(detectedDuration) })}
                                   </p>
                               )}
                           </>
                       )}
                   </div>
                   <div>
                       <label htmlFor="lesson_powerpointUrl" className="block text-sm font-medium text-gray-700">{t('admin.lesson.powerpointUrl')}</label>
                       <input type="url" name="powerpointUrl" id="lesson_powerpointUrl" value={formData.powerpointUrl || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder={t('admin.lesson.powerpointUrlPlaceholder')} />
                   </div>
                   <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="lesson_transcript" className="flex items-center text-sm font-medium text-gray-700">{t('admin.lesson.videoTranscript')}<InfoTooltip text={t('admin.lesson.videoTranscriptTooltip')} /></label>
                            <div className="flex items-center space-x-2">
                                <label htmlFor="media-upload" className="cursor-pointer flex items-center text-sm text-purple-600 hover:text-purple-800 transition-colors bg-purple-50 px-2 py-1 rounded-md border border-purple-200">
                                    {isTranscribing ? <FiLoader className="animate-spin mr-1"/> : <FiCpu className="mr-1"/>}
                                    {isTranscribing ? (conversionStatus || t('admin.lesson.processing')) : t('admin.lesson.transcribeWithAi')}
                                </label>
                                <input id="media-upload" type="file" accept="audio/*,video/*" className="hidden" onChange={handleTranscribeFile} disabled={isTranscribing || isLoading || isProcessingFile} />

                                <label htmlFor="transcript-file-upload" className="cursor-pointer flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                                    <FiUploadCloud className="mr-1"/> {t('admin.lesson.importFromFile')}
                                </label>
                                <input id="transcript-file-upload" type="file" accept=".txt,.docx,.pdf,.doc" className="hidden" onChange={handleFileImport} disabled={isTranscribing || isLoading || isProcessingFile} />
                            </div>
                        </div>
                       <AutoResizingTextarea name="transcript" id="lesson_transcript" value={formData.transcript || ''} onChange={handleFormChange} rows={5} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder={t('admin.lesson.transcriptPlaceholder')}/>
                   </div>

                   {/* Lesson Assignments Section */}
                   <div className="pt-4 mt-4 border-t">
                       <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center">{t('admin.lesson.lessonAssignments')}<InfoTooltip text={t('admin.lesson.lessonAssignmentsTooltip')} /></h3>
                       <div className="bg-white p-4 rounded-md border mt-2">
                        {videoDuration !== null && (
                            <div className="text-sm text-gray-500 mb-4 bg-white p-3 rounded-md border">
                               <p className="text-green-700 font-medium">{t('admin.lesson.videoDuration', { duration: secondsToHMS(videoDuration) })}</p>
                           </div>
                        )}

                       {/* Add Assignment — shown only when form is open */}
                       {showAddAssignmentForm && (
                           <div className="bg-gray-50 p-4 rounded-md border mb-4 space-y-4">
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                   <div>
                                       <label className="block text-sm font-medium text-gray-700">{t('admin.lesson.assignmentType')}</label>
                                       <select value={newAssignmentType} onChange={(e) => { setNewAssignmentType(e.target.value as any); setNewAssignmentId(''); }} className="mt-1 w-full p-2 border rounded-md bg-white">
                                           <option value="chat">{t('admin.lesson.assignmentTypeChat')}</option>
                                           <option value="questionnaire">{t('admin.lesson.assignmentTypeQuestionnaire')}</option>
                                           <option value="custom_code">{t('admin.lesson.assignmentTypeCustomCode')}</option>
                                       </select>
                                   </div>
                                   <div>
                                       {newAssignmentType === 'chat' && <>
                                           <label className="block text-sm font-medium text-gray-700">{t('admin.lesson.selectAiMentor')}</label>
                                           <select value={newAssignmentId || ''} onChange={(e) => setNewAssignmentId(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-white">
                                               <option value="">{t('admin.lesson.chooseAiMentor')}</option>
                                               {chatPersonas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                           </select>
                                       </>}
                                       {newAssignmentType === 'questionnaire' && <>
                                           <label className="block text-sm font-medium text-gray-700">{t('admin.lesson.selectQuestionnaire')}</label>
                                           <select value={newAssignmentId || ''} onChange={(e) => setNewAssignmentId(e.target.value)} className="mt-1 w-full p-2 border rounded-md bg-white">
                                               <option value="">{t('admin.lesson.chooseQuestionnaire')}</option>
                                               {questionnaires.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                                           </select>
                                       </>}
                                       {newAssignmentType === 'custom_code' && <>
                                           <label className="block text-sm font-medium text-gray-700">{t('admin.lesson.assignmentName')} <span aria-hidden="true">*</span></label>
                                           <input type="text" value={newAssignmentName || ''} onChange={(e) => setNewAssignmentName(e.target.value)} className="mt-1 w-full p-2 border rounded-md" placeholder={t('admin.lesson.assignmentNamePlaceholder')} required aria-required="true" />
                                       </>}
                                   </div>
                               </div>

                               <div className="flex flex-col space-y-3 pt-2 border-t border-gray-200">
                                   <label className="flex items-center cursor-pointer text-sm">
                                       <input type="checkbox" checked={newAssignmentMandatory} onChange={(e) => setNewAssignmentMandatory(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600"/>
                                       <span className="ml-2 font-medium text-gray-700">{t('admin.lesson.mandatoryToComplete')}</span>
                                   </label>

                                   {newAssignmentType === 'chat' && (
                                       <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                           <input type="checkbox" checked={newAssignmentInsightsPrivate} onChange={(e) => setNewAssignmentInsightsPrivate(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600"/>
                                           <span className="ml-2">{t('admin.lesson.insightsPrivate')}</span>
                                           <InfoTooltip text={t('admin.lesson.insightsPrivateTooltip')} />
                                       </label>
                                   )}

                                   <div className="flex flex-col space-y-2">
                                       <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                           <input type="checkbox" checked={newAssignmentAutoOpenEnabled} onChange={(e) => { setNewAssignmentAutoOpenEnabled(e.target.checked); if (!e.target.checked) setNewAssignmentAutoOpenTimestamp(0); }} className="h-4 w-4 rounded border-gray-300 text-blue-600"/>
                                           <span className="ml-2">{t('admin.lesson.autoOpenDuringVideo')}</span>
                                           <InfoTooltip text={t('admin.lesson.autoOpenTooltip')} />
                                       </label>
                                       {newAssignmentAutoOpenEnabled && (
                                           <div className="pl-6 flex flex-col space-y-1">
                                               <label className="text-xs text-gray-500 font-medium">{t('admin.lesson.timeLabel')}</label>
                                               <div className="flex items-center gap-2">
                                                   <TimePicker value={newAssignmentAutoOpenTimestamp} onChange={setNewAssignmentAutoOpenTimestamp} />
                                                   {formData.videoUrl && (
                                                       <button type="button" onClick={() => setVideoPreviewOpen(true)} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 h-8 rounded-md border border-purple-200 transition-colors whitespace-nowrap" aria-label={t('admin.lesson.previewVideo')}>
                                                           <FiPlay className="h-3 w-3 flex-shrink-0" /> {t('admin.lesson.previewVideo')}
                                                       </button>
                                                   )}
                                               </div>
                                               {videoDuration !== null && newAssignmentAutoOpenTimestamp > videoDuration && (
                                                   <p className="text-xs text-red-600" role="alert">{t('admin.lesson.timeExceedsDuration', { duration: secondsToHMS(videoDuration) })}</p>
                                               )}
                                           </div>
                                       )}
                                   </div>
                               </div>

                               {newAssignmentType === 'custom_code' && (
                                   <div className="space-y-4 pt-2 border-t border-gray-200">
                                       <div>
                                           <div className="flex items-center justify-between mb-2">
                                               <label className="text-sm font-medium text-gray-700">{t('admin.lesson.customCode')} <span aria-hidden="true">*</span></label>
                                               <button
                                                   type="button"
                                                   onClick={() => setShowHtmlWizard(true)}
                                                   className="text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-md flex items-center disabled:opacity-50"
                                                   aria-label={t('admin.lesson.openAiWizard')}
                                               >
                                                   <FiCpu className="mr-2" size={13} aria-hidden="true" /> {t('admin.lesson.createWithAi')}
                                               </button>
                                           </div>
                                           <div className="flex border-b border-gray-200 mb-2" role="tablist" aria-label={t('admin.lesson.codeSection')}>
                                               {(['html', 'css', 'js'] as const).map(tab => (
                                                   <button
                                                       key={tab}
                                                       role="tab"
                                                       type="button"
                                                       aria-selected={newAssignmentActiveTab === tab}
                                                       onClick={() => setNewAssignmentActiveTab(tab)}
                                                       className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${newAssignmentActiveTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                                       aria-label={t('admin.lesson.codeSectionTab', { tab: tab.toUpperCase() })}
                                                   >
                                                       {tab.toUpperCase()}
                                                   </button>
                                               ))}
                                           </div>
                                           {newAssignmentActiveTab === 'html' && (
                                               <textarea value={newAssignmentCustomHtml} onChange={(e) => setNewAssignmentCustomHtml(e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.htmlPlaceholder')} rows={8} required aria-required="true" aria-label={t('admin.lesson.htmlCode')} />
                                           )}
                                           {newAssignmentActiveTab === 'css' && (
                                               <textarea value={newAssignmentCustomCss} onChange={(e) => setNewAssignmentCustomCss(e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.cssPlaceholder')} rows={8} aria-label={t('admin.lesson.cssCode')} />
                                           )}
                                           {newAssignmentActiveTab === 'js' && (
                                               <textarea value={newAssignmentCustomJs} onChange={(e) => setNewAssignmentCustomJs(e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.jsPlaceholder')} rows={8} aria-label={t('admin.lesson.jsCode')} />
                                           )}
                                       </div>
                                       <div>
                                           <div className="mb-4">
                                               <label className="text-sm font-medium text-gray-700 block flex items-center">
                                                   {t('admin.lesson.closeButtonId')}
                                                   {newAssignmentMandatory && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                                                   <InfoTooltip text={t('admin.lesson.closeButtonIdTooltip')} />
                                               </label>
                                               <input type="text" value={newAssignmentEndButtonId} onChange={(e) => setNewAssignmentEndButtonId(e.target.value)} className={`mt-1 p-1 w-full border rounded-md text-sm ${newAssignmentMandatory && !newAssignmentEndButtonId.trim() ? 'border-red-400' : ''}`} placeholder={t('admin.lesson.closeButtonIdPlaceholder')}/>
                                           </div>
                                           <div className="mb-2">
                                               <h4 className="text-sm font-medium text-gray-700 flex items-center">
                                                   {t('admin.lesson.insightSavingFields')}
                                                   <InfoTooltip text={t('admin.lesson.insightSavingFieldsTooltip')} />
                                               </h4>
                                               <button type="button" onClick={addNewInsightField} className="mt-1 text-xs text-blue-600 hover:underline">{t('admin.lesson.addField')}</button>
                                           </div>
                                           {newAssignmentInsightFields.length > 0 && (
                                               <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 space-y-1.5" role="note">
                                                   <p className="font-semibold">{t('admin.lesson.insightFieldsGuideTitle', 'How to expose data for saving:')}</p>
                                                   <p>
                                                       <span className="font-medium">{'Form elements '}</span>
                                                       {'(input, textarea, select): '}
                                                       {t('admin.lesson.insightFieldsGuideFormDesc', 'give the element the HTML ID configured below — its value is captured automatically when the end button is clicked.')}
                                                   </p>
                                                   <p>
                                                       <span className="font-medium">{t('admin.lesson.insightFieldsGuideCustom', 'Non-form elements:')}</span>
                                                       {' '}{t('admin.lesson.insightFieldsGuideCustomDesc', 'if the value is computed or stored in JavaScript rather than in a form input, add any HTML element with the configured ID and keep a special platform attribute called data-gymind-value updated on it — the platform reads this attribute when the end button is clicked:')}
                                                   </p>
                                                   <code className="block bg-amber-100 rounded px-2 py-1 font-mono whitespace-pre-wrap break-all">
                                                       {"document.getElementById('my-result').dataset.gymindValue = Array.from(mySet).join(', ');"}
                                                   </code>
                                                   <p>{t('admin.lesson.insightFieldsGuideButton', 'The End Button ID above must match exactly the id of the finish button in your HTML.')}</p>
                                               </div>
                                           )}
                                           {newAssignmentInsightFields.map((field, fIdx) => (
                                               <div key={fIdx} className="grid grid-cols-2 gap-2 items-center mt-1">
                                                   <input type="text" value={field.htmlElementId} onChange={(e) => handleNewInsightFieldChange(fIdx, 'htmlElementId', e.target.value)} placeholder={t('admin.lesson.htmlIdPlaceholder')} className="p-1 border rounded-md text-xs"/>
                                                   <div className="flex items-center">
                                                       <input type="text" value={field.label} onChange={(e) => handleNewInsightFieldChange(fIdx, 'label', e.target.value)} placeholder={t('admin.lesson.insightLabelPlaceholder')} className="flex-grow p-1 border rounded-md text-xs"/>
                                                       <button type="button" onClick={() => removeNewInsightField(fIdx)} className="ml-1 text-red-500 p-1"><FiTrash2 size={12}/></button>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   </div>
                               )}
                               <div className="flex justify-end pt-2 border-t border-gray-200">
                                   <button
                                       type="button"
                                       onClick={resetAssignmentForm}
                                       className="text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 py-1 px-3 rounded-md border border-gray-300 flex items-center"
                                       aria-label={t('admin.lesson.cancelAddingAssignment')}
                                   >
                                       <FiXCircle className="mr-1.5"/> {t('common.cancel')}
                                   </button>
                               </div>
                           </div>
                       )}

                       {/* Add Assignment button — shown when form is hidden */}
                       {!showAddAssignmentForm && (
                           <button
                               type="button"
                               onClick={() => setShowAddAssignmentForm(true)}
                               className="mb-4 text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-md flex items-center"
                               aria-label={t('admin.lesson.addAssignment')}
                           >
                               <FiPlusCircle className="mr-2"/> {t('admin.lesson.addAssignment')}
                           </button>
                       )}
                       {formData.assignments && formData.assignments.length > 0 ? <div className="space-y-2">{formData.assignments.map((assignment, index) => {
                           const isExpanded = expandedAssignmentId === assignment.id;
                           return (
                           <div key={`${assignment.id}_${index}`} className="flex flex-col p-3 bg-gray-50 border rounded-md shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center min-w-0">
                                        <div className="mr-3 flex-shrink-0">
                                            {assignment.type === 'chat' ? <FiMessageSquare className="h-5 w-5 text-blue-500"/> : 
                                            assignment.type === 'questionnaire' ? <QuestionnaireIcon className="h-5 w-5 text-purple-500" height={20} width={20} /> : 
                                            <FiCode className="h-5 w-5 text-gray-500"/>}
                                        </div>
                                        <div className="flex-grow min-w-0">
                                            <p className="font-semibold text-gray-800 truncate" title={assignment.name}>{assignment.name}</p>
                                            <div className="flex items-center mt-1">
                                                <span className="text-xs text-gray-500 uppercase font-bold tracking-wide mr-2">{assignment.type.replace('_', ' ')}</span>
                                                {assignment.isMandatory && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold uppercase border border-orange-200">{t('admin.lesson.required')}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                        {assignment.type === 'custom_code' && (
                                            <button type="button" onClick={() => {
                                                let result = assignment.customHtml || '';
                                                if (assignment.customCss) {
                                                    const tag = `<style>\n${assignment.customCss}\n</style>`;
                                                    result = result.includes('</head>') ? result.replace('</head>', `${tag}\n</head>`) : tag + result;
                                                }
                                                if (assignment.customJs) {
                                                    const tag = `<script>\n${assignment.customJs}\n</script>`;
                                                    result = result.includes('</body>') ? result.replace('</body>', `${tag}\n</body>`) : result + tag;
                                                }
                                                if (assignment.endButtonId) {
                                                    const insightFieldsJson = JSON.stringify(assignment.insightFields || []);
                                                    const sandboxScript = `<script>
document.addEventListener('DOMContentLoaded', function() {
    var endButton = document.getElementById('${assignment.endButtonId}');
    if (endButton) {
        endButton.addEventListener('click', function(event) {
            event.preventDefault();
            var insightFields = ${insightFieldsJson};
            var insights = [];
            for (var i = 0; i < insightFields.length; i++) {
                var field = insightFields[i];
                var element = document.getElementById(field.htmlElementId);
                if (element && element.value !== undefined) {
                    insights.push({ key: field.key, label: field.label, value: element.value });
                }
            }
            window.parent.postMessage({ type: 'GYMIND_PREVIEW_SANDBOX_SAVE', insights: insights }, '*');
        });
    }
});
</script>`;
                                                    result = result.includes('</body>') ? result.replace('</body>', `${sandboxScript}\n</body>`) : result + sandboxScript;
                                                }
                                                setCodePreviewHtml(result);
                                            }} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 px-2 h-7 rounded-md border border-green-200 transition-colors whitespace-nowrap" aria-label={t('admin.lesson.previewCode')}>
                                                <FiPlay className="h-3 w-3 flex-shrink-0" /> {t('admin.lesson.previewCode')}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => { setExpandedAssignmentId(isExpanded ? null : assignment.id); setActiveCodeEditTab('html'); }} className={`p-1.5 rounded-full transition-colors ${isExpanded ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'}`} title={t('admin.lesson.editSettings')} aria-label={t('admin.lesson.editSettings')}>
                                            <FiEdit size={16}/>
                                        </button>
                                        <button type="button" onClick={() => handleDeleteAssignment(index)} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100" title={t('admin.lesson.deleteAssignment')} aria-label={t('admin.lesson.deleteAssignment')}><FiTrash2 size={16}/></button>
                                    </div>
                                </div>
                                {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                                    {assignment.type === 'custom_code' && (
                                        <div>
                                            <label htmlFor={`assignmentName-${index}`} className="block text-sm font-medium text-gray-700">{t('admin.lesson.assignmentName')}</label>
                                            <input type="text" id={`assignmentName-${index}`} value={assignment.name} onChange={(e) => handleAssignmentPropChange(index, 'name', e.target.value)} className="mt-1 p-2 w-full border rounded-md text-sm" placeholder={t('admin.lesson.assignmentNamePlaceholder')} aria-label={t('admin.lesson.assignmentName')} />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                                <input type="checkbox" checked={!!assignment.isMandatory} onChange={(e) => handleAssignmentPropChange(index, 'isMandatory', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                                                <span className="ml-2">{t('admin.lesson.mandatoryToComplete')}</span>
                                            </label>

                                            {assignment.type === 'chat' && (
                                                <label htmlFor={`isInsightsPrivate-${index}`} className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        id={`isInsightsPrivate-${index}`}
                                                        checked={!!assignment.isInsightsPrivate}
                                                        onChange={(e) => handleAssignmentPropChange(index, 'isInsightsPrivate', e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                                    />
                                                    <span className="ml-2">{t('admin.lesson.insightsPrivate')}</span>
                                                    <InfoTooltip text={t('admin.lesson.insightsPrivateTooltip')} />
                                                </label>
                                            )}

                                            <div className="flex flex-col space-y-2">
                                                <label htmlFor={`autoOpen-${index}`} className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                                                    <input type="checkbox" id={`autoOpen-${index}`} checked={!!assignment.autoOpenEnabled} onChange={(e) => {
                                                        handleAssignmentPropChange(index, 'autoOpenEnabled', e.target.checked);
                                                    }} className="h-4 w-4 rounded border-gray-300 text-blue-600"/>
                                                    <span className="ml-2">{t('admin.lesson.autoOpenDuringVideo')}</span>
                                                    <InfoTooltip text={t('admin.lesson.autoOpenTooltip')} />
                                                </label>
                                                {assignment.autoOpenEnabled && (
                                                    <div className="pl-6 flex flex-col space-y-1">
                                                        <label className="text-xs text-gray-500 font-medium">{t('admin.lesson.timeLabel')}</label>
                                                        <div className="flex items-center gap-2">
                                                            <TimePicker value={assignment.autoOpenTimestamp ?? 0} onChange={(v) => handleAssignmentPropChange(index, 'autoOpenTimestamp', v)} />
                                                            {formData.videoUrl && (
                                                                <button type="button" onClick={() => setVideoPreviewOpen(true)} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 h-8 rounded-md border border-purple-200 transition-colors whitespace-nowrap" aria-label={t('admin.lesson.previewVideo')}>
                                                                    <FiPlay className="h-3 w-3 flex-shrink-0" /> {t('admin.lesson.previewVideo')}
                                                                </button>
                                                            )}
                                                        </div>
                                                        {videoDuration !== null && (assignment.autoOpenTimestamp ?? 0) > videoDuration && (
                                                            <p className="text-xs text-red-600" role="alert">{t('admin.lesson.timeExceedsDuration', { duration: secondsToHMS(videoDuration) })}</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {assignment.type === 'custom_code' && (
                                        <div className="space-y-3 pt-3 border-t border-gray-100">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-sm font-medium text-gray-700">{t('admin.lesson.customCode')}</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingHtmlWizardIndex(index)}
                                                        className="text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-md flex items-center disabled:opacity-50"
                                                        aria-label={t('admin.lesson.openAiWizard')}
                                                    >
                                                        <FiCpu className="mr-2" size={13} aria-hidden="true" /> {t('admin.lesson.createWithAi')}
                                                    </button>
                                                </div>
                                                <div className="flex border-b border-gray-200 mb-2" role="tablist" aria-label={t('admin.lesson.codeSection')}>
                                                    {(['html', 'css', 'js'] as const).map(tab => (
                                                        <button
                                                            key={tab}
                                                            role="tab"
                                                            type="button"
                                                            aria-selected={activeCodeEditTab === tab}
                                                            onClick={() => setActiveCodeEditTab(tab)}
                                                            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeCodeEditTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                                            aria-label={t('admin.lesson.codeSectionTab', { tab: tab.toUpperCase() })}
                                                        >
                                                            {tab.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                                {activeCodeEditTab === 'html' && (
                                                    <textarea id={`customHtml-${index}`} value={assignment.customHtml || ''} onChange={(e) => handleAssignmentPropChange(index, 'customHtml', e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.htmlPlaceholder')} rows={12} aria-label={t('admin.lesson.htmlCode')} />
                                                )}
                                                {activeCodeEditTab === 'css' && (
                                                    <textarea id={`customCss-${index}`} value={assignment.customCss || ''} onChange={(e) => handleAssignmentPropChange(index, 'customCss', e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.cssPlaceholder')} rows={12} aria-label={t('admin.lesson.cssCode')} />
                                                )}
                                                {activeCodeEditTab === 'js' && (
                                                    <textarea id={`customJs-${index}`} value={assignment.customJs || ''} onChange={(e) => handleAssignmentPropChange(index, 'customJs', e.target.value)} className="p-2 w-full border rounded-md font-mono text-xs resize-y" placeholder={t('admin.lesson.jsPlaceholder')} rows={12} aria-label={t('admin.lesson.jsCode')} />
                                                )}
                                            </div>
                                            <div>
                                                <div className="mb-4">
                                                    <label htmlFor={`endButtonId-${index}`} className="text-sm font-medium text-gray-700 block flex items-center">
                                                        {t('admin.lesson.closeButtonId')}
                                                        {assignment.isMandatory && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
                                                        <InfoTooltip text={t('admin.lesson.closeButtonIdTooltip')} />
                                                    </label>
                                                    <input type="text" id={`endButtonId-${index}`} value={assignment.endButtonId || ''} onChange={(e) => handleAssignmentPropChange(index, 'endButtonId', e.target.value)} className={`mt-1 p-1 w-full border rounded-md text-sm ${assignment.isMandatory && !assignment.endButtonId?.trim() ? 'border-red-400' : ''}`} placeholder={t('admin.lesson.closeButtonIdPlaceholder')}/>
                                                </div>
                                                <div className="mb-2">
                                                    <h4 className="text-sm font-medium text-gray-700 flex items-center">
                                                        {t('admin.lesson.insightSavingFields')}
                                                        <InfoTooltip text={t('admin.lesson.insightSavingFieldsTooltip')} />
                                                    </h4>
                                                    <button type="button" onClick={() => addInsightField(index)} className="mt-1 text-xs text-blue-600 hover:underline">{t('admin.lesson.addField')}</button>
                                                </div>
                                                {(assignment.insightFields || []).map((field, fieldIndex) => (
                                                    <div key={fieldIndex} className="grid grid-cols-2 gap-2 items-center mt-1">
                                                        <input type="text" value={field.htmlElementId} onChange={(e) => handleInsightFieldChange(index, fieldIndex, 'htmlElementId', e.target.value)} placeholder={t('admin.lesson.htmlIdPlaceholder')} className="p-1 border rounded-md text-xs"/>
                                                        <div className="flex items-center">
                                                            <input type="text" value={field.label} onChange={(e) => handleInsightFieldChange(index, fieldIndex, 'label', e.target.value)} placeholder={t('admin.lesson.insightLabelPlaceholder')} className="flex-grow p-1 border rounded-md text-xs"/>
                                                            <button type="button" onClick={() => removeInsightField(index, fieldIndex)} className="ml-1 text-red-500 p-1"><FiTrash2 size={12}/></button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                </div>
                                )}
                           </div>
                       )})}</div> : <p className="text-sm text-gray-500 text-center italic">{t('admin.lesson.noAssignments')}</p>}
                       </div>
                   </div>

                   {/* Quiz Questions Section */}
                   <div className="pt-4 mt-4 border-t">
                     <h3 className="text-lg font-semibold text-gray-800">{t('admin.lesson.quizQuestions')}</h3>
                     <div className="space-y-4 mt-2">
                       {formData.questions?.map((q, qIndex) => (
                           <div key={q.id} className="p-3 border rounded-md bg-gray-50">
                               <div className="flex justify-between items-start">
                                   <div className="flex-grow pr-4">
                                        <label className="block text-xs font-medium text-gray-500">{t('admin.lesson.questionLabel', { number: qIndex + 1 })}</label>
                                        <textarea value={q.text} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} rows={2} className="w-full p-1 border rounded-md mt-1"/>
                                   </div>
                                   <div className="flex items-center space-x-1 flex-shrink-0">
                                       <button type="button" onClick={() => onDuplicateQuestion(courseId!, lessonId!, q)} className="p-1.5 text-gray-500 hover:text-green-700 rounded-full hover:bg-green-100" title={t('admin.lesson.duplicateQuestion')} aria-label={t('admin.lesson.duplicateQuestion')}><FiCopy size={16}/></button>
                                       <button type="button" onClick={() => handleDeleteQuestion(qIndex)} className="p-1.5 text-red-600 hover:text-red-800 rounded-full hover:bg-red-100" aria-label={t('admin.lesson.deleteQuestion')}><FiTrash2 size={16}/></button>
                                   </div>
                               </div>
                               <div className="mt-2 pl-4 space-y-2 text-sm">
                                   <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.lesson.answers')}</label>
                                   {q.answers.map((ans, aIndex) => (
                                       <div key={ans.id} className="flex items-center">
                                           <input type="radio" name={`correctAnswer_${qIndex}`} checked={ans.id === q.correctAnswerId} onChange={() => handleQuestionChange(qIndex, 'correctAnswerId', ans.id)} className="h-4 w-4 mr-2 text-green-600 focus:ring-green-500" title={t('admin.lesson.markAsCorrect')} aria-label={t('admin.lesson.markAsCorrect')}/>
                                           <input type="text" value={ans.text} onChange={(e) => handleAnswerChange(qIndex, aIndex, e.target.value)} className={`flex-grow p-1 border rounded-md text-sm ${ans.id === q.correctAnswerId ? 'border-green-400 bg-green-50' : ''}`}/>
                                           <button type="button" onClick={() => handleDeleteAnswer(qIndex, aIndex)} className="ml-2 text-red-500 hover:text-red-700 p-1" aria-label={t('admin.lesson.deleteAnswer')}><FiTrash2 size={12}/></button>
                                       </div>
                                   ))}
                                    <button type="button" onClick={() => handleAddAnswer(qIndex)} className="text-xs text-blue-600 hover:underline mt-2">{t('admin.lesson.addAnswer')}</button>
                               </div>
                           </div>
                       ))}
                     </div>
                     <div className="flex justify-start items-center space-x-2 mt-4">
                         <button type="button" onClick={handleAddQuestion} disabled={isLoading || isGeneratingQuestion || isTranscribing} className="text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 py-1 px-3 rounded-md flex items-center disabled:opacity-50"><FiPlusCircle className="mr-2"/> {t('admin.lesson.addQuestion')}</button>
                         <button type="button" onClick={handleGenerateQuestionWithAI} disabled={isLoading || isGeneratingQuestion || isTranscribing} className="text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 py-1 px-3 rounded-md flex items-center disabled:opacity-50">
                             {isGeneratingQuestion ? <FiLoader className="animate-spin mr-2"/> : <FiZap className="mr-2"/>}
                             {isGeneratingQuestion ? t('admin.lesson.generating') : t('admin.lesson.addWithAi')}
                         </button>
                     </div>
                   </div>
               </form>
               <div className="flex justify-end space-x-3 p-6 border-t mt-auto flex-shrink-0">
                   <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">{t('common.cancel')}</button>
                   <button form="lesson-form" type="submit" disabled={isLoading || isGeneratingQuestion || isTranscribing || isProcessingFile} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"><FiSave className="mr-2"/>{t('admin.lesson.saveLesson')}</button>
               </div>
           </div>
           {alertModal && (
               <ValidationModal 
                   type={alertModal.type} 
                   message={alertModal.message} 
                   onClose={() => setAlertModal(null)} 
                   onConfirm={alertModal.onConfirm} 
               />
           )}
           <BridgeSettingsModal isOpen={showBridgeSettings} onClose={() => setShowBridgeSettings(false)} />

           {/* Code Preview Modal — sized to match the actual user assignment view */}
           {codePreviewHtml !== null && ReactDOM.createPortal(
               <div
                   className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-4 bg-black/80"
                   onClick={() => setCodePreviewHtml(null)}
                   role="dialog"
                   aria-modal="true"
                   aria-label={t('admin.lesson.assignmentCodePreview')}
               >
                   <div
                       className="relative w-full h-full md:max-w-6xl md:h-[90vh] bg-white md:rounded-xl shadow-2xl overflow-hidden flex flex-col"
                       onClick={(e) => e.stopPropagation()}
                   >
                       <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
                           <h3 className="font-semibold text-gray-800 text-sm">{t('admin.lesson.codePreview')}</h3>
                           <button onClick={() => setCodePreviewHtml(null)} className="p-1.5 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors" aria-label={t('admin.lesson.closeCodePreview')}>
                               <FiXCircle className="h-5 w-5" />
                           </button>
                       </div>
                       <iframe
                           srcDoc={codePreviewHtml}
                           className="w-full flex-1 border-0"
                           title={t('admin.lesson.assignmentCodePreview')}
                           sandbox="allow-scripts allow-same-origin"
                       />
                   </div>
               </div>,
               document.body
           )}

           {/* AI HTML Wizard — new assignment */}
           {showHtmlWizard && (
               <AssignmentHtmlAiWizard
                   initialHtml={newAssignmentWizardSession?.html ?? newAssignmentCustomHtml}
                   initialCss={newAssignmentWizardSession?.css ?? newAssignmentCustomCss}
                   initialJs={newAssignmentWizardSession?.js ?? newAssignmentCustomJs}
                   initialMessages={newAssignmentWizardSession?.messages}
                   onSessionChange={(msgs, html, css, js) => setNewAssignmentWizardSession({ messages: msgs, html, css, js })}
                   onClose={() => setShowHtmlWizard(false)}
                   onApply={(html, css, js) => {
                       setNewAssignmentCustomHtml(html);
                       setNewAssignmentCustomCss(css);
                       setNewAssignmentCustomJs(js);
                       setShowHtmlWizard(false);
                   }}
               />
           )}

           {/* AI HTML Wizard — edit existing assignment */}
           {editingHtmlWizardIndex !== null && formData.assignments?.[editingHtmlWizardIndex] && (
               <AssignmentHtmlAiWizard
                   initialHtml={editWizardSessions[editingHtmlWizardIndex]?.html ?? formData.assignments[editingHtmlWizardIndex].customHtml ?? ''}
                   initialCss={editWizardSessions[editingHtmlWizardIndex]?.css ?? formData.assignments[editingHtmlWizardIndex].customCss ?? ''}
                   initialJs={editWizardSessions[editingHtmlWizardIndex]?.js ?? formData.assignments[editingHtmlWizardIndex].customJs ?? ''}
                   initialMessages={editWizardSessions[editingHtmlWizardIndex]?.messages}
                   onSessionChange={(msgs, html, css, js) => setEditWizardSessions(prev => ({ ...prev, [editingHtmlWizardIndex]: { messages: msgs, html, css, js } }))}
                   onClose={() => setEditingHtmlWizardIndex(null)}
                   onApply={(html, css, js) => {
                       handleAssignmentPropChange(editingHtmlWizardIndex, 'customHtml', html);
                       handleAssignmentPropChange(editingHtmlWizardIndex, 'customCss', css);
                       handleAssignmentPropChange(editingHtmlWizardIndex, 'customJs', js);
                       setEditingHtmlWizardIndex(null);
                   }}
               />
           )}

           {/* Video Preview Lightbox */}
           {videoPreviewOpen && formData.videoUrl && ReactDOM.createPortal(
               <div
                   className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
                   onClick={() => setVideoPreviewOpen(false)}
                   role="dialog"
                   aria-modal="true"
                   aria-label={t('admin.lesson.videoPreview')}
               >
                   <div
                       className="relative w-full max-w-4xl mx-4 aspect-video bg-black rounded-lg shadow-2xl overflow-hidden"
                       onClick={(e) => e.stopPropagation()}
                   >
                       <button
                           onClick={() => setVideoPreviewOpen(false)}
                           className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                           aria-label={t('admin.lesson.closeVideoPreview')}
                       >
                           <FiXCircle className="h-5 w-5" />
                       </button>
                       {/youtube\.com|youtu\.be|vimeo\.com/.test(formData.videoUrl) ? (
                           <iframe
                               src={getEmbedUrl(formData.videoUrl)}
                               className="w-full h-full"
                               allow="autoplay; fullscreen"
                               allowFullScreen
                               title={t('admin.lesson.videoPreview')}
                           />
                       ) : (
                           <video
                               src={formData.videoUrl}
                               controls
                               autoPlay
                               className="w-full h-full"
                           />
                       )}
                   </div>
               </div>,
               document.body
           )}
        </div>,
        document.getElementById('modal-root')!
    );
};

export default LessonModal;