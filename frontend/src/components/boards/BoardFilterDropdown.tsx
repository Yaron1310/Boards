import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiFilter, FiX, FiChevronLeft, FiCalendar, FiUser, FiFlag, FiTag } from 'react-icons/fi';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { ColumnType } from '../../types';
import type { Item, Column, StatusColumnSettings, StatusOption, User } from '../../types';

export type ActiveFilter =
  | { type: 'date'; value: string }
  | { type: 'user'; value: string; label: string; avatarUrl?: string }
  | { type: 'status'; value: string; label: string; color: string }
  | { type: 'tag'; value: string };

interface Props {
  boardId: string;
  allItems: Item[];
  activeFilter: ActiveFilter | null;
  onFilterChange: (f: ActiveFilter | null) => void;
}

type Step = 'root' | 'date' | 'user' | 'status' | 'tag';

const FILTER_OPTIONS: { step: Step; label: string; icon: React.ReactNode }[] = [
  { step: 'date',   label: 'Date',   icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'user',   label: 'User',   icon: <FiUser size={13} aria-hidden="true" /> },
  { step: 'status', label: 'Status', icon: <FiFlag size={13} aria-hidden="true" /> },
  { step: 'tag',    label: 'Tags',   icon: <FiTag size={13} aria-hidden="true" /> },
];

const AVATAR_BG = ['bg-indigo-500','bg-purple-500','bg-pink-500','bg-green-500','bg-blue-500','bg-amber-500','bg-rose-500'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

const BoardFilterDropdown: React.FC<Props> = ({ boardId, allItems, activeFilter, onFilterChange }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('root');
  const ref = useRef<HTMLDivElement>(null);

  const { data: columns = [] } = useColumns(boardId);
  const { data: allUsers = [] } = useUsersQuery({ limit: 200 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStep('root');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Collect status options from all STATUS columns
  const statusOptions = useMemo<StatusOption[]>(() => {
    const seen = new Set<string>();
    const opts: StatusOption[] = [];
    for (const col of columns) {
      if (col.type !== ColumnType.STATUS) continue;
      const settings = col.settings as StatusColumnSettings;
      for (const opt of (settings.options ?? [])) {
        if (!seen.has(opt.id)) { seen.add(opt.id); opts.push(opt); }
      }
    }
    return opts;
  }, [columns]);

  // Collect unique tags from all TAGS columns across all items
  const availableTags = useMemo<string[]>(() => {
    const tagCols = columns.filter((c) => c.type === ColumnType.TAGS).map((c) => c.id);
    const seen = new Set<string>();
    for (const item of allItems) {
      for (const colId of tagCols) {
        const tags = (item.values[colId] ?? []) as string[];
        for (const t of tags) if (t) seen.add(t);
      }
    }
    return [...seen].sort();
  }, [allItems, columns]);

  // Collect unique users from all PERSON columns across all items
  const availableUsers = useMemo<User[]>(() => {
    const personCols = columns.filter((c) => c.type === ColumnType.PERSON).map((c) => c.id);
    const userIds = new Set<string>();
    for (const item of allItems) {
      for (const colId of personCols) {
        const ids = (item.values[colId] ?? []) as string[];
        for (const id of ids) if (id) userIds.add(id);
      }
    }
    return allUsers.filter((u) => userIds.has(u.id));
  }, [allItems, columns, allUsers]);

  const close = () => { setOpen(false); setStep('root'); };

  const applyFilter = (f: ActiveFilter) => { onFilterChange(f); close(); };

  // Active filter chip label
  const filterLabel = activeFilter
    ? activeFilter.type === 'date'   ? activeFilter.value
    : activeFilter.type === 'user'   ? activeFilter.label
    : activeFilter.type === 'status' ? activeFilter.label
    : activeFilter.value
    : null;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setStep('root'); }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            activeFilter
              ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
          aria-label="Filter items"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <FiFilter size={12} aria-hidden="true" />
          Filter
        </button>

        {activeFilter && filterLabel && (
          <div className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            {activeFilter.type === 'status' && (
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: activeFilter.color }}
                aria-hidden="true"
              />
            )}
            <span className="max-w-[100px] truncate">{filterLabel}</span>
            <button
              type="button"
              onClick={() => onFilterChange(null)}
              className="text-indigo-500 hover:text-indigo-700 flex-shrink-0"
              aria-label="Clear filter"
            >
              <FiX size={11} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1"
          style={{ minWidth: '180px' }}
          role="menu"
          aria-label="Filter options"
        >
          {step === 'root' && (
            <>
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Filter by</p>
              {FILTER_OPTIONS.map(({ step: s, label, icon }) => (
                <button
                  key={s}
                  type="button"
                  role="menuitem"
                  onClick={() => setStep(s)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-gray-400">{icon}</span>
                  {label}
                </button>
              ))}
            </>
          )}

          {step === 'date' && (
            <>
              <SubHeader label="Date" onBack={() => setStep('root')} />
              <div className="px-3 py-2">
                <input
                  type="date"
                  autoFocus
                  defaultValue={activeFilter?.type === 'date' ? activeFilter.value : ''}
                  onChange={(e) => {
                    if (e.target.value) applyFilter({ type: 'date', value: e.target.value });
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Select date to filter by"
                />
              </div>
            </>
          )}

          {step === 'user' && (
            <>
              <SubHeader label="User" onBack={() => setStep('root')} />
              <div className="max-h-52 overflow-y-auto">
                {availableUsers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No users assigned to items</p>
                ) : (
                  availableUsers.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isActive={activeFilter?.type === 'user' && activeFilter.value === u.id}
                      onClick={() => applyFilter({ type: 'user', value: u.id, label: u.name, avatarUrl: u.profileImageUrl })}
                      avatarColor={avatarColor(u.id)}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {step === 'status' && (
            <>
              <SubHeader label="Status" onBack={() => setStep('root')} />
              <div className="max-h-52 overflow-y-auto">
                {statusOptions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No status columns on this board</p>
                ) : (
                  statusOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitem"
                      onClick={() => applyFilter({ type: 'status', value: opt.id, label: opt.label, color: opt.color })}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
                        activeFilter?.type === 'status' && activeFilter.value === opt.id
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} aria-hidden="true" />
                      {opt.label}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {step === 'tag' && (
            <>
              <SubHeader label="Tags" onBack={() => setStep('root')} />
              <div className="max-h-52 overflow-y-auto px-2 py-1.5 flex flex-wrap gap-1.5">
                {availableTags.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-gray-400">No tags on this board</p>
                ) : (
                  availableTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      role="menuitem"
                      onClick={() => applyFilter({ type: 'tag', value: tag })}
                      className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                        activeFilter?.type === 'tag' && activeFilter.value === tag
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                          : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tag}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SubHeader: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100">
    <button
      type="button"
      onClick={onBack}
      className="p-1 text-gray-400 hover:text-gray-600 rounded"
      aria-label="Back to filter types"
    >
      <FiChevronLeft size={13} aria-hidden="true" />
    </button>
    <span className="text-xs font-semibold text-gray-600">{label}</span>
  </div>
);

const UserRow: React.FC<{
  user: User;
  isActive: boolean;
  onClick: () => void;
  avatarColor: string;
}> = ({ user, isActive, onClick, avatarColor: bgColor }) => {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {user.profileImageUrl && !imgErr ? (
        <img
          src={user.profileImageUrl}
          alt={user.name}
          className="w-5 h-5 rounded-full object-cover flex-shrink-0"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-medium flex-shrink-0 ${bgColor}`}>
          {user.name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="truncate">{user.name}</span>
    </button>
  );
};

export default BoardFilterDropdown;

// ─── Search + filter helpers (exported for BoardContent) ──────────────────────

export function itemMatchesSearch(
  item: Item,
  columns: Column[],
  users: User[],
  search: string,
): boolean {
  if (!search.trim()) return true;
  const q = search.toLowerCase();

  if (item.name.toLowerCase().includes(q)) return true;

  for (const col of columns) {
    const val = item.values[col.id];
    if (val == null) continue;

    switch (col.type) {
      case ColumnType.STATUS: {
        const opts = ((col.settings as StatusColumnSettings).options ?? []);
        const opt = opts.find((o) => o.id === val);
        if (opt?.label.toLowerCase().includes(q)) return true;
        break;
      }
      case ColumnType.PERSON: {
        const ids = (Array.isArray(val) ? val : []) as string[];
        if (ids.some((id) => users.find((u) => u.id === id)?.name.toLowerCase().includes(q))) return true;
        break;
      }
      case ColumnType.TAGS: {
        const tags = (Array.isArray(val) ? val : []) as string[];
        if (tags.some((t) => t.toLowerCase().includes(q))) return true;
        break;
      }
      case ColumnType.LOCATION: {
        const loc = val as { address?: string };
        if (loc.address?.toLowerCase().includes(q)) return true;
        break;
      }
      default:
        if (String(val).toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

export function itemMatchesFilter(item: Item, columns: Column[], filter: ActiveFilter | null): boolean {
  if (!filter) return true;

  switch (filter.type) {
    case 'date': {
      const dateCols = columns.filter(
        (c) => c.type === ColumnType.DATE || c.type === ColumnType.TIME_RANGE,
      );
      return dateCols.some((col) => {
        const val = item.values[col.id];
        if (!val) return false;
        if (col.type === ColumnType.DATE) return String(val).startsWith(filter.value);
        const range = val as { start?: string | Date; end?: string | Date };
        return (
          String(range.start ?? '').startsWith(filter.value) ||
          String(range.end ?? '').startsWith(filter.value)
        );
      });
    }
    case 'user': {
      const personCols = columns.filter((c) => c.type === ColumnType.PERSON);
      return personCols.some((col) => {
        const ids = (item.values[col.id] ?? []) as string[];
        return ids.includes(filter.value);
      });
    }
    case 'status': {
      const statusCols = columns.filter((c) => c.type === ColumnType.STATUS);
      return statusCols.some((col) => item.values[col.id] === filter.value);
    }
    case 'tag': {
      const tagCols = columns.filter((c) => c.type === ColumnType.TAGS);
      return tagCols.some((col) => {
        const tags = (item.values[col.id] ?? []) as string[];
        return tags.includes(filter.value);
      });
    }
    default:
      return true;
  }
}
