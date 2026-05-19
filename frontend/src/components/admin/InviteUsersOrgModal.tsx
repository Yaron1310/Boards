
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FiUserPlus, FiGrid, FiList, FiEdit2, FiLock, FiXCircle, FiLoader, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { useData } from '../../hooks/useData';
import { useAuthSession } from '../../hooks/useAuthSession';
import type { WorkHub } from '../../types';

interface InviteUsersOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: WorkHub[];
}

const InviteUsersOrgModal: React.FC<InviteUsersOrgModalProps> = ({ isOpen, onClose, workspaces }) => {
  const { inviteUsersToOrg } = useData();
  const { selectedWorkspace } = useAuthSession();

  const [email, setEmail] = useState('');
  const [scope, setScope] = useState<'all' | 'specific'>('all');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<'edit' | 'read_only'>('edit');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setEmail('');
    setScope('all');
    setSelectedWorkspaceIds([]);
    setPermissions('edit');
    setIsSubmitting(false);
    setFeedback(null);
  }, [isOpen]);

  const toggleWorkspace = (wsId: string) => {
    setSelectedWorkspaceIds(prev =>
      prev.includes(wsId) ? prev.filter(id => id !== wsId) : [...prev, wsId]
    );
  };

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setFeedback({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (scope === 'specific' && selectedWorkspaceIds.length === 0) {
      setFeedback({ type: 'error', text: 'Please select at least one workhub.' });
      return;
    }

    const orgId = selectedWorkspace?.orgId;
    if (!orgId) {
      setFeedback({ type: 'error', text: 'Could not determine organization. Please try again.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await inviteUsersToOrg(
        orgId,
        email.trim(),
        scope === 'all' ? 'all' : selectedWorkspaceIds,
        permissions
      );
      if (result) {
        setFeedback({ type: 'success', text: result.message });
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setFeedback({ type: 'error', text: 'Failed to invite user. Please try again.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  const isSubmitDisabled = isSubmitting || !email.trim() || (scope === 'specific' && selectedWorkspaceIds.length === 0);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FiUserPlus className="text-blue-600" aria-hidden="true" />
            Invite User to Organization
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Close invite user modal"
          >
            <FiXCircle size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar space-y-5">
          {feedback && (
            <div
              role={feedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-md flex items-center text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
            >
              {feedback.type === 'success'
                ? <FiCheckCircle className="mr-2 shrink-0" aria-hidden="true" />
                : <FiAlertCircle className="mr-2 shrink-0" aria-hidden="true" />}
              {feedback.text}
              <button onClick={() => setFeedback(null)} className="ml-auto text-lg font-semibold" aria-label="Dismiss">&times;</button>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="invite-org-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              id="invite-org-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            />
          </div>

          {/* Scope */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">WorkHubs</legend>
            <div className="flex gap-3">
              {([['all', 'All WorkHubs', FiGrid], ['specific', 'Specific WorkHubs', FiList]] as const).map(([val, label, Icon]) => (
                <label
                  key={val}
                  className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${scope === val ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={val}
                    checked={scope === val}
                    onChange={() => setScope(val)}
                    className="accent-blue-600"
                    aria-label={label}
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </span>
                </label>
              ))}
            </div>

            {scope === 'specific' && (
              <div className="mt-3 max-h-40 overflow-y-auto custom-scrollbar border border-gray-200 rounded-md p-2 space-y-1">
                {workspaces.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">No workhubs available.</p>
                ) : (
                  workspaces.map(ws => (
                    <label key={ws.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedWorkspaceIds.includes(ws.id)}
                        onChange={() => toggleWorkspace(ws.id)}
                        className="accent-blue-600"
                        aria-label={`Select workhub ${ws.name}`}
                      />
                      <span className="text-sm text-gray-800">{ws.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </fieldset>

          {/* Permissions */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Permissions</legend>
            <div className="flex gap-3">
              {(['edit', 'read_only'] as const).map(p => (
                <label
                  key={p}
                  className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-colors ${permissions === p ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <input
                    type="radio"
                    name="org-invite-perm"
                    value={p}
                    checked={permissions === p}
                    onChange={() => setPermissions(p)}
                    className="accent-blue-600"
                    aria-label={p === 'edit' ? 'Edit' : 'Read only'}
                  />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    {p === 'edit' ? <FiEdit2 size={14} aria-hidden="true" /> : <FiLock size={14} aria-hidden="true" />}
                    {p === 'edit' ? 'Edit' : 'Read only'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="p-6 border-t shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-sm flex items-center justify-center transition-colors disabled:opacity-50"
            aria-label="Invite user to the organization"
          >
            {isSubmitting
              ? <><FiLoader className="animate-spin mr-2" aria-hidden="true" /> Inviting...</>
              : <><FiUserPlus className="mr-2" aria-hidden="true" /> Invite User</>}
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
};

export default InviteUsersOrgModal;
