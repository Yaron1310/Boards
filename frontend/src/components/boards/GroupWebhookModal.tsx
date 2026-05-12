import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus, FiTrash2, FiCopy, FiCheck, FiLoader, FiAlertTriangle } from 'react-icons/fi';
import { BACKEND_API_URL } from '../../constants';
import { useGroupWebhook, useCreateGroupWebhook, useRevokeGroupWebhook } from '../../hooks/queries/useWebhookQueries';
import type { Webhook } from '../../types';

interface GroupWebhookModalProps {
  boardId: string;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

type CopiedField = 'url' | 'token' | null;

const GroupWebhookModal: React.FC<GroupWebhookModalProps> = ({ boardId, groupId, groupName, onClose }) => {
  const { data: existingWebhook, isLoading } = useGroupWebhook(boardId, groupId);
  const { mutateAsync: createWebhook, isPending: isCreating, error: createError } = useCreateGroupWebhook();
  const { mutateAsync: revokeWebhook, isPending: isRevoking } = useRevokeGroupWebhook();

  const [createdResult, setCreatedResult] = useState<(Webhook & { secret: string }) | null>(null);
  const [insertPosition, setInsertPosition] = useState<'top' | 'bottom'>('bottom');
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [originError, setOriginError] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState<CopiedField>(null);

  const originInputRef = useRef<HTMLInputElement>(null);

  const apiBase = BACKEND_API_URL || window.location.origin;
  const displayWebhook = createdResult ?? existingWebhook;
  const webhookUrl = displayWebhook ? `${apiBase}/api/webhook/${displayWebhook.id}` : '';

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyToClipboard = async (text: string, field: CopiedField) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // fallback not needed — modern browsers support clipboard API
    }
  };

  const validateOrigin = (value: string): boolean => {
    if (value === '*') return true;
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      return url.hostname.length > 0;
    } catch {
      return false;
    }
  };

  const handleAddOrigin = () => {
    const trimmed = newOrigin.trim();
    if (!trimmed) return;
    if (allowedOrigins.includes(trimmed)) {
      setOriginError('Already in the list.');
      return;
    }
    if (!validateOrigin(trimmed)) {
      setOriginError('Enter a valid origin (e.g. https://myapp.com) or * to allow all.');
      return;
    }
    setAllowedOrigins((prev) => [...prev, trimmed]);
    setNewOrigin('');
    setOriginError('');
  };

  const handleOriginKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddOrigin(); }
  };

  const handleCreate = async () => {
    if (allowedOrigins.length === 0) {
      setOriginError('Add at least one allowed origin (* for all) before creating.');
      originInputRef.current?.focus();
      return;
    }
    const result = await createWebhook({ boardId, groupId, data: { insertPosition, allowedOrigins } });
    setCreatedResult(result as Webhook & { secret: string });
  };

  const handleRevoke = async () => {
    await revokeWebhook({ boardId, groupId });
    setCreatedResult(null);
    setRevokeConfirm(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="webhook-modal-title" className="text-base font-semibold text-gray-800">
            Webhook — {groupName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close webhook modal"
          >
            <FiX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <FiLoader className="animate-spin text-gray-400" size={22} aria-label="Loading webhook" />
            </div>
          ) : displayWebhook ? (
            /* ── Existing or just-created webhook ── */
            <div className="space-y-4">
              {/* One-time secret banner */}
              {createdResult && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <FiAlertTriangle size={12} aria-hidden="true" />
                    Save your token now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1 break-all select-all text-gray-700">
                      {createdResult.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(createdResult.secret, 'token')}
                      className="flex-shrink-0 text-amber-600 hover:text-amber-800 transition-colors"
                      aria-label="Copy token"
                    >
                      {copied === 'token' ? <FiCheck size={15} aria-hidden="true" /> : <FiCopy size={15} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Endpoint URL */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Endpoint URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 break-all select-all text-gray-700">
                    POST {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(webhookUrl, 'url')}
                    className="flex-shrink-0 text-gray-500 hover:text-gray-800 transition-colors"
                    aria-label="Copy endpoint URL"
                  >
                    {copied === 'url' ? <FiCheck size={15} aria-hidden="true" /> : <FiCopy size={15} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* Auth hint */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">How to call this webhook:</p>
                <code className="block whitespace-pre-wrap text-gray-600">
                  {`POST ${webhookUrl}\nAuthorization: Bearer <your-token>\nContent-Type: application/json\n\n{ "name": "Item name", "values": {} }`}
                </code>
              </div>

              {/* Config summary */}
              <div className="text-xs text-gray-500 space-y-1">
                <p><span className="font-medium text-gray-600">Insert position:</span> {displayWebhook.insertPosition === 'top' ? 'Top of group' : 'Bottom of group'}</p>
                <p><span className="font-medium text-gray-600">Allowed origins:</span> {displayWebhook.allowedOrigins.join(', ') || '—'}</p>
                <p><span className="font-medium text-gray-600">Uses:</span> {displayWebhook.useCount}</p>
              </div>

              {/* Revoke */}
              <div className="pt-1">
                {revokeConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-600">Revoke this webhook? All callers using it will stop working.</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRevoke()}
                        disabled={isRevoking}
                        className="flex-1 px-3 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                        aria-label="Confirm revoke webhook"
                      >
                        {isRevoking ? 'Revoking…' : 'Revoke webhook'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevokeConfirm(false)}
                        className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        aria-label="Cancel revoke"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevokeConfirm(true)}
                    className="w-full px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    aria-label="Revoke webhook"
                  >
                    Revoke webhook
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Create form ── */
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Create a webhook to allow external services to add items to this group via HTTP.
              </p>

              {/* Insert position */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600" id="insert-position-label">New items insert at</p>
                <div className="flex gap-3" role="radiogroup" aria-labelledby="insert-position-label">
                  {(['bottom', 'top'] as const).map((pos) => (
                    <label
                      key={pos}
                      className="flex items-center gap-2 cursor-pointer"
                      aria-label={`Insert at ${pos}`}
                    >
                      <input
                        type="radio"
                        name="insertPosition"
                        value={pos}
                        checked={insertPosition === pos}
                        onChange={() => setInsertPosition(pos)}
                        className="accent-blue-600"
                        aria-checked={insertPosition === pos}
                      />
                      <span className="text-sm text-gray-700 capitalize">{pos} of group</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Allowed origins */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600" id="origins-label">
                  Allowed origins
                </p>
                <p className="text-xs text-gray-400">
                  Only requests from these origins are accepted. Use <code className="bg-gray-100 px-1 rounded">*</code> to allow all (including server-to-server calls).
                </p>
                {allowedOrigins.length > 0 && (
                  <ul className="space-y-1" aria-label="Allowed origins list">
                    {allowedOrigins.map((origin) => (
                      <li key={origin} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-1">
                        <code className="text-xs text-gray-700">{origin}</code>
                        <button
                          type="button"
                          onClick={() => setAllowedOrigins((prev) => prev.filter((o) => o !== origin))}
                          className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                          aria-label={`Remove origin ${origin}`}
                        >
                          <FiTrash2 size={12} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    ref={originInputRef}
                    type="text"
                    value={newOrigin}
                    onChange={(e) => { setNewOrigin(e.target.value); setOriginError(''); }}
                    onKeyDown={handleOriginKeyDown}
                    placeholder="https://myapp.com or *"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="New allowed origin"
                    aria-describedby={originError ? 'origin-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={handleAddOrigin}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    aria-label="Add origin"
                  >
                    <FiPlus size={14} aria-hidden="true" />
                    Add
                  </button>
                </div>
                {originError && (
                  <p id="origin-error" role="alert" className="text-xs text-red-500">{originError}</p>
                )}
              </div>

              {/* Create error */}
              {createError && (
                <p role="alert" className="text-xs text-red-500">{(createError as Error).message}</p>
              )}

              {/* Create button */}
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={isCreating}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                aria-label="Create webhook"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <FiLoader className="animate-spin" size={14} aria-hidden="true" />
                    Creating…
                  </span>
                ) : 'Create webhook'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupWebhookModal;
