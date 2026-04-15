

import React, { createContext, useState, ReactNode, useCallback, useContext } from 'react';
import type { Message } from '../types';
import * as geminiService from '../services/geminiService';
import { useAuth } from '../hooks/useAuth';
import { loadFromLocalStorage } from './DataContext';
import { getIndexedItem, setIndexedItem, removeIndexedItem } from '../utils/indexedDB';
import { debugLog } from '../config';

interface ChatSessionContextType {
  isChatLoading: boolean; 
  chatError: string | null;
  sessions: Record<string, Message[]>;
  ensureSessionInitialized: (userId: string, sessionKey: string, initialMessage?: string) => Promise<void>;
  startNewChatSession: (userId: string, sessionKey: string, initialMessage?: string) => Promise<void>; 
  startEphemeralSession: (userId: string, sessionKey: string, initialMessage?: string, force?: boolean) => void;
  clearSession: (sessionKey: string) => Promise<void>; 
  sendMessageToAI: (
    messageText: string, 
    sessionKey: string,
    personaId: string, 
    onChunk?: (chunk: string) => void,
    isEphemeral?: boolean
  ) => Promise<void>;
  setChatError: (message: string | null) => void;
}

export const ChatSessionContext = createContext<ChatSessionContextType | undefined>(undefined);

export const ChatSessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [sessions, setSessions] = useState<Record<string, Message[]>>({});
  const [isChatLoading, setIsChatLoading] = useState(false); 
  const [chatError, setChatErrorState] = useState<string | null>(null);

  const setChatError = (message: string | null) => {
    setChatErrorState(message);
    if (message) {
        setTimeout(() => setChatErrorState(null), 5000); 
    }
  };

  const ensureSessionInitialized = useCallback(async (userId: string, sessionKey: string, initialMessage?: string) => {
    if (sessions[sessionKey]) return; // Already loaded in memory

    const storageKey = `chatMessages_${userId}_${sessionKey}`;
    
    // 1. Try load from IndexedDB
    let loaded = await getIndexedItem<Message[]>(storageKey);
    
    // 2. Fallback to localStorage (Migration)
    if (!loaded) {
        const legacyData = localStorage.getItem(storageKey);
        if (legacyData) {
            try {
                loaded = JSON.parse(legacyData);
                if (loaded && loaded.length > 0) {
                    // Migrate to IndexedDB
                    await setIndexedItem(storageKey, loaded);
                    // Optionally remove from localStorage to save space
                    localStorage.removeItem(storageKey);
                }
            } catch (e) {
                console.warn("Error migrating from localStorage:", e);
            }
        }
    }

    if (loaded && loaded.length > 0) {
         const parsedMessages = loaded.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
         setSessions(prev => ({ ...prev, [sessionKey]: parsedMessages }));
         return;
    }

    // 3. Initialize new session if storage is empty
    const msgs: Message[] = [];
    if (initialMessage) {
         msgs.push({
            id: `msg_${Date.now()}_ai_initial`,
            sender: 'ai',
            text: initialMessage,
            timestamp: new Date(),
         });
         // Save initial state to IndexedDB immediately
         await setIndexedItem(storageKey, msgs);
    }
    setSessions(prev => ({ ...prev, [sessionKey]: msgs }));
  }, [sessions]);

  const startNewChatSession = useCallback(async (userId: string, sessionKey: string, initialMessage?: string) => {
    setIsChatLoading(false);
    setChatError(null);
    
    const msgs: Message[] = [];
    if (initialMessage) {
        msgs.push({
          id: `msg_${Date.now()}_ai_initial`,
          sender: 'ai',
          text: initialMessage,
          timestamp: new Date(),
        });
    }
    
    setSessions(prev => ({ ...prev, [sessionKey]: msgs }));
    await setIndexedItem(`chatMessages_${userId}_${sessionKey}`, msgs);
  }, []);

  const startEphemeralSession = useCallback((userId: string, sessionKey: string, initialMessage?: string, force: boolean = false) => {
    setSessions(currentSessions => {
        // Check if the session already exists in memory and we are not forcing a reset.
        if (currentSessions[sessionKey] && !force) {
            return currentSessions;
        }

        setIsChatLoading(false);
        setChatError(null);
        
        const msgs: Message[] = [];
        if (initialMessage) {
            msgs.push({
              id: `msg_${Date.now()}_ai_initial`,
              sender: 'ai',
              text: initialMessage,
              timestamp: new Date(),
            });
        }
        
        const newSessionsState = { ...currentSessions, [sessionKey]: msgs };
        return newSessionsState;
    });
  }, []);
  
  const clearSession = useCallback(async (sessionKey: string) => {
    setSessions(prev => {
        const newSessions = { ...prev };
        delete newSessions[sessionKey];
        return newSessions;
    });
    if (user) {
        await removeIndexedItem(`chatMessages_${user.id}_${sessionKey}`);
    }
  }, [user]);


  const sendMessageToAI = async (
    messageText: string, 
    sessionKey: string,
    personaId: string,
    onChunk?: (chunk: string) => void,
    isEphemeral: boolean = false
  ) => {
    if (!user) {
      setChatError("User not logged in.");
      return;
    }

    setIsChatLoading(true); 
    setChatError(null);

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      sender: 'user',
      text: messageText,
      timestamp: new Date(),
    };

    const aiMessageId = `msg_${Date.now()}_ai`;
    const aiMessagePlaceholder: Message = {
      id: aiMessageId,
      sender: 'ai',
      text: '',
      timestamp: new Date(),
    };
    
    const historyForBackend = sessions[sessionKey] || [];


    // 1. Optimistically update UI with user message and empty AI placeholder
    setSessions(prev => {
        const currentMsgs = prev[sessionKey] || [];
        const newMsgs = [...currentMsgs, userMessage, aiMessagePlaceholder];
        if (!isEphemeral && user) {
          setIndexedItem(`chatMessages_${user.id}_${sessionKey}`, newMsgs);
        }
        const finalState = { ...prev, [sessionKey]: newMsgs };
        return finalState;
    });

    try {
      
      // *** CRITICAL FIX: Passing personaId (actual DB ID) to backend, NOT sessionKey ***
      await geminiService.streamMessageFromBackend(
        messageText,
        historyForBackend,
        personaId, 
        (chunkText) => { 
            setSessions(prev => {
                const sessionMsgs = [...(prev[sessionKey] || [])];
                const aiMsgIndex = sessionMsgs.findIndex(m => m.id === aiMessageId);
                if (aiMsgIndex !== -1) {
                    const currentText = sessionMsgs[aiMsgIndex].text;
                    const updatedText = currentText + chunkText;
                    sessionMsgs[aiMsgIndex] = { ...sessionMsgs[aiMsgIndex], text: updatedText };
                    return { ...prev, [sessionKey]: sessionMsgs };
                }
                return prev;
            });
            if (onChunk) onChunk(chunkText);
        },
        (errorMessage) => { 
            console.error("Stream Error Received:", errorMessage);
            setChatError(errorMessage);
            setSessions(prev => {
                const sessionMsgs = [...(prev[sessionKey] || [])];
                const aiMsgIndex = sessionMsgs.findIndex(m => m.id === aiMessageId);
                if (aiMsgIndex !== -1) {
                    sessionMsgs[aiMsgIndex] = { ...sessionMsgs[aiMsgIndex], text: errorMessage, isError: true };
                    return { ...prev, [sessionKey]: sessionMsgs };
                }
                return prev;
            });
        },
        () => { 
            setIsChatLoading(false);
            setSessions(prev => {
                if (!isEphemeral && user) {
                  const finalMsgs = prev[sessionKey] || [];
                  setIndexedItem(`chatMessages_${user.id}_${sessionKey}`, finalMsgs);
                }
                return prev;
            });
        }
      );
    } catch (e: any) { 
      console.error("Error in sendMessageToAI try/catch block:", e);
      if (e.message && e.message.includes('usage limit')) {
          setChatError("The AI Mentor is currently at capacity for your organization. Please contact your administrator.");
      } else {
          setChatError(e.message || "An unexpected error occurred.");
      }
      setIsChatLoading(false);
    }
  };

  return (
    <ChatSessionContext.Provider value={{
      isChatLoading,
      chatError,
      sessions,
      ensureSessionInitialized,
      startNewChatSession,
      startEphemeralSession,
      clearSession,
      sendMessageToAI,
      setChatError,
    }}>
      {children}
    </ChatSessionContext.Provider>
  );
};

export const useChatSession = () => {
  const context = useContext(ChatSessionContext);
  if (context === undefined) {
    throw new Error('useChatSession must be used within a ChatSessionProvider');
  }
  return context;
};
