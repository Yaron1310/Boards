import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ReactDOM from 'react-dom';
import type { Conversation, Message } from '../../types';
import { FiX, FiDownload, FiTrash2, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import ChatMessageBubble from '../chat/ChatMessageBubble';
import { getConversationMessagesFromBackend } from '../../services/geminiService';

interface ConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: Conversation | null;
  allHeaders: { key: string; label: string }[];
  deleteConversationMessages: (conversationId: string) => Promise<Conversation | null>;
  onUpdateConversation: (updatedConversation: Conversation) => void;
}

const ConversationModal: React.FC<ConversationModalProps> = ({ isOpen, onClose, conversation, allHeaders, deleteConversationMessages, onUpdateConversation }) => {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (conversationId: string, cursor?: string) => {
    setIsLoadingMessages(true);
    setLoadError(null);
    try {
      const result = await getConversationMessagesFromBackend(conversationId, { limit: 100, cursor: cursor || undefined });
      const loadedMessages = result.data.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
      setMessages(prev => cursor ? [...prev, ...loadedMessages] : loadedMessages);
      setHasMoreMessages(result.hasMore);
      setMessageCursor(result.cursor);
    } catch (error: unknown) {
      console.error('Error loading messages:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Load messages when conversation changes
  const conversationId = conversation?.id;
  const conversationMessageCount = conversation?.messageCount ?? 0;
  useEffect(() => {
    if (isOpen && conversationId && conversationMessageCount > 0) {
      setMessages([]);
      setMessageCursor(null);
      setHasMoreMessages(false);
      loadMessages(conversationId);
    } else {
      setMessages([]);
      setHasMoreMessages(false);
      setMessageCursor(null);
    }
  }, [isOpen, conversationId, conversationMessageCount, loadMessages]);

  // Use capture phase so this fires before the HistoryModal's bubble-phase Esc handler,
  // and stopImmediatePropagation prevents the HistoryModal from also closing.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen || !conversation) return null;

  const downloadTranscript = () => {
    let transcript = `Conversation Date: ${new Date(conversation.date).toLocaleString()}\n`;
    transcript += `User ID: ${conversation.userId}\n`;
    transcript += `Chat: ${conversation.personaName}\n\n`;

    if (conversation.extractedFactors && allHeaders.length > 0) {
      transcript += `Insights:\n`;
      allHeaders.forEach(header => {
        if (conversation.extractedFactors?.[header.key]) {
          transcript += `  ${header.label}: ${conversation.extractedFactors[header.key]}\n`;
        }
      });
      transcript += '\n';
    }

    transcript += "Messages:\n";
    messages.forEach(msg => {
      transcript += `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.sender === 'user' ? 'User' : 'AI'}: ${msg.text}\n`;
    });

    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conversation_${conversation.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteTranscript = async () => {
    if (!conversation) return;
    setIsDeleting(true);
    const updatedConversation = await deleteConversationMessages(conversation.id);
    setIsDeleting(false);
    if (updatedConversation) {
        setShowDeleteConfirm(false);
        setMessages([]);
        onUpdateConversation(updatedConversation);
    }
  };

  const handleLoadMore = () => {
    if (messageCursor && conversation) {
      loadMessages(conversation.id, messageCursor);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[60] transition-opacity duration-300">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-100 opacity-100">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800">{t('profile.conversationDetails')}</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-100"
                title={t('profile.deleteTranscript')}
                aria-label={t('profile.deleteTranscript')}
              >
                <FiTrash2 size={20} />
              </button>
              <button
                onClick={downloadTranscript}
                className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-100"
                title={t('profile.downloadTranscript')}
                aria-label={t('profile.downloadTranscript')}
                disabled={messages.length === 0}
              >
                <FiDownload size={20} />
              </button>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
                title={t('common.close')}
                aria-label={t('common.close')}
              >
                <FiX size={24} />
              </button>
            </div>
          </div>

          <div className="p-3 text-sm bg-gray-50 border-b">
              <p className="text-gray-700"><strong>{t('profile.date')}</strong> {new Date(conversation.date).toLocaleString()}</p>
              <p className="text-gray-700"><strong>{t('profile.chat')}</strong> {conversation.personaName}</p>
          </div>

          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex-1 p-6 flex items-center justify-center">
              <FiLoader className="animate-spin h-8 w-8 text-blue-500" aria-label="Loading messages" />
            </div>
          ) : loadError ? (
            <div className="flex-1 p-6 flex items-center justify-center text-center text-red-500">
              <p>{loadError}</p>
            </div>
          ) : messages.length > 0 ? (
            <div ref={scrollContainerRef} className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {messages.map(msg => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              {hasMoreMessages && (
                <div className="text-center pt-2">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoadingMessages}
                    className="text-blue-500 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
                    aria-label="Load more messages"
                  >
                    {isLoadingMessages ? (
                      <FiLoader className="animate-spin inline mr-1" />
                    ) : null}
                    {t('profile.loadMoreMessages')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 p-6 flex items-center justify-center text-center text-gray-500">
                <p>{t('profile.conversationHistoryDeleted')}</p>
            </div>
          )}

          <div className="p-4 border-t border-gray-200 text-right">
              <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                  {t('common.close')}
              </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                <div className="flex items-start mb-4">
                    <FiAlertTriangle className="text-red-500 h-8 w-8 mr-3 mt-1"/>
                    <div>
                        <h3 className="text-xl font-semibold text-gray-800">{t('profile.confirmDeletion')}</h3>
                        <p className="text-sm text-gray-500">{t('profile.confirmDeleteTranscript')}</p>
                    </div>
                </div>
                 <div className="bg-red-50 p-3 rounded-md mb-6">
                    <p className="text-sm text-red-700">
                       {t('profile.deleteTranscriptWarning')}
                    </p>
                </div>
                <div className="flex justify-end space-x-3">
                    <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300" disabled={isDeleting}>{t('common.cancel')}</button>
                    <button onClick={handleDeleteTranscript} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center disabled:opacity-50" disabled={isDeleting}>
                        {isDeleting ? <FiLoader className="animate-spin mr-2"/> : <FiTrash2 className="mr-2"/>}
                        {isDeleting ? t('profile.deleting') : t('profile.confirmDelete')}
                    </button>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root')!
      )}
    </>
  );
};

export default ConversationModal;