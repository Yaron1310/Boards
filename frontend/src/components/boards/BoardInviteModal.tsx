import React, { useState } from 'react';
import { FiX, FiUserPlus, FiLoader, FiEdit2, FiLock, FiCheckCircle, FiAlertCircle, FiUsers, FiShield } from 'react-icons/fi';
import { useInviteUserToBoard, useBoardParticipants } from '../../hooks/queries/useBoardMemberQueries';
import { useAuthSession } from '../../hooks/useAuthSession';
import { UserRole } from '../../types';
import UserPermissionsModal from '../admin/UserPermissionsModal';

interface Props {
  boardId: string;
  workspaceId: string;
  boardName?: string;
  onClose: () => void;
}

const BoardInviteModal: React.FC<Props> = ({ boardId, onClose }) => {
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<'edit' | 'read_only'>('edit');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<{ id: string; name: string } | null>(null);

  const { user: authUser } = useAuthSession();
  const isAdmin = authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN;

  const { mutateAsync: inviteUser, isPending } = useInviteUserToBoard(boardId);
  const { data: participants = [], isLoading: participantsLoading } = useBoardParticipants(boardId);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Invite user to board"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
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
                  <li key={p.id} className="flex items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() => setPermissionsUser({ id: p.id, name: p.name })}
                        className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex-shrink-0"
                        aria-label={`Manage board permissions for ${p.name}`}
                        title="Manage board permissions"
                      >
                        <FiShield size={13} aria-hidden="true" />
                      </button>
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

    {permissionsUser && (
      <UserPermissionsModal
        userId={permissionsUser.id}
        userName={permissionsUser.name}
        filterBoardId={boardId}
        canAssignAdmin={isAdmin}
        onClose={() => setPermissionsUser(null)}
      />
    )}
  </>
  );
};

export default BoardInviteModal;
