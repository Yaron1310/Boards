import React, { useState } from 'react';
import { FiX, FiUserPlus, FiLoader, FiEdit2, FiLock, FiCheckCircle, FiAlertCircle, FiUsers, FiShield, FiTrash2, FiEye, FiSend, FiClock } from 'react-icons/fi';
import {
  useInviteUserToBoard, useBoardParticipants, useRemoveBoardMember,
  useBoardViewInvites, useCreateBoardViewInvite, useRevokeBoardViewInvite,
} from '../../hooks/queries/useBoardMemberQueries';
import { useAuthSession } from '../../hooks/useAuthSession';
import { UserRole } from '../../types';
import UserPermissionsModal from '../admin/UserPermissionsModal';
import type { BoardParticipant } from '../../services/workManagementService';

interface Props {
  boardId: string;
  workspaceId: string;
  boardName?: string;
  onClose: () => void;
}

const ADMIN_ROLES = new Set([UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN, UserRole.WORKSPACE_ADMIN]);

const BoardInviteModal: React.FC<Props> = ({ boardId, onClose }) => {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<'edit' | 'read_only'>('edit');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<BoardParticipant | null>(null);
  const [adminBlockUser, setAdminBlockUser] = useState<BoardParticipant | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [viewEmailInput, setViewEmailInput] = useState('');
  const [viewEmails, setViewEmails] = useState<string[]>([]);
  const [viewFeedback, setViewFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  const { user: authUser } = useAuthSession();
  const isAdmin = authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN;

  const { mutateAsync: inviteUser, isPending } = useInviteUserToBoard(boardId);
  const { data: participants = [], isLoading: participantsLoading } = useBoardParticipants(boardId);
  const { mutateAsync: removeMember } = useRemoveBoardMember(boardId);

  const { data: viewInvites = [], isLoading: viewInvitesLoading } = useBoardViewInvites(boardId);
  const { mutateAsync: createViewInvite, isPending: isSendingViewInvites } = useCreateBoardViewInvite(boardId);
  const { mutateAsync: revokeViewInvite } = useRevokeBoardViewInvite(boardId);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setFeedback({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setFeedback(null);
    try {
      const result = await inviteUser({ email: trimmed, permissions });
      setFeedback({ type: 'success', text: result.message });
      setEmail('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to invite user.';
      setFeedback({ type: 'error', text: msg });
    }
  };

  const handleRemove = async (p: BoardParticipant) => {
    setRemovingId(p.id);
    try {
      await removeMember(p.id);
    } catch {
      setFeedback({ type: 'error', text: `Failed to remove ${p.name}.` });
    } finally {
      setRemovingId(null);
    }
  };

  const handlePermissionsClick = (p: BoardParticipant) => {
    if (p.role && ADMIN_ROLES.has(p.role as UserRole)) {
      setAdminBlockUser(p);
    } else {
      setPermissionsUser(p);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  const addViewEmail = () => {
    const trimmed = viewEmailInput.trim().replace(/,$/, '');
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      setViewFeedback({ type: 'error', text: `"${trimmed}" is not a valid email address.` });
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (!viewEmails.includes(normalized)) {
      setViewEmails((prev) => [...prev, normalized]);
    }
    setViewEmailInput('');
  };

  const handleViewEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addViewEmail();
    } else if (e.key === 'Backspace' && !viewEmailInput && viewEmails.length > 0) {
      setViewEmails((prev) => prev.slice(0, -1));
    }
  };

  const removeViewEmail = (emailToRemove: string) => {
    setViewEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const handleSendViewInvites = async () => {
    addViewEmail(); // pick up whatever's still sitting in the input, unconfirmed
    const emails = viewEmailInput.trim() && viewEmailInput.includes('@')
      ? [...viewEmails, viewEmailInput.trim().toLowerCase()]
      : viewEmails;
    if (emails.length === 0) {
      setViewFeedback({ type: 'error', text: 'Add at least one email address.' });
      return;
    }
    setViewFeedback(null);
    try {
      const results = await Promise.allSettled(emails.map((e) => createViewInvite(e)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed === 0) {
        setViewFeedback({ type: 'success', text: `View-only link sent to ${emails.length} ${emails.length === 1 ? 'person' : 'people'}.` });
        setViewEmails([]);
        setViewEmailInput('');
      } else {
        setViewFeedback({ type: 'error', text: `${failed} of ${emails.length} invitations failed to send.` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send view invitations.';
      setViewFeedback({ type: 'error', text: msg });
    }
  };

  const handleRevokeViewInvite = async (inviteId: string) => {
    setRevokingInviteId(inviteId);
    try {
      await revokeViewInvite(inviteId);
    } catch {
      setViewFeedback({ type: 'error', text: 'Failed to revoke link.' });
    } finally {
      setRevokingInviteId(null);
    }
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Invite user to board"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Invite to board</h2>
            <p className="text-xs text-gray-500 mt-0.5">Invited users will only see this specific board</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <FiX size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-md flex items-center text-xs ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}
            >
              {feedback.type === 'success'
                ? <FiCheckCircle className="mr-2 shrink-0" size={13} aria-hidden="true" />
                : <FiAlertCircle className="mr-2 shrink-0" size={13} aria-hidden="true" />}
              {feedback.text}
              <button onClick={() => setFeedback(null)} className="ml-auto font-semibold" aria-label="Dismiss">&times;</button>
            </div>
          )}

          {/* View-only public share link, gated per invited email */}
          <div className="border border-gray-200 rounded-lg p-3.5 bg-gray-50/60">
            <div className="flex items-center gap-1.5 mb-1">
              <FiEye size={13} className="text-gray-500" aria-hidden="true" />
              <span className="text-xs font-medium text-gray-700">Share a view-only link</span>
            </div>
            <p className="text-[11px] text-gray-500 mb-3 leading-snug">
              Send a personal, read-only link to specific people — no account or login required.
              Each link only works for the email it was sent to, and expires automatically after <strong>7 days</strong>.
            </p>

            {viewFeedback && (
              <div
                role={viewFeedback.type === 'error' ? 'alert' : 'status'}
                className={`p-2.5 rounded-md flex items-center text-xs mb-3 ${viewFeedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}
              >
                {viewFeedback.type === 'success'
                  ? <FiCheckCircle className="mr-2 shrink-0" size={13} aria-hidden="true" />
                  : <FiAlertCircle className="mr-2 shrink-0" size={13} aria-hidden="true" />}
                {viewFeedback.text}
                <button onClick={() => setViewFeedback(null)} className="ml-auto font-semibold" aria-label="Dismiss">&times;</button>
              </div>
            )}

            <label htmlFor="board-view-invite-email" className="block text-xs font-medium text-gray-700 mb-1">
              Recipient email addresses
            </label>
            <div className="flex flex-wrap items-center gap-1.5 w-full px-2.5 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 bg-white">
              {viewEmails.map((e) => (
                <span key={e} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium pl-2 pr-1 py-1 rounded-md">
                  {e}
                  <button
                    type="button"
                    onClick={() => removeViewEmail(e)}
                    className="p-0.5 hover:bg-indigo-100 rounded"
                    aria-label={`Remove ${e}`}
                  >
                    <FiX size={11} aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                id="board-view-invite-email"
                type="email"
                value={viewEmailInput}
                onChange={(e) => setViewEmailInput(e.target.value)}
                onKeyDown={handleViewEmailKeyDown}
                onBlur={addViewEmail}
                placeholder={viewEmails.length === 0 ? 'email1@example.com, email2@example.com' : 'Add another…'}
                className="flex-1 min-w-[140px] text-sm outline-none py-0.5"
                aria-label="Add recipient email address for view-only link"
                disabled={isSendingViewInvites}
              />
            </div>

            <div className="flex justify-end mt-2.5">
              <button
                type="button"
                onClick={() => void handleSendViewInvites()}
                disabled={isSendingViewInvites || (viewEmails.length === 0 && !viewEmailInput.trim())}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                aria-label="Send view-only link"
              >
                {isSendingViewInvites
                  ? <FiLoader size={11} className="animate-spin" aria-hidden="true" />
                  : <FiSend size={11} aria-hidden="true" />}
                {isSendingViewInvites ? 'Sending…' : 'Send view-only link'}
              </button>
            </div>

            {/* Existing view invites */}
            {viewInvitesLoading ? (
              <div className="flex items-center gap-2 py-2 mt-2 text-xs text-gray-400">
                <FiLoader size={12} className="animate-spin" aria-hidden="true" /> Loading invitations…
              </div>
            ) : viewInvites.length > 0 && (
              <ul className="space-y-1 mt-3 pt-3 border-t border-gray-200" aria-label="Sent view-only invitations">
                {viewInvites.map((invite) => {
                  const isRevoked = !!invite.revokedAt;
                  const isExpired = !isRevoked && new Date(invite.expiresAt).getTime() < Date.now();
                  return (
                    <li key={invite.id} className="flex items-center gap-2 text-xs group">
                      <FiClock size={11} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate text-gray-700 flex-1">{invite.email}</span>
                      <span className={`text-[10px] ${isRevoked || isExpired ? 'text-gray-400' : 'text-green-600'}`}>
                        {isRevoked ? 'Revoked' : isExpired ? 'Expired' : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                      </span>
                      {!isRevoked && !isExpired && (
                        <button
                          type="button"
                          onClick={() => void handleRevokeViewInvite(invite.id)}
                          disabled={revokingInviteId === invite.id}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 disabled:opacity-40"
                          aria-label={`Revoke view-only link for ${invite.email}`}
                          title="Revoke link"
                        >
                          {revokingInviteId === invite.id
                            ? <FiLoader size={12} className="animate-spin" aria-hidden="true" />
                            : <FiTrash2 size={12} aria-hidden="true" />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Current board members */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FiUsers size={13} className="text-gray-500" aria-hidden="true" />
              <span className="text-xs font-medium text-gray-700">
                Board members ({participantsLoading ? '…' : participants.length})
              </span>
            </div>
            {participantsLoading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                <FiLoader size={12} className="animate-spin" aria-hidden="true" /> Loading members…
              </div>
            ) : participants.length === 0 ? (
              <p className="text-xs text-gray-400 py-1">No members yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto" aria-label="Current board members">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 group">
                    {p.profileImageUrl ? (
                      <img
                        src={p.profileImageUrl}
                        alt={p.name}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        aria-hidden="true"
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.email}</p>
                    </div>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePermissionsClick(p)}
                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
                          aria-label={`Manage board permissions for ${p.name}`}
                          title="Manage permissions"
                        >
                          <FiShield size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(p)}
                          disabled={removingId === p.id}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0 disabled:opacity-40"
                          aria-label={`Remove ${p.name} from board`}
                          title="Remove from board"
                        >
                          {removingId === p.id
                            ? <FiLoader size={13} className="animate-spin" aria-hidden="true" />
                            : <FiTrash2 size={13} aria-hidden="true" />}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            {/* Email */}
            <div className="mb-3">
              <label htmlFor="board-invite-email" className="block text-xs font-medium text-gray-700 mb-1">
                Invite by email address
              </label>
              <input
                id="board-invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="user@example.com"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Email address to invite"
                autoFocus
                disabled={isPending}
              />
            </div>

            {/* Permissions */}
            <fieldset>
              <legend className="text-xs font-medium text-gray-700 mb-2">Permissions</legend>
              <div className="flex gap-3">
                {(['edit', 'read_only'] as const).map((p) => (
                  <label
                    key={p}
                    className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${permissions === p ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <input
                      type="radio"
                      name="board-invite-perm"
                      value={p}
                      checked={permissions === p}
                      onChange={() => setPermissions(p)}
                      className="accent-indigo-600"
                      aria-label={p === 'edit' ? 'Edit' : 'Read only'}
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-gray-800">
                      {p === 'edit' ? <FiEdit2 size={12} aria-hidden="true" /> : <FiLock size={12} aria-hidden="true" />}
                      {p === 'edit' ? 'Edit' : 'Read only'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            disabled={isPending}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isPending || !email.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Invite user to board"
          >
            {isPending
              ? <FiLoader size={11} className="animate-spin" aria-hidden="true" />
              : <FiUserPlus size={11} aria-hidden="true" />}
            {isPending ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </div>
    </div>

    {/* Admin-blocked permissions notice */}
    {adminBlockUser && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="admin-block-title">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-indigo-50 rounded-full flex-shrink-0">
              <FiShield size={18} className="text-indigo-500" aria-hidden="true" />
            </div>
            <div>
              <h2 id="admin-block-title" className="text-sm font-semibold text-gray-800 mb-1">Cannot edit permissions</h2>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{adminBlockUser.name}</span> is{' '}
                {adminBlockUser.role === UserRole.ORGANIZATION_ADMIN || adminBlockUser.role === UserRole.SYSTEM_ADMIN
                  ? 'an Organization Admin'
                  : 'a Workhub Admin'}
                . You cannot edit their permissions on a specific board.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setAdminBlockUser(null)}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Permissions modal */}
    {permissionsUser && (
      <UserPermissionsModal
        userId={permissionsUser.id}
        userName={permissionsUser.name}
        profileImageUrl={permissionsUser.profileImageUrl}
        filterBoardId={boardId}
        canAssignAdmin={isAdmin}
        onClose={() => setPermissionsUser(null)}
      />
    )}
    </>
  );
};

export default BoardInviteModal;
