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

const Avatar: React.FC<{ user: User }> = ({ user }) => (
  <div
    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-medium border-2 border-white flex-shrink-0 ${avatarColor(user.id)}`}
    title={user.name}
    aria-label={user.name}
  >
    {user.name?.[0]?.toUpperCase() ?? '?'}
  </div>
);

const PersonCell: React.FC<Props> = ({ item, column }) => {
  const selected = (item.values[column.id] ?? []) as string[];
  const settings = column.settings as PersonColumnSettings;
  const multiple = settings?.multiple ?? true;
  const { mutate } = useUpdateItem();
  const [search, setSearch] = useState('');
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
    <CellWrapper column={column}>
      {(isEditing, stopEdit) => (
        <>
          <div className="px-3 py-2 w-full flex items-center justify-center">
            {selectedUsers.length > 0 ? (
              <div className="flex items-center -space-x-1">
                {selectedUsers.slice(0, 3).map((u) => <Avatar key={u.id} user={u} />)}
                {selectedUsers.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-white">
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
                          <Avatar user={u} />
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
  );
};

export default PersonCell;
