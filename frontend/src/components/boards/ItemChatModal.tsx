import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiX, FiSend, FiPaperclip, FiDownload, FiImage, FiFile, FiTrash2 } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import { useChatMessages, usePostChatMessage, useDeleteChatMessage } from '../../hooks/queries/useItemChatQueries';
import { useAuth } from '../../hooks/useAuth';
import { markChatSeen } from '../../services/geminiService';
import type { Item, ChatMessage, ChatAttachment } from '../../types';

// Stable colour palette — one colour per unique authorId
const AUTHOR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-orange-500',
  'bg-teal-500',
];

function authorColor(authorId: string, allIds: string[]): string {
  const idx = allIds.indexOf(authorId);
  return AUTHOR_COLORS[(idx < 0 ? 0 : idx) % AUTHOR_COLORS.length];
}

function formatTime(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return 'Today';
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isImage(attachment: ChatAttachment): boolean {
  return attachment.mimeType.startsWith('image/');
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getUnreadCount(userId: string, item: Item): number {
  const total = item.chatMessageCount ?? 0;
  const seen = item.chatSeenBy?.[userId] ?? 0;
  return Math.max(0, total - seen);
}

interface ItemChatModalProps {
  item: Item;
  onClose: () => void;
}

const ItemChatModal: React.FC<ItemChatModalProps> = ({ item, onClose }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useChatMessages(item.id);
  const { mutateAsync: postMessage, isPending: isSending } = usePostChatMessage(item.id);
  const { mutate: deleteMessage } = useDeleteChatMessage(item.id);

  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollDone = useRef(false);

  // Derive stable list of unique author IDs for colour mapping
  const authorIds = Array.from(new Set(messages.map((m) => m.authorId)));

  // Mark messages as seen; invalidate items cache so the badge clears immediately
  useEffect(() => {
    if (!user || !messages.length) return;
    void markChatSeen(item.id).then(() => {
      void qc.invalidateQueries({ queryKey: ['items'] });
    });
  }, [user, item.id, messages.length, qc]);

  // Defer scroll to next animation frame so the browser has finished layout before we read scrollHeight
  useEffect(() => {
    if (messages.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      if (!initialScrollDone.current) {
        container.scrollTop = container.scrollHeight;
        initialScrollDone.current = true;
      } else {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if ((!text.trim() && pendingFiles.length === 0) || isSending) return;
    const payload = { text: text.trim(), files: pendingFiles.length > 0 ? pendingFiles : undefined };
    setText('');
    setPendingFiles([]);
    await postMessage(payload);
  }, [text, pendingFiles, isSending, postMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    setPendingFiles((prev) => [...prev, ...chosen].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setPendingFiles((prev) => [...prev, ...dropped].slice(0, 5));
  };

  const removeFile = (idx: number) =>
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  // Group messages by date for date separators
  type MessageGroup = { date: string; messages: ChatMessage[] };
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const d = formatDate(msg.createdAt);
    if (!groups.length || groups[groups.length - 1].date !== d) {
      groups.push({ date: d, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[10200] w-full max-w-[26rem] bg-white shadow-2xl flex flex-col"
      role="region"
      aria-label={`Chat for ${item.name}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-indigo-600 text-white flex-shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{item.name}</span>
            <span className="text-xs text-indigo-200">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 flex-shrink-0 p-1.5 rounded-full hover:bg-indigo-500 transition-colors"
            aria-label="Close chat"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Messages area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
          {isLoading && (
            <div className="text-center text-sm text-gray-400 py-8">Loading messages…</div>
          )}
          {!isLoading && messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">
              No messages yet. Be the first to say something!
            </div>
          )}
          {groups.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">{group.date}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {group.messages.map((msg, i) => {
                const isMine = msg.authorId === user?.id;
                const color = authorColor(msg.authorId, authorIds);
                const prevMsg = i > 0 ? group.messages[i - 1] : null;
                const showAvatar = !prevMsg || prevMsg.authorId !== msg.authorId;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 mb-1 group/msg ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-7 h-7 flex-shrink-0 ${showAvatar ? 'visible' : 'invisible'}`}>
                      {msg.authorProfileImageUrl ? (
                        <img
                          src={msg.authorProfileImageUrl}
                          alt={msg.authorName}
                          className="w-7 h-7 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${color}`}
                          aria-label={msg.authorName}
                        >
                          {msg.authorName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      {showAvatar && !isMine && (
                        <span className="text-xs text-gray-500 ml-1">{msg.authorName}</span>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          isMine
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-white text-gray-800 shadow-sm rounded-bl-sm border border-gray-100'
                        }`}
                      >
                        {msg.text && <p>{msg.text}</p>}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className={`mt-1.5 space-y-1 ${msg.text ? 'pt-1.5 border-t border-white/20' : ''}`}>
                            {msg.attachments.map((att, ai) => (
                              <AttachmentPreview key={ai} attachment={att} isMine={isMine} />
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] text-gray-400 mx-1 ${isMine ? 'text-right' : 'text-left'}`}>
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    {/* Delete button — only for own messages, visible on hover */}
                    {isMine && (
                      <button
                        type="button"
                        onClick={() => deleteMessage(msg.id)}
                        className="flex-shrink-0 self-center p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                        aria-label="Delete message"
                      >
                        <FiTrash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-600/20 border-2 border-dashed border-indigo-500 rounded-2xl pointer-events-none">
            <span className="text-indigo-700 font-semibold text-sm">Drop files to attach</span>
          </div>
        )}

        {/* Pending file chips */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-gray-200 bg-white">
            {pendingFiles.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200"
              >
                {f.type.startsWith('image/') ? <FiImage size={11} aria-hidden="true" /> : <FiFile size={11} aria-hidden="true" />}
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-600"
                  aria-label={`Remove ${f.name}`}
                >
                  <FiX size={10} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2 px-3 py-2.5 border-t border-gray-200 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            aria-label="Attach file"
            disabled={pendingFiles.length >= 5}
          >
            <FiPaperclip size={18} aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            className="hidden"
            aria-hidden="true"
            onChange={handleFileChange}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent min-h-[38px] max-h-[100px] overflow-y-auto"
            style={{ lineHeight: '1.4' }}
            aria-label="Message input"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isSending || (!text.trim() && pendingFiles.length === 0)}
            className="flex-shrink-0 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <FiSend size={16} aria-hidden="true" />
          </button>
        </div>
    </div>
  );
};

interface AttachmentPreviewProps {
  attachment: ChatAttachment;
  isMine: boolean;
}

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({ attachment, isMine }) => {
  if (isImage(attachment)) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" aria-label={`View image ${attachment.name}`}>
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-w-[200px] max-h-[150px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      aria-label={`Download ${attachment.name}`}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
        isMine
          ? 'bg-white/20 hover:bg-white/30 text-white'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
      }`}
    >
      <FiFile size={14} aria-hidden="true" className="flex-shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate max-w-[140px]">{attachment.name}</span>
        <span className="opacity-70">{humanSize(attachment.size)}</span>
      </div>
      <FiDownload size={12} aria-hidden="true" className="flex-shrink-0 ml-1" />
    </a>
  );
};

export default ItemChatModal;
