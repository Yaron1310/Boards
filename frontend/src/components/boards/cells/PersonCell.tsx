import React, { useState } from 'react';
import { useUpdateItem } from '../../../hooks/queries/useItemQueries';
import { useUsersQuery } from '../../../hooks/queries/useUserQueries';
import type { Item, Column, PersonColumnSettings, User } from '../../../types';
import CellWrapper from './CellWrapper';

interface Props { item: Item; column: Column }

const AVATAR_BG = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-blue-500', 'bg-amber-500', 'bg-rose-500'];

const avatarColor = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
};

const Avatar: React.FC<{ user: User; size?: string; textSize?: string }> = ({
  user,
  size = 'h-9 w-9',
  textSize = 'text-sm',
}) => {
  const [imgError, setImgError] = useState(false);
  if (user.profileImageUrl && !imgError) {
    return (
      <img
        className={`${size} rounded-full object-cover border-2 border-white flex-shrink-0`}
        src={user.profileImageUrl}
        alt={user.name}
        title={user.name}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center ${textSize} text-white font-medium border-2 border-white flex-shrink-0 ${avatarColor(user.id)}`}
      title={user.name}
      aria-label={user.name}
    >
      {user.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
};

const ProfileModal: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
  const [imgError, setImgError] = useState(false);
  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${user.name}'s profile`}
        className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none"
      >
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 w-72 pointer-events-auto relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close profile"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {user.profileImageUrl && !imgError ? (
            <img
              className="h-28 w-28 rounded-full object-cover border-4 border-white shadow-lg"
              src={user.profileImageUrl}
              alt={user.name}
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className={`h-28 w-28 rounded-full flex items-center justify-center text-4xl text-white font-semibold border-4 border-white shadow-lg ${avatarColor(user.id)}`}
              aria-label={user.name}
            >
              {user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-gray-900 font-semibold text-lg">{user.name}</span>
            <span className="text-gray-500 text-sm">{user.email}</span>
          </div>
        </div>
      </div>
    </>
  );
};

const PersonCell: React.FC<Props> = ({ item, column }) => {
  const selected = (item.values[column.id] ?? []) as string[];
  const settings = column.settings as PersonColumnSettings;
  const multiple = settings?.multiple ?? true;
  const { mutate } = useUpdateItem();
  const [search, setSearch] = useState('');
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const { data: allUsers = [] } = useUsersQuery({ limit: 200 });

  const selectedUsers = allUsers.filter((u) => selected.includes(u.id));
  const filtered = allUsers.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (userId: string, stopEdit: () => void) => {
    let next: string[];
    if (selected.includes(userId)) {
      next = selected.filter((id) => id !== userId);
    } else {
      next = multiple ? [...selected, userId] : [userId];
    }
    mutate({ id: item.id, patch: { values: { [column.id]: next } } });
    if (!multiple) stopEdit();
  };

  return (
    <>
      {profileUser && (
        <ProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
      )}
      <CellWrapper column={column}>
        {(isEditing, stopEdit) => (
          <>
            <div className="px-2 py-[2px] w-full flex items-center justify-center">
              {selectedUsers.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {selectedUsers.slice(0, 3).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-full"
                      aria-label={`View ${u.name}'s profile`}
                      onClick={(e) => { e.stopPropagation(); setProfileUser(u); }}
                    >
                      <Avatar user={u} />
                    </button>
                  ))}
                  {selectedUsers.length > 3 && (
                    <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-white flex-shrink-0">
                      +{selectedUsers.length - 3}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-gray-300 text-xs">—</span>
              )}
            </div>

            {isEditing && (
              <>
                <div className="fixed inset-0 z-40" onClick={stopEdit} aria-hidden="true" />
                <div
                  className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded shadow-lg mt-0.5 w-56"
                  role="listbox"
                  aria-label={`Select ${column.name}`}
                  aria-multiselectable={multiple}
                >
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="search"
                      value={search}
                      autoFocus
                      placeholder="Search people..."
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-indigo-400"
                      onChange={(e) => setSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Search people"
                    />
                  </div>
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {filtered.map((u) => {
                      const isChecked = selected.includes(u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isChecked}
                            className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${isChecked ? 'bg-indigo-50' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggle(u.id, stopEdit); }}
                          >
                            <Avatar user={u} size="h-6 w-6" textSize="text-xs" />
                            <span className="truncate flex-1">{u.name}</span>
                            {isChecked && <span className="text-indigo-600 text-xs">✓</span>}
                          </button>
                        </li>
                      );
                    })}
                    {filtered.length === 0 && (
                      <li className="px-3 py-2 text-xs text-gray-400">No users found</li>
                    )}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </CellWrapper>
    </>
  );
};

export default PersonCell;
