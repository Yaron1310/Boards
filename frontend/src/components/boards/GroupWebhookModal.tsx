import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FiX, FiPlus, FiTrash2, FiCopy, FiCheck, FiLoader, FiAlertTriangle, FiSave } from 'react-icons/fi';
import { BACKEND_API_URL } from '../../constants';
import {
  useGroupWebhook,
  useCreateGroupWebhook,
  useUpdateGroupWebhook,
  useRevokeGroupWebhook,
} from '../../hooks/queries/useWebhookQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import type { Webhook } from '../../types';
import type { WebhookFieldMappingInput } from '../../services/workManagementService';

interface GroupWebhookModalProps {
  boardId: string;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

type CopiedKey = string | null;

/** Convert the webhook's fieldMap into a map of columnId → position string (for inputs). */
function fieldMapToState(
  fieldMap: Array<{ position: number; columnId: string }>,
  nameFieldPosition: number | null,
): { colPositions: Record<string, string>; namePos: string } {
  const colPositions: Record<string, string> = {};
  for (const { columnId, position } of fieldMap) {
    colPositions[columnId] = String(position);
  }
  return { colPositions, namePos: nameFieldPosition != null ? String(nameFieldPosition) : '' };
}

/** Build the payload arrays from UI state. */
function stateToFieldMap(
  colPositions: Record<string, string>,
): WebhookFieldMappingInput[] {
  return Object.entries(colPositions)
    .map(([columnId, pos]) => ({ columnId, position: parseInt(pos, 10) }))
    .filter(({ position }) => Number.isFinite(position) && position >= 1);
}

const GroupWebhookModal: React.FC<GroupWebhookModalProps> = ({ boardId, groupId, groupName, onClose }) => {
  const { data: existingWebhook, isLoading } = useGroupWebhook(boardId, groupId);
  const { mutateAsync: createWebhook, isPending: isCreating, error: createError } = useCreateGroupWebhook();
  const { mutateAsync: updateWebhook, isPending: isSaving } = useUpdateGroupWebhook();
  const { mutateAsync: revokeWebhook, isPending: isRevoking } = useRevokeGroupWebhook();
  const { data: columns = [] } = useColumns(boardId);

  const [createdResult, setCreatedResult] = useState<(Webhook & { secret: string }) | null>(null);

  // --- Create-form state ---
  const [insertPosition, setInsertPosition] = useState<'top' | 'bottom'>('bottom');
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [originError, setOriginError] = useState('');

  // --- Field mapping state (shared between create form and existing-webhook editor) ---
  const [namePos, setNamePos] = useState('');
  const [colPositions, setColPositions] = useState<Record<string, string>>({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);

  // --- Other UI state ---
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState<CopiedKey>(null);

  const originInputRef = useRef<HTMLInputElement>(null);
  const apiBase = BACKEND_API_URL || window.location.origin;
  const displayWebhook = createdResult ?? existingWebhook;
  const webhookUrl = displayWebhook ? `${apiBase}/api/webhook/${displayWebhook.id}` : '';
  const webhookUrlWithToken = createdResult ? `${webhookUrl}?token=${createdResult.secret}` : '';

  // Populate mapping state when an existing webhook loads
  useEffect(() => {
    const wh = createdResult ?? existingWebhook;
    if (wh) {
      const { colPositions: cp, namePos: np } = fieldMapToState(wh.fieldMap ?? [], wh.nameFieldPosition ?? null);
      setColPositions(cp);
      setNamePos(np);
      setMappingDirty(false);
    }
  }, [existingWebhook, createdResult]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* clipboard available in all target environments */ }
  }, []);

  const validateOrigin = (value: string) => {
    if (value === '*') return true;
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`);
      return url.hostname.length > 0;
    } catch { return false; }
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

  const handleCreate = async () => {
    if (allowedOrigins.length === 0) {
      setOriginError('Add at least one allowed origin (* for all) before creating.');
      originInputRef.current?.focus();
      return;
    }
    const fieldMap = stateToFieldMap(colPositions);
    const nameFieldPosition = namePos && !isNaN(parseInt(namePos, 10)) && parseInt(namePos, 10) >= 1
      ? parseInt(namePos, 10)
      : null;
    const result = await createWebhook({
      boardId,
      groupId,
      data: { insertPosition, allowedOrigins, fieldMap, nameFieldPosition },
    });
    setCreatedResult(result as Webhook & { secret: string });
  };

  const handleSaveMapping = async () => {
    const fieldMap = stateToFieldMap(colPositions);
    const nameFieldPosition = namePos && !isNaN(parseInt(namePos, 10)) && parseInt(namePos, 10) >= 1
      ? parseInt(namePos, 10)
      : null;
    await updateWebhook({ boardId, groupId, data: { fieldMap, nameFieldPosition } });
    setMappingDirty(false);
    setMappingSaved(true);
    setTimeout(() => setMappingSaved(false), 2000);
  };

  const handleRevoke = async () => {
    await revokeWebhook({ boardId, groupId });
    setCreatedResult(null);
    setRevokeConfirm(false);
  };

  const setColPos = (columnId: string, value: string) => {
    setColPositions((prev) => ({ ...prev, [columnId]: value }));
    setMappingDirty(true);
    setMappingSaved(false);
  };

  const setNamePosField = (value: string) => {
    setNamePos(value);
    setMappingDirty(true);
    setMappingSaved(false);
  };

  // Detect duplicate positions for UI warning
  const allPositions: number[] = [];
  if (namePos && !isNaN(parseInt(namePos, 10))) allPositions.push(parseInt(namePos, 10));
  for (const p of Object.values(colPositions)) {
    if (p && !isNaN(parseInt(p, 10))) allPositions.push(parseInt(p, 10));
  }
  const positionCounts = allPositions.reduce<Record<number, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
  const hasDuplicates = Object.values(positionCounts).some((c) => c > 1);

  const CopyBtn = ({ text, id, label }: { text: string; id: string; label: string }) => (
    <button
      type="button"
      onClick={() => void copyToClipboard(text, id)}
      className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
      aria-label={label}
    >
      {copied === id
        ? <FiCheck size={13} className="text-green-500" aria-hidden="true" />
        : <FiCopy size={13} aria-hidden="true" />}
    </button>
  );

  /** Shared field-mapping table rendered in both create and existing-webhook views */
  const FieldMappingTable = ({ isExisting }: { isExisting: boolean }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-600" id="field-map-label">
          Field position mapping
        </p>
        {isExisting && (
          <button
            type="button"
            onClick={() => void handleSaveMapping()}
            disabled={isSaving || !mappingDirty}
            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            aria-label="Save field mapping"
          >
            {isSaving
              ? <FiLoader size={11} className="animate-spin" aria-hidden="true" />
              : mappingSaved
              ? <FiCheck size={11} aria-hidden="true" />
              : <FiSave size={11} aria-hidden="true" />}
            {isSaving ? 'Saving…' : mappingSaved ? 'Saved' : 'Save mapping'}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Enter the field position (1 = first field Elementor sends, 2 = second, …) for each column.
        Leave blank to skip. The <strong>item name</strong> position is required when using this mapping.
      </p>

      {hasDuplicates && (
        <p role="alert" className="text-xs text-amber-600 flex items-center gap-1">
          <FiAlertTriangle size={11} aria-hidden="true" />
          Duplicate field positions — each position should map to one target only.
        </p>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden" role="table" aria-label="Field mapping">
        {/* Header */}
        <div className="flex bg-gray-50 border-b border-gray-200 px-3 py-1.5" role="row">
          <span className="flex-1 text-xs font-medium text-gray-500 uppercase tracking-wide" role="columnheader">Column / Target</span>
          <span className="w-24 text-xs font-medium text-gray-500 uppercase tracking-wide text-right" role="columnheader">Field #</span>
        </div>

        {/* Item name row */}
        <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-blue-50/40" role="row">
          <span className="flex-1 text-xs font-semibold text-blue-700" role="cell">
            📝 Item name <span className="font-normal text-blue-500">(required)</span>
          </span>
          <div className="w-24 flex justify-end" role="cell">
            <input
              type="number"
              min={1}
              max={100}
              value={namePos}
              onChange={(e) => setNamePosField(e.target.value)}
              placeholder="—"
              className="w-16 text-xs text-right border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Field position for item name"
            />
          </div>
        </div>

        {/* Column rows */}
        {columns.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400 text-center" role="row">
            No columns on this board yet.
          </div>
        ) : (
          columns.map((col) => (
            <div key={col.id} className="flex items-center px-3 py-2 border-b border-gray-100 last:border-0" role="row">
              <span className="flex-1 text-xs text-gray-700 truncate pr-2" role="cell" title={col.name}>
                {col.name}
              </span>
              <div className="w-24 flex justify-end" role="cell">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={colPositions[col.id] ?? ''}
                  onChange={(e) => setColPos(col.id, e.target.value)}
                  placeholder="—"
                  className="w-16 text-xs text-right border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Field position for column ${col.name}`}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webhook-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[92vh] flex flex-col overflow-hidden">
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
            /* ── Existing / just-created webhook ── */
            <div className="space-y-5">
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
                    <CopyBtn text={createdResult.secret} id="token" label="Copy token" />
                  </div>
                </div>
              )}

              {/* Endpoint */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Endpoint</p>

                {/* URL with token (Elementor / no-header) */}
                <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-blue-700">Elementor / no-header tools — URL with token</p>
                  {createdResult ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-blue-800 bg-white border border-blue-200 rounded px-2 py-1.5 break-all select-all">
                        {webhookUrlWithToken}
                      </code>
                      <CopyBtn text={webhookUrlWithToken} id="url-token" label="Copy URL with token" />
                    </div>
                  ) : (
                    <p className="text-xs text-blue-400 italic">
                      URL with token was only shown at creation time. Revoke and recreate to get a new one.
                    </p>
                  )}
                </div>

                {/* Plain URL + header (API / Zapier) */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-600">API / Zapier / code — Authorization header</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 break-all select-all text-gray-700">
                      POST {webhookUrl}
                    </code>
                    <CopyBtn text={webhookUrl} id="url" label="Copy URL" />
                  </div>
                  <code className="block text-xs text-gray-500 mt-1">
                    Authorization: Bearer &lt;your-token&gt;
                  </code>
                </div>
              </div>

              {/* Field mapping — editable */}
              <FieldMappingTable isExisting />

              {/* Config summary */}
              <div className="text-xs text-gray-500 space-y-0.5">
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
                  Use <code className="bg-gray-100 px-1 rounded">*</code> to allow all callers (required for Elementor / server-to-server).
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddOrigin(); } }}
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

              {/* Field mapping — set up before creation */}
              <FieldMappingTable isExisting={false} />

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
