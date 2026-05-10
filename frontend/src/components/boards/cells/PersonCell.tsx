import React, { useRef, useState } from 'react';
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
        className={`${size} rounded-full object-cover border-2 border-gray-300 flex-shrink-0`}
        src={user.profileImageUrl}
        alt={user.name}
        title={user.name}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center ${textSize} text-white font-medium border-2 border-gray-300 flex-shrink-0 ${avatarColor(user.id)}`}
      title={user.name}
      aria-label={user.name}
    >
      {user.name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
};

interface TooltipAnchor { centerX: number; top: number; bottom: number }

const TOOLTIP_W = 220;
const TOOLTIP_H = 152;
const GAP = 0;

const ProfileTooltip: React.FC<{
  user: User;
  anchor: TooltipAnchor;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({ user, anchor, onMouseEnter, onMouseLeave }) => {
  const [imgError, setImgError] = useState(false);
  const [copied, setCopied] = useState(false);

  const showAbove = anchor.top > TOOLTIP_H;
  const top = showAbove ? anchor.top : anchor.bottom;
  const left = Math.max(8, Math.min(anchor.centerX - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 8));

  const copyEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(user.email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      role="tooltip"
      aria-label={`${user.name}'s profile`}
      className="fixed z-[200] bg-white rounded-xl shadow-xl border border-gray-100 p-4 flex flex-col items-center gap-3 pointer-events-auto"
      style={{ top, left, width: TOOLTIP_W, transform: showAbove ? 'translateY(-100%)' : undefined }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {user.profileImageUrl && !imgError ? (
        <img
          className="h-16 w-16 rounded-full object-cover border-4 border-white shadow"
          src={user.profileImageUrl}
          alt={user.name}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`h-16 w-16 rounded-full flex items-center justify-center text-2xl text-white font-semibold border-4 border-white shadow ${avatarColor(user.id)}`}
          aria-label={user.name}
        >
          {user.name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <div className="flex flex-col items-center gap-1 text-center w-full">
        <span className="text-gray-900 font-semibold text-sm">{user.name}</span>
        <div className="flex items-center gap-1.5 justify-center">
          <span className="text-gray-500 text-xs truncate max-w-[152px]">{user.email}</span>
          <button
            type="button"
            onClick={copyEmail}
            aria-label={copied ? 'Email copied' : 'Copy email address'}
            className="flex-shrink-0 text-gray-400 hover:text-indigo-600 transition-colors"
          >
            {copied ? (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-green-500 stroke-2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const PersonCellInner: React.FC<Props> = ({ item, column }) => {
  const selected = (item.values[column.id] ?? []) as string[];
  const settings = column.settings as PersonColumnSettings;
  const multiple = settings?.multiple ?? true;
  const { mutate } = useUpdateItem();
  const [search, setSearch] = useState('');
  const [hoveredUser, setHoveredUser] = useState<User | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<TooltipAnchor | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const openTooltip = (user: User, e: React.MouseEvent<HTMLElement>) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipAnchor({ centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
    setHoveredUser(user);
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => {
      setHoveredUser(null);
      setTooltipAnchor(null);
    }, 150);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  return (
    <>
      {hoveredUser && tooltipAnchor && (
        <ProfileTooltip
          user={hoveredUser}
          anchor={tooltipAnchor}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        />
      )}
      <CellWrapper column={column}>
        {(isEditing, stopEdit) => (
          <>
            <div className="px-2 py-[2px] w-full flex items-center justify-center">
              {selectedUsers.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {selectedUsers.slice(0, 3).map((u) => (
                    <div
                      key={u.id}
                      role="img"
                      aria-label={u.name}
                      className="cursor-default"
                      onMouseEnter={(e) => openTooltip(u, e)}
                      onMouseLeave={scheduleClose}
                    >
                      <Avatar user={u} />
                    </div>
                  ))}
                  {selectedUsers.length > 3 && (
                    <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 border-2 border-gray-300 flex-shrink-0">
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

const PersonCell = React.memo(PersonCellInner);
export default PersonCell;
