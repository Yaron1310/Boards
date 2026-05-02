import React, { useState, useMemo } from 'react';
import { FiX, FiSearch, FiUserPlus, FiUserCheck, FiLoader } from 'react-icons/fi';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { useBoardMembers, useAddBoardMember } from '../../hooks/queries/useBoardMemberQueries';
import { BoardRole, UserRole } from '../../types';
import type { User } from '../../types';

interface Props {
  boardId: string;
  workspaceId: string;
  onClose: () => void;
}

const AVATAR_BG = ['bg-indigo-500','bg-purple-500','bg-pink-500','bg-green-500','bg-blue-500','bg-amber-500','bg-rose-500'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

const Avatar: React.FC<{ user: User }> = ({ user }) => {
  const [imgErr, setImgErr] = useState(false);
  if (user.profileImageUrl && !imgErr) {
    return (
      <img
        src={user.profileImageUrl}
        alt={user.name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        onError={() => setImgErr(true)}
      />
    );
  }
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0 ${avatarColor(user.id)}`}>
      {user.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
};

const BoardInviteModal: React.FC<Props> = ({ boardId, workspaceId, onClose }) => {
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const { data: allUsers = [], isLoading: usersLoading } = useUsersQuery({ workspaceId, limit: 200 });
  const { data: boardMembers = [], isLoading: membersLoading } = useBoardMembers(boardId);
  const { mutateAsync: addMember } = useAddBoardMember(boardId);

  const memberIds = useMemo(() => new Set(boardMembers.map((m) => m.userId)), [boardMembers]);

  // Show only regular (non-admin) workspace users not already on the board
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (memberIds.has(u.id)) return false;
      if (u.role === UserRole.SYSTEM_ADMIN || u.role === UserRole.ORGANIZATION_ADMIN) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [allUsers, memberIds, search]);

  const alreadyMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (!memberIds.has(u.id)) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [allUsers, memberIds, search]);

  const handleAdd = async (userId: string) => {
    try {
      await addMember({ userId, role: BoardRole.EDITOR });
      setAddedIds((prev) => new Set([...prev, userId]));
    } catch {
      // error silently handled; UI stays consistent via query invalidation
    }
  };

  const isLoading = usersLoading || membersLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Invite users to board"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Invite to board</h2>
            <p className="text-xs text-gray-500 mt-0.5">Add workspace members as board editors</p>
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

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Search users"
              autoFocus
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-10" role="status">
              <FiLoader className="animate-spin text-indigo-400" size={20} aria-hidden="true" />
            </div>
          ) : (
            <>
              {candidates.length > 0 && (
                <>
                  {(alreadyMembers.length > 0 || search) && (
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                      Add to board
                    </p>
                  )}
                  {candidates.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      added={addedIds.has(user.id)}
                      onAdd={() => void handleAdd(user.id)}
                    />
                  ))}
                </>
              )}

              {alreadyMembers.length > 0 && (
                <>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                    Already on board
                  </p>
                  {alreadyMembers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Avatar user={user} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <FiUserCheck size={13} aria-hidden="true" />
                        <span>Member</span>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {candidates.length === 0 && alreadyMembers.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-gray-400">
                  {search ? 'No users match your search.' : 'All workspace members are already on this board.'}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-[11px] text-gray-400">
            Users are added as <strong className="text-gray-500">editors</strong>. Only workspace members can be added.
          </p>
        </div>
      </div>
    </div>
  );
};

const UserRow: React.FC<{ user: User; added: boolean; onAdd: () => void }> = ({ user, added, onAdd }) => {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (added || pending) return;
    setPending(true);
    await onAdd();
    setPending(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <Avatar user={user} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{user.name}</p>
        <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
      </div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={added || pending}
        className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors flex-shrink-0 ${
          added
            ? 'bg-green-50 border-green-200 text-green-600 cursor-default'
            : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 disabled:opacity-60'
        }`}
        aria-label={added ? `${user.name} added` : `Add ${user.name} to board`}
      >
        {pending ? (
          <FiLoader size={11} className="animate-spin" aria-hidden="true" />
        ) : added ? (
          <FiUserCheck size={11} aria-hidden="true" />
        ) : (
          <FiUserPlus size={11} aria-hidden="true" />
        )}
        {added ? 'Added' : 'Add'}
      </button>
    </div>
  );
};

export default BoardInviteModal;
