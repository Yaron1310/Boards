import React, { useState, useRef, useEffect } from 'react';
import { FiX, FiPlus, FiTrash2, FiCopy, FiCheck, FiLoader, FiAlertTriangle, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { BACKEND_API_URL } from '../../constants';
import { useGroupWebhook, useCreateGroupWebhook, useRevokeGroupWebhook } from '../../hooks/queries/useWebhookQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import type { Webhook } from '../../types';

interface GroupWebhookModalProps {
  boardId: string;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

type CopiedField = 'url' | 'url-token' | 'token' | null;

const GroupWebhookModal: React.FC<GroupWebhookModalProps> = ({ boardId, groupId, groupName, onClose }) => {
  const { data: existingWebhook, isLoading } = useGroupWebhook(boardId, groupId);
  const { mutateAsync: createWebhook, isPending: isCreating, error: createError } = useCreateGroupWebhook();
  const { mutateAsync: revokeWebhook, isPending: isRevoking } = useRevokeGroupWebhook();
  const { data: columns = [] } = useColumns(boardId);

  const [createdResult, setCreatedResult] = useState<(Webhook & { secret: string }) | null>(null);
  const [insertPosition, setInsertPosition] = useState<'top' | 'bottom'>('bottom');
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [originError, setOriginError] = useState('');
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState<CopiedField>(null);
  const [columnsExpanded, setColumnsExpanded] = useState(false);

  const originInputRef = useRef<HTMLInputElement>(null);

  const apiBase = BACKEND_API_URL || window.location.origin;
  const displayWebhook = createdResult ?? existingWebhook;
  const webhookUrl = displayWebhook ? `${apiBase}/api/webhook/${displayWebhook.id}` : '';
  const webhookUrlWithToken = createdResult
    ? `${apiBase}/api/webhook/${displayWebhook!.id}?token=${createdResult.secret}`
    : '';

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
      // clipboard API supported in all modern browsers
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
    if (allowedOrigins.includes(trimmed)) { setOriginError('Already in the list.'); return; }
    if (!validateOrigin(trimmed)) { setOriginError('Enter a valid origin (e.g. https://myapp.com) or * to allow all.'); return; }
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

  const copyBtn = (text: string, field: CopiedField, label: string) => (
    <button
      type="button"
      onClick={() => void copyToClipboard(text, field)}
      className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
      aria-label={label}
    >
      {copied === field ? <FiCheck size={14} className="text-green-500" aria-hidden="true" /> : <FiCopy size={14} aria-hidden="true" />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 id="webhook-modal-title" className="text-base font-semibold text-gray-800">
            Webhook — {groupName}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close webhook modal">
            <FiX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <FiLoader className="animate-spin text-gray-400" size={22} aria-label="Loading webhook" />
            </div>
          ) : displayWebhook ? (
            /* ── Existing or just-created webhook ── */
            <div className="space-y-4">
              {/* One-time token banner */}
              {createdResult && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <FiAlertTriangle size={12} aria-hidden="true" />
                    Save your token now — it will not be shown again.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1 break-all select-all text-gray-700">
                      {createdResult.secret}
                    </code>
                    {copyBtn(createdResult.secret, 'token', 'Copy token')}
                  </div>
                </div>
              )}

              {/* Endpoint URL */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Endpoint</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2 break-all select-all text-gray-700">
                    POST {webhookUrl}
                  </code>
                  {copyBtn(webhookUrl, 'url', 'Copy endpoint URL')}
                </div>
              </div>

              {/* Integration guide */}
              <div className="space-y-3">
                {/* Option A — Authorization header */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-600">Option A — API / Zapier / code (recommended)</p>
                  <p className="text-xs text-gray-400 mb-1">Send the token as an HTTP header:</p>
                  <code className="block text-xs text-gray-600 whitespace-pre-wrap bg-white border border-gray-200 rounded px-2 py-2">{`POST ${webhookUrl}\nAuthorization: Bearer <your-token>\nContent-Type: application/json\n\n{"name": "Item name", "values": {"<colId>": "value"}}`}</code>
                </div>

                {/* Option B — URL token */}
                <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-700">Option B — Elementor / Gravity Forms / no-header tools</p>
                  <p className="text-xs text-blue-500 mb-1">Embed the token directly in the URL:</p>
                  {createdResult ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-blue-800 bg-white border border-blue-200 rounded px-2 py-2 break-all select-all">
                        {webhookUrlWithToken}
                      </code>
                      {copyBtn(webhookUrlWithToken, 'url-token', 'Copy URL with token')}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-400 italic">Webhook URL with token was only shown at creation time. Revoke and recreate to get a new one.</p>
                  )}
                  <p className="text-xs text-blue-400 mt-1">
                    Set your form field named <code className="bg-white px-1 rounded">name</code> as the item title. Other field IDs map to board columns.
                  </p>
                </div>
              </div>

              {/* Column reference */}
              {columns.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setColumnsExpanded((v) => !v)}
                    className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    aria-expanded={columnsExpanded}
                    aria-label="Toggle column reference"
                  >
                    <span className="text-xs font-medium text-gray-600">Column field IDs reference</span>
                    {columnsExpanded
                      ? <FiChevronDown size={13} className="text-gray-400" aria-hidden="true" />
                      : <FiChevronRight size={13} className="text-gray-400" aria-hidden="true" />}
                  </button>
                  {columnsExpanded && (
                    <div className="px-3 py-2 space-y-1" role="list" aria-label="Board columns">
                      <p className="text-xs text-gray-400 mb-2">
                        Use these IDs as keys in <code className="bg-gray-100 px-1 rounded">values{'{}'}</code> (JSON) or as form field names (Elementor).
                      </p>
                      {columns.map((col) => (
                        <div key={col.id} role="listitem" className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 last:border-0">
                          <span className="text-xs text-gray-700 font-medium truncate max-w-[40%]">{col.name}</span>
                          <div className="flex items-center gap-1 flex-1 justify-end">
                            <code className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 truncate max-w-[160px]">{col.id}</code>
                            <button
                              type="button"
                              onClick={() => void copyToClipboard(col.id, `col-${col.id}` as CopiedField)}
                              className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                              aria-label={`Copy column ID for ${col.name}`}
                            >
                              {copied === `col-${col.id}` ? <FiCheck size={12} className="text-green-500" aria-hidden="true" /> : <FiCopy size={12} aria-hidden="true" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Config summary */}
              <div className="text-xs text-gray-500 space-y-1">
                <p><span className="font-medium text-gray-600">Insert position:</span> {displayWebhook.insertPosition === 'top' ? 'Top of group' : 'Bottom of group'}</p>
                <p><span className="font-medium text-gray-600">Allowed origins:</span> {displayWebhook.allowedOrigins.join(', ') || '—'}</p>
                <p><span className="font-medium text-gray-600">Total uses:</span> {displayWebhook.useCount}</p>
              </div>

              {/* Revoke */}
              <div className="pt-1">
                {revokeConfirm ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-600">Revoke this webhook? All callers using it will stop working.</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void handleRevoke()} disabled={isRevoking}
                        className="flex-1 px-3 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                        aria-label="Confirm revoke webhook">
                        {isRevoking ? 'Revoking…' : 'Revoke webhook'}
                      </button>
                      <button type="button" onClick={() => setRevokeConfirm(false)}
                        className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        aria-label="Cancel revoke">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setRevokeConfirm(true)}
                    className="w-full px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    aria-label="Revoke webhook">
                    Revoke webhook
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Create form ── */
            <div className="space-y-5">
              <p className="text-sm text-gray-500">
                Create a webhook so external services (Elementor, Zapier, custom code) can add items to this group via HTTP POST.
              </p>

              {/* Insert position */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600" id="insert-position-label">New items insert at</p>
                <div className="flex gap-3" role="radiogroup" aria-labelledby="insert-position-label">
                  {(['bottom', 'top'] as const).map((pos) => (
                    <label key={pos} className="flex items-center gap-2 cursor-pointer" aria-label={`Insert at ${pos}`}>
                      <input type="radio" name="insertPosition" value={pos}
                        checked={insertPosition === pos} onChange={() => setInsertPosition(pos)}
                        className="accent-blue-600" aria-checked={insertPosition === pos} />
                      <span className="text-sm text-gray-700 capitalize">{pos} of group</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Allowed origins */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600" id="origins-label">Allowed origins</p>
                <p className="text-xs text-gray-400">
                  Controls which sources can call this webhook. Use <code className="bg-gray-100 px-1 rounded">*</code> to allow all callers (including Elementor, server-to-server, etc).
                </p>
                {allowedOrigins.length > 0 && (
                  <ul className="space-y-1" aria-label="Allowed origins list">
                    {allowedOrigins.map((origin) => (
                      <li key={origin} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded px-3 py-1">
                        <code className="text-xs text-gray-700">{origin}</code>
                        <button type="button" onClick={() => setAllowedOrigins((prev) => prev.filter((o) => o !== origin))}
                          className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                          aria-label={`Remove origin ${origin}`}>
                          <FiTrash2 size={12} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input ref={originInputRef} type="text" value={newOrigin}
                    onChange={(e) => { setNewOrigin(e.target.value); setOriginError(''); }}
                    onKeyDown={handleOriginKeyDown}
                    placeholder="https://myapp.com or *"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="New allowed origin"
                    aria-describedby={originError ? 'origin-error' : undefined} />
                  <button type="button" onClick={handleAddOrigin}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    aria-label="Add origin">
                    <FiPlus size={14} aria-hidden="true" />
                    Add
                  </button>
                </div>
                {originError && <p id="origin-error" role="alert" className="text-xs text-red-500">{originError}</p>}
              </div>

              {/* Column reference (collapsible) */}
              {columns.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setColumnsExpanded((v) => !v)}
                    className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    aria-expanded={columnsExpanded}
                    aria-label="Toggle column reference"
                  >
                    <span className="text-xs font-medium text-gray-600">Column field IDs (for mapping data)</span>
                    {columnsExpanded
                      ? <FiChevronDown size={13} className="text-gray-400" aria-hidden="true" />
                      : <FiChevronRight size={13} className="text-gray-400" aria-hidden="true" />}
                  </button>
                  {columnsExpanded && (
                    <div className="px-3 py-2 space-y-1" role="list" aria-label="Board columns">
                      <p className="text-xs text-gray-400 mb-2">
                        Use these IDs as Elementor field names, or as JSON keys in <code className="bg-gray-100 px-1 rounded">values{'{}'}</code>.
                      </p>
                      {columns.map((col) => (
                        <div key={col.id} role="listitem" className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 last:border-0">
                          <span className="text-xs text-gray-700 font-medium truncate max-w-[40%]">{col.name}</span>
                          <div className="flex items-center gap-1 flex-1 justify-end">
                            <code className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 truncate max-w-[160px]">{col.id}</code>
                            <button
                              type="button"
                              onClick={() => void copyToClipboard(col.id, `col-${col.id}` as CopiedField)}
                              className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                              aria-label={`Copy column ID for ${col.name}`}
                            >
                              {copied === `col-${col.id}` ? <FiCheck size={12} className="text-green-500" aria-hidden="true" /> : <FiCopy size={12} aria-hidden="true" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {createError && <p role="alert" className="text-xs text-red-500">{(createError as Error).message}</p>}

              <button type="button" onClick={() => void handleCreate()} disabled={isCreating}
                className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                aria-label="Create webhook">
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
