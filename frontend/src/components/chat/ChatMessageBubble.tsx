
import React from 'react';
import type { Message } from '../../types';
import { FiUser, FiCpu, FiAlertTriangle } from 'react-icons/fi';

interface ChatMessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

const renderWithBold = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
};


const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, isStreaming }) => {
  const isUser = message.sender === 'user';
  const isErrorAiMessage = !isUser && message.isError;

  return (
    <div className={`flex items-end ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col space-y-1 text-sm max-w-xs md:max-w-md lg:max-w-lg mx-2 order-${isUser ? 2 : 1} items-${isUser ? 'end' : 'start'}`}>
        <div>
          <span
            className={`px-4 py-2 rounded-2xl inline-block shadow
                        ${isUser ? 'bg-blue-500 text-white rounded-br-none'
                                 : isErrorAiMessage ? 'bg-red-100 text-red-700 rounded-bl-none'
                                                    : 'bg-gray-200 text-gray-800 rounded-bl-none'}`}
            style={{ unicodeBidi: 'plaintext' }}
          >
            {isErrorAiMessage && <FiAlertTriangle className="inline mr-1 mb-0.5" />}
            {renderWithBold(message.text)}
            {isStreaming && !isErrorAiMessage && <span className="inline-block w-1 h-4 ml-1 bg-gray-600 animate-pulse"></span>}
          </span>
        </div>
         <span className="text-xs text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
      </div>
      <div className={`flex items-center justify-center h-8 w-8 rounded-full order-${isUser ? 1 : 2} ${isUser ? 'bg-blue-500 ml-2' : isErrorAiMessage ? 'bg-red-500 mr-2' : 'bg-gray-600 mr-2'} text-white flex-shrink-0`}>
        {isUser ? <FiUser size={16} /> : isErrorAiMessage ? <FiAlertTriangle size={16} /> : <FiCpu size={16} />}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
