
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as apiService from '../../services/geminiService';
import { Lesson, Message } from '../../types';
import ChatMessageBubble from '../chat/ChatMessageBubble';
import { FiSend, FiLoader, FiAlertCircle, FiX } from 'react-icons/fi';
import AiDisclaimer from '../legal/AiDisclaimer';

interface LessonChatProps {
    lesson: Lesson;
    onClose?: () => void;
}

const LessonChat: React.FC<LessonChatProps> = ({ lesson, onClose }) => {
    const { t, i18n } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isIOSSafari = isIOS && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
    const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && (!isIOS || isIOSSafari);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        return () => { recognitionRef.current?.stop(); };
    }, []);

    const handleToggleVoice = useCallback(() => {
        if (!speechSupported) return;

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = i18n.language || 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript: string = event.results[0][0].transcript;
            setInputValue(prev => prev ? `${prev} ${transcript}` : transcript);
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [isListening, speechSupported, i18n.language]);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return;

        const textToSend = inputValue;
        setInputValue('');
        setError(null);

        const userMessage: Message = {
            id: `msg_${Date.now()}_user`,
            sender: 'user',
            text: textToSend,
            timestamp: new Date(),
        };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setIsLoading(true);

        const aiMessagePlaceholderId = `msg_${Date.now()}_ai`;
        const aiMessagePlaceholder: Message = {
            id: aiMessagePlaceholderId,
            sender: 'ai',
            text: '',
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessagePlaceholder]);

        try {
            await apiService.streamLessonChatMessage(
                { courseId: lesson.courseId, lessonId: lesson.id, message: textToSend, history: updatedMessages.slice(0, -1) },
                (chunk) => {
                    setMessages(prev => prev.map(msg => 
                        msg.id === aiMessagePlaceholderId ? { ...msg, text: msg.text + chunk } : msg
                    ));
                },
                (errorMessage) => {
                    setError(errorMessage);
                    setMessages(prev => prev.map(msg => 
                        msg.id === aiMessagePlaceholderId ? { ...msg, text: errorMessage, isError: true } : msg
                    ));
                },
                () => {
                    setIsLoading(false);
                }
            );
        } catch (e: any) {
            setError(e.message || "An unexpected error occurred.");
            setMessages(prev => prev.map(msg => 
                msg.id === aiMessagePlaceholderId ? { ...msg, text: e.message, isError: true } : msg
            ));
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <header className="bg-gray-100 p-4 border-b flex-shrink-0 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800">{t('courses.askAboutLesson')}</h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full hover:bg-gray-200"
                        aria-label={t('common.closeChat')}
                    >
                        <FiX size={24} className="text-gray-700" />
                    </button>
                )}
            </header>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar" aria-live="polite" aria-label={t('chat.messages')}>
                {messages.map((msg, index) => {
                    if (isLoading && msg.sender === 'ai' && index === messages.length - 1 && !msg.text) return null;
                    return (
                        <ChatMessageBubble
                            key={msg.id}
                            message={msg}
                            isStreaming={isLoading && msg.sender === 'ai' && index === messages.length - 1}
                        />
                    );
                })}
                {isLoading && messages.length > 0 && messages[messages.length - 1]?.sender === 'ai' && !messages[messages.length - 1]?.text && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3" aria-label={t('chat.thinking')}>
                            <span className="text-sm text-gray-500 italic flex">
                                {t('chat.thinking').split('').map((char, i) => (
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

            {error && (
                <div role="alert" className="p-2 bg-red-100 text-red-700 text-sm flex items-center flex-shrink-0">
                    <FiAlertCircle className="mr-2"/> {error}
                </div>
            )}

            <div className="p-4 border-t flex-shrink-0" style={{ backgroundColor: 'rgb(31 41 55)' }}>
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={t('courses.typeYourQuestion')}
                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        disabled={isLoading}
                        aria-label={t('courses.typeYourQuestion')}
                    />
                    {speechSupported && (
                        <button
                            onClick={handleToggleVoice}
                            disabled={isLoading}
                            className={`p-2 rounded-lg w-9 h-9 flex items-center justify-center transition-colors disabled:bg-gray-400 disabled:text-white ${isListening ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
                            aria-label={isListening ? t('chat.stopListening', 'Stop listening') : t('chat.startListening', 'Speak a message')}
                            aria-pressed={isListening}
                        >
                            {isListening ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="1" y1="1" x2="23" y2="23"/>
                                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                                    <line x1="12" y1="19" x2="12" y2="23"/>
                                    <line x1="8" y1="23" x2="16" y2="23"/>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                    <line x1="12" y1="19" x2="12" y2="23"/>
                                    <line x1="8" y1="23" x2="16" y2="23"/>
                                </svg>
                            )}
                        </button>
                    )}
                    <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading}
                        className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
                    >
                        {isLoading ? <FiLoader className="animate-spin" size={20} /> : <FiSend size={20} />}
                    </button>
                </div>
                <AiDisclaimer />
            </div>
        </div>
    );
};

export default LessonChat;
