import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { FiSend, FiRefreshCw, FiLoader, FiFileText, FiAlertCircle, FiCheckCircle, FiArrowLeft, FiCheckSquare, FiEye, FiEyeOff } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useData } from '../../hooks/useData';
import { useChatSession } from '../../contexts/ChatSessionContext';
import { ExtractedFactors, Message, ChatPersona } from '../../types';
import * as apiService from '../../services/geminiService';
import ChatMessageBubble from './ChatMessageBubble';
import { debugLog } from '../../config';
import AiDisclaimer from '../legal/AiDisclaimer';
import { useTranslation } from 'react-i18next';

export interface ChatInterfaceHandle {
  saveSessionForCompletion: () => Promise<boolean>;
}

interface ChatInterfaceProps {
  embeddedPersonaId?: string;
  isEmbedded?: boolean;
  onSessionSaved?: () => void;
  isEphemeralSession?: boolean;
  onClose?: () => void;
  isInsightsPrivateByDefault?: boolean;
}

const ChatInterfacePage = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(({ embeddedPersonaId, isEmbedded = false, onSessionSaved, isEphemeralSession = false, onClose, isInsightsPrivateByDefault = true }, ref) => {
  const { t, i18n } = useTranslation();
  const params = useParams<{ personaId: string }>();
  const personaId = embeddedPersonaId || params.personaId;

  const sessionKey = useMemo(() => {
    const key = isEphemeralSession ? `ephemeral_${personaId}` : personaId || '';
    return key;
  }, [isEphemeralSession, personaId]);
  
  const navigate = useNavigate();
  const { user, selectedOrganization } = useAuth();
  const { saveConversation, dataError: dataCtxError, clearDataError } = useData();
  const { 
    isChatLoading, 
    chatError: sessionChatError, 
    sessions,
    ensureSessionInitialized,
    startNewChatSession, 
    startEphemeralSession,
    sendMessageToAI, 
    setChatError 
  } = useChatSession();

  const [persona, setPersona] = useState<ChatPersona | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [showSummarizeButton, setShowSummarizeButton] = useState(false);
  const isSavingEnabled = user?.conversationSavingEnabled !== false;
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  
  // State for privacy confirmation modal
  const [showPrivacyConfirm, setShowPrivacyConfirm] = useState(false);
  const [pendingFactors, setPendingFactors] = useState<ExtractedFactors | null>(null);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIOSSafari = isIOS && /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
  const speechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) && (!isIOS || isIOSSafari);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chatMessages = (sessionKey && sessions[sessionKey]) ? sessions[sessionKey] : [];


  useImperativeHandle(ref, () => ({
    saveSessionForCompletion: async () => {
        if (!user || !personaId || !persona || chatMessages.length === 0) return false;
        
        try {
            const savedConv = await saveConversation({
              messages: isSavingEnabled ? chatMessages : [],
              extractedFactors: {}, 
              personaId: persona.id,
              personaName: persona.name,
              isPrivate: true, // Time-based completion is always private
            });
            return !!savedConv;
        } catch (e) {
            console.error("Failed to save session for time-based completion:", e);
            setChatError("Failed to save assignment progress.");
            return false;
        }
    }
  }));

  useEffect(() => {
    const fetchPersonaDetails = async () => {
      if (!personaId) {
        if (!isEmbedded) navigate('/chat');
        return;
      }
      try {
        const allPersonas = await apiService.getAccessibleChatPersonas();
        
        const currentPersona = allPersonas.find(p => p.id === personaId);
        if (currentPersona) {
          setPersona(currentPersona);
        } else {
          setChatError("You do not have access to this chat persona.");
          if (!isEmbedded) navigate('/chat');
        }
      } catch (error) {
        console.error("Failed to fetch persona details", error);
        if (!isEmbedded) navigate('/chat');
      }
    };
    fetchPersonaDetails();
  }, [personaId, navigate, setChatError, isEmbedded]);

  useEffect(() => {
    if (user && personaId && persona && sessionKey) {
      if (isEphemeralSession) {
        startEphemeralSession(user.id, sessionKey, persona.isInitialMessageEnabled ? persona.initialMessage : undefined);
      } else {
        ensureSessionInitialized(user.id, sessionKey, persona.isInitialMessageEnabled ? persona.initialMessage : undefined);
      }
    }
  }, [user, personaId, persona, isEphemeralSession, sessionKey, ensureSessionInitialized, startEphemeralSession]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!isChatLoading && chatMessages.length > 0) {
      inputRef.current?.focus();
    }
  }, [isChatLoading, chatMessages]);
  
  const handleInitiateNewChat = useCallback(() => {
    if (window.confirm(t('chat.confirmNewSession'))) {
        if (user && personaId) {
            if (isEphemeralSession) {
                startEphemeralSession(user.id, sessionKey, (persona?.isInitialMessageEnabled && persona.initialMessage) ? persona.initialMessage : undefined, true);
            } else {
                startNewChatSession(user.id, sessionKey, (persona?.isInitialMessageEnabled && persona.initialMessage) ? persona.initialMessage : undefined);
            }
            setShowSummarizeButton(false);
            setChatError(null);
            clearDataError();
            inputRef.current?.focus();
        }
    }
  }, [user, personaId, persona, isEphemeralSession, sessionKey, startEphemeralSession, startNewChatSession, setChatError, clearDataError]);


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
    if (!inputValue.trim() || isChatLoading || !personaId) return;

    const textToSend = inputValue;
    setInputValue('');
    setChatError(null);
    clearDataError();
    setSaveSuccessMessage(null);

    await sendMessageToAI(
      textToSend,
      sessionKey, 
      personaId,  
      (chunk) => {
        if (chunk.includes('[[SHOW_SAVE_BUTTON]]') || chunk.includes('SHOW_SAVE_BUTTON')) {
             setShowSummarizeButton(true);
        }
      },
      isEphemeralSession
    );
  };
  
  const handleConfirmSave = async (isMakingPrivate: boolean) => {
      if (!user || !personaId || !persona || pendingFactors === null) return;

      setIsExtracting(true);
      setShowPrivacyConfirm(false);

      try {
          const messagesToSave = isSavingEnabled ? chatMessages : [];
          const savedConv = await saveConversation({
              messages: messagesToSave,
              extractedFactors: pendingFactors, 
              personaId: persona.id,
              personaName: persona.name,
              isPrivate: isMakingPrivate,
          });

          if (savedConv) {
              if (isEmbedded && onSessionSaved) {
                  setSaveSuccessMessage(t('chat.assignmentCompleted'));
                  setTimeout(() => onSessionSaved(), 1500);
              } else {
                  // This case should not be reachable if privacy modal only shows for embedded
              }
          } else {
              setChatError(dataCtxError || "Failed to save conversation.");
          }
      } catch (e: any) {
          setChatError(e.message || "An error occurred during save.");
      } finally {
          setIsExtracting(false);
          setPendingFactors(null);
      }
  };


  const handleExtractAndSave = async () => {
    if (!user || !personaId || !persona) {
      setChatError("User or Persona not found.");
      return;
    }

    setIsExtracting(true);
    setChatError(null);
    clearDataError();
    setSaveSuccessMessage(null);

    try {
      let factors: ExtractedFactors | undefined;
      
      if (chatMessages.length > 0) {
          try {
            factors = await apiService.extractFactorsFromBackend(chatMessages, personaId);
          } catch (e) {
            console.warn("Insight extraction failed or returned nothing.", e);
          }
      }

      // If this is an embedded lesson chat AND the admin has not set it to private by default,
      // show the user the privacy confirmation modal.
      if (isEmbedded && isInsightsPrivateByDefault === false) {
        setPendingFactors(factors || {});
        setShowPrivacyConfirm(true);
        setIsExtracting(false); // Stop the button spinner while modal is open
        return;
      }
      
      // Default flow for regular chats or private lesson chats
      if (factors || isEmbedded) {
        const messagesToSave = isSavingEnabled ? chatMessages : [];
        const savedConv = await saveConversation({
          messages: messagesToSave,
          extractedFactors: factors || {}, 
          personaId: persona.id,
          personaName: persona.name,
          isPrivate: true, // Default to private
        });

        if (savedConv) {
          if (isEmbedded && onSessionSaved) {
             setSaveSuccessMessage(t('chat.assignmentCompleted'));
             setTimeout(() => onSessionSaved(), 1500);
          } else {
             startNewChatSession(user.id, personaId, (persona.isInitialMessageEnabled && persona.initialMessage) ? persona.initialMessage : undefined);
             navigate('/chat', {
                replace: true,
                state: {
                  showInsightsForPersonaId: persona.id,
                  newConversationId: savedConv.id
                }
              });
          }
        } else {
          setChatError(dataCtxError || "Failed to save conversation.");
          setIsExtracting(false);
        }
      } else {
        setChatError("Could not extract insights from this conversation. Try chatting a bit more.");
        setIsExtracting(false);
      }
    } catch (e: any) {
      setChatError(e.message || "An error occurred during processing.");
      setIsExtracting(false);
    }
  };
  
  const combinedError = sessionChatError || dataCtxError;

  if (selectedOrganization?.hasChatAccess === false) {
    debugLog('[ChatInterfacePage] User organization does not have chat access. Redirecting.');
    return <Navigate to="/chat" replace />;
  }

  if (!persona) {
    return <div className="flex justify-center items-center h-full"><FiLoader className="animate-spin h-8 w-8 text-blue-500"/></div>;
  }

  const shouldShowButton = showSummarizeButton && !isEmbedded;
  const buttonLabel = isExtracting
    ? t('common.processing')
    : t('chat.summarizeAndSave');
  const ButtonIcon = isExtracting ? FiLoader : FiFileText;

  const nameLength = persona.name.length;
  let titleSizeClass = 'text-lg';
  if (nameLength > 30) titleSizeClass = 'text-xs';
  else if (nameLength > 20) titleSizeClass = 'text-sm';

  return (
    <div className={`relative flex flex-col h-full bg-white overflow-hidden ${!isEmbedded ? 'md:max-w-3xl md:mx-auto md:shadow-xl md:rounded-lg' : ''}`}>
       <header className="bg-blue-600 text-white h-14 flex items-center justify-between px-3 shadow-md md:rounded-t-lg z-10 flex-shrink-0">
        
        <div className="flex items-center flex-shrink-0">
          {!isEmbedded ? (
            <Link to="/chat" className="p-2 -ml-2 rounded-full hover:bg-blue-700 flex-shrink-0" title={t('chat.backToChats')} aria-label={t('chat.backToChats')}>
                <FiArrowLeft size={20} className="rtl-flip" />
            </Link>
          ) : onClose ? (
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-blue-700 flex-shrink-0" title={t('common.close')} aria-label={t('common.close')}>
                <FiArrowLeft size={20} className="rtl-flip" />
            </button>
          ) : <div className="w-8"></div>}
        </div>

        <div className="flex-1 flex items-center justify-center min-w-0 px-2">
            <h2 className={`font-semibold ${titleSizeClass} truncate text-center`} title={persona.name}>
                {persona.name}
            </h2>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-3 flex-shrink-0">
            <button onClick={handleInitiateNewChat} disabled={isChatLoading || isExtracting} className="p-2 rounded-full hover:bg-blue-700 disabled:opacity-50" title={t('chat.startNewSession')} aria-label={t('chat.startNewSession')}>
                <FiRefreshCw size={20} />
            </button>
        </div>
      </header>
      
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
        {combinedError && <div role="alert" className="p-3 bg-red-100 text-red-700 border-b flex items-center"><FiAlertCircle className="mr-2"/> {combinedError}</div>}
        {saveSuccessMessage && <div role="status" className="p-3 bg-green-100 text-green-700 border-b flex items-center"><FiCheckCircle className="mr-2"/> {saveSuccessMessage}</div>}
        
        <div className="flex-1 pt-4 px-6 pb-4 space-y-4" aria-live="polite" aria-label="Chat messages">
          {chatMessages.map((msg, index) => {
              if (isChatLoading && msg.sender === 'ai' && index === chatMessages.length - 1 && !msg.text) return null;
              const displayText = msg.text.replace('[[SHOW_SAVE_BUTTON]]', '').replace('SHOW_SAVE_BUTTON', '');
              const displayMsg = { ...msg, text: displayText };
              return (
                <ChatMessageBubble key={msg.id} message={displayMsg} isStreaming={isChatLoading && msg.sender === 'ai' && index === chatMessages.length - 1} />
              );
          })}
          <div ref={messagesEndRef} />
          {isChatLoading && chatMessages.length > 0 && chatMessages[chatMessages.length-1].sender === 'ai' && !chatMessages[chatMessages.length-1].text && (
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
        </div>
      </div>
        
      <div className="px-4 pt-3 pb-1 border-t bg-gray-50 flex-shrink-0">
         <div className="flex items-center space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
            onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !isChatLoading && handleSendMessage()}
            placeholder={t('chat.typeMessage')}
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={isChatLoading || isExtracting}
          />
          {speechSupported && (
            <button
              onClick={handleToggleVoice}
              disabled={isChatLoading || isExtracting}
              className={`p-3 rounded-lg w-12 h-12 flex items-center justify-center transition-colors disabled:bg-gray-400 disabled:text-white ${isListening ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}
              aria-label={isListening ? t('chat.stopListening', 'Stop listening') : t('chat.startListening', 'Speak a message')}
              aria-pressed={isListening}
            >
              {isListening ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
            disabled={!inputValue.trim() || isChatLoading || isExtracting}
            className="p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 w-12 h-12 flex items-center justify-center"
            aria-label={t('chat.sendMessage')}
          >
            {isChatLoading ? <FiLoader className="animate-spin" size={20} /> : <FiSend size={20} />}
          </button>
        </div>
        
        <AiDisclaimer />

        {shouldShowButton && (
            <button
                onClick={handleExtractAndSave}
                disabled={isChatLoading || isExtracting}
                className="mt-3 w-full p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg disabled:bg-gray-400 flex items-center justify-center font-semibold shadow-md transition-colors"
            >
                <ButtonIcon className={`mr-2 ${isExtracting ? 'animate-spin' : ''}`} />
                {buttonLabel}
            </button>
        )}
      </div>

      {showPrivacyConfirm && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
                    <div className="flex items-start mb-4">
                        <FiAlertCircle className="text-blue-500 h-8 w-8 mr-3 flex-shrink-0 mt-1"/>
                        <div>
                            <h3 className="text-xl font-semibold text-gray-800">{t('chat.saveInsightsTitle')}</h3>
                        </div>
                    </div>
                    <p className="text-gray-600 mb-6 text-sm">
                        {t('chat.saveInsightsDescription')}
                    </p>
                    <div className="flex justify-end space-x-3">
                        <button onClick={() => handleConfirmSave(true)} disabled={isExtracting} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center disabled:opacity-50">
                            {isExtracting ? <FiLoader className="animate-spin mr-2"/> : <FiEyeOff className="mr-2"/>}
                            {t('chat.hide')}
                        </button>
                        <button onClick={() => handleConfirmSave(false)} disabled={isExtracting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50">
                            {isExtracting ? <FiLoader className="animate-spin mr-2"/> : <FiEye className="mr-2"/>}
                            {t('chat.thatsOk')}
                        </button>
                    </div>
                </div>
            </div>,
            document.getElementById('modal-root')!
        )}
    </div>
  );
});

export default ChatInterfacePage;