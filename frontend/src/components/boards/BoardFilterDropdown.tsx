import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiFilter, FiChevronLeft, FiCalendar, FiUser, FiFlag, FiTag, FiCheck } from 'react-icons/fi';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { ColumnType } from '../../types';
import type { Item, Column, StatusColumnSettings, StatusOption, User, SimpleFormulaColumnSettings } from '../../types';
import { evaluateFormula } from '../../utils/formulaEngine';
import DateRangePicker from '../shared/DateRangePicker';

export type ActiveFilter =
  | { type: 'date'; value: string }
  | { type: 'user'; value: string; label: string; avatarUrl?: string }
  | { type: 'status'; value: string; label: string; color: string }
  | { type: 'tag'; value: string }
  | { type: 'timerange'; start: string; end: string };

interface Props {
  boardId: string;
  allItems: Item[];
  activeFilters: ActiveFilter[];
  onFilterChange: (filters: ActiveFilter[]) => void;
}

type Step = 'root' | 'date' | 'user' | 'status' | 'tag' | 'timerange';

const FILTER_OPTIONS: { step: Step; label: string; icon: React.ReactNode }[] = [
  { step: 'date',      label: 'Date',       icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'timerange', label: 'Time Range', icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'user',      label: 'User',       icon: <FiUser size={13} aria-hidden="true" /> },
  { step: 'status',    label: 'Status',     icon: <FiFlag size={13} aria-hidden="true" /> },
  { step: 'tag',       label: 'Tags',       icon: <FiTag size={13} aria-hidden="true" /> },
];

const AVATAR_BG = ['bg-indigo-500','bg-purple-500','bg-pink-500','bg-green-500','bg-blue-500','bg-amber-500','bg-rose-500'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

const BoardFilterDropdown: React.FC<Props> = ({ boardId, allItems, activeFilters, onFilterChange }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('root');
  const ref = useRef<HTMLDivElement>(null);
  const [timeRangeAnchor, setTimeRangeAnchor] = useState<HTMLElement | null>(null);

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

  const isFilterActive = (type: string, value: string) =>
    activeFilters.some((f) => f.type === type && f.value === value);

  const hasTypeActive = (type: string) => activeFilters.some((f) => f.type === type);

  // Toggle a user / status / tag filter (add if absent, remove if present)
  const toggleFilter = (newFilter: ActiveFilter) => {
    if (isFilterActive(newFilter.type, newFilter.value)) {
      onFilterChange(activeFilters.filter((f) => !(f.type === newFilter.type && f.value === newFilter.value)));
    } else {
      onFilterChange([...activeFilters, newFilter]);
    }
  };

  // Date replaces any existing date filter (only one date at a time makes sense)
  const setDateFilter = (date: string) => {
    const without = activeFilters.filter((f) => f.type !== 'date');
    onFilterChange(date ? [...without, { type: 'date', value: date }] : without);
  };

  const currentDate = activeFilters.find((f) => f.type === 'date')?.value ?? '';

  const currentTimeRange = activeFilters.find((f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange');

  const setTimeRangeFilter = (start: string, end: string) => {
    const without = activeFilters.filter((f) => f.type !== 'timerange');
    onFilterChange(start && end ? [...without, { type: 'timerange', start, end }] : without);
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setStep('root'); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          activeFilters.length > 0
            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
        aria-label="Filter items"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FiFilter size={12} aria-hidden="true" />
        Filter
        {activeFilters.length > 0 && (
          <span className="ml-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
            {activeFilters.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1"
          style={{ minWidth: '190px' }}
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
                  <span className="flex-1 text-left">{label}</span>
                  {hasTypeActive(s) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" aria-hidden="true" />
                  )}
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
                  value={currentDate}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Select date to filter by"
                />
                {currentDate && (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    className="mt-1.5 w-full text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear date filter
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'timerange' && (
            <>
              <SubHeader label="Time Range" onBack={() => { setStep('root'); setTimeRangeAnchor(null); }} />
              <div className="px-3 py-2">
                {currentTimeRange ? (
                  <div className="text-xs text-gray-700 mb-2">
                    <span className="font-medium">{currentTimeRange.start}</span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="font-medium">{currentTimeRange.end}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mb-2">No time range set</p>
                )}
                <button
                  type="button"
                  onClick={(e) => setTimeRangeAnchor(e.currentTarget)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left text-gray-600"
                  aria-label="Open date range picker"
                >
                  {currentTimeRange ? 'Change range' : 'Select range'}
                </button>
                {currentTimeRange && (
                  <button
                    type="button"
                    onClick={() => setTimeRangeFilter('', '')}
                    className="mt-1.5 w-full text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear time range
                  </button>
                )}
              </div>
              {timeRangeAnchor && (
                <DateRangePicker
                  initialStart={currentTimeRange?.start ?? ''}
                  initialEnd={currentTimeRange?.end ?? ''}
                  anchorEl={timeRangeAnchor}
                  onCommit={(start, end) => {
                    setTimeRangeFilter(start, end);
                    setTimeRangeAnchor(null);
                  }}
                  onCancel={() => setTimeRangeAnchor(null)}
                />
              )}
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
                      isActive={isFilterActive('user', u.id)}
                      onClick={() => toggleFilter({ type: 'user', value: u.id, label: u.name, avatarUrl: u.profileImageUrl })}
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
                  statusOptions.map((opt) => {
                    const active = isFilterActive('status', opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        onClick={() => toggleFilter({ type: 'status', value: opt.id, label: opt.label, color: opt.color })}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${
                          active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} aria-hidden="true" />
                        <span className="flex-1 text-left">{opt.label}</span>
                        {active && <FiCheck size={11} className="text-indigo-600 flex-shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })
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
                  availableTags.map((tag) => {
                    const active = isFilterActive('tag', tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        role="menuitem"
                        onClick={() => toggleFilter({ type: 'tag', value: tag })}
                        className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border transition-colors ${
                          active
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {active && <FiCheck size={9} aria-hidden="true" />}
                        {tag}
                      </button>
                    );
                  })
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
      <span className="flex-1 truncate text-left">{user.name}</span>
      {isActive && <FiCheck size={11} className="text-indigo-600 flex-shrink-0" aria-hidden="true" />}
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

    if (col.type === ColumnType.SIMPLE_FORMULA) {
      const settings = col.settings as SimpleFormulaColumnSettings | undefined;
      const formula = typeof val === 'string' ? val : (settings?.defaultFormula ?? '');
      if (formula) {
        const colValues: Record<string, number | null | undefined> = {};
        for (const nc of columns) {
          if (nc.type === ColumnType.NUMBER) {
            const v = item.values[nc.id];
            colValues[nc.name] = v != null ? Number(v) : undefined;
          }
        }
        const result = evaluateFormula(formula, colValues);
        if (result != null) {
          const formatted = Number.isInteger(result) ? String(result) : result.toFixed(2);
          if (formatted.includes(q)) return true;
        }
      }
      continue;
    }

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
        if (ids.some((id) => {
          const name = users.find((u) => u.id === id)?.name;
          return typeof name === 'string' && name.toLowerCase().includes(q);
        })) return true;
        break;
      }
      case ColumnType.TAGS: {
        const tags = (Array.isArray(val) ? val : []) as unknown[];
        if (tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(q))) return true;
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

function itemMatchesSingleFilter(item: Item, columns: Column[], filter: ActiveFilter): boolean {
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
    case 'timerange': {
      // Check TIME_RANGE columns (item spans within the filter window)
      const trCols = columns.filter((c) => c.type === ColumnType.TIME_RANGE);
      const trMatch = trCols.some((col) => {
        const val = item.values[col.id] as { start?: string | Date; end?: string | Date } | null | undefined;
        if (!val) return false;
        const start = String(val.start ?? '').slice(0, 10);
        const end = String(val.end ?? '').slice(0, 10);
        return start >= filter.start && end <= filter.end;
      });
      if (trMatch) return true;
      // Also check DATE columns (single date falls within the filter window)
      const dateCols = columns.filter((c) => c.type === ColumnType.DATE);
      return dateCols.some((col) => {
        const val = item.values[col.id];
        if (!val) return false;
        const dateStr = String(val).slice(0, 10);
        return dateStr >= filter.start && dateStr <= filter.end;
      });
    }
    default:
      return true;
  }
}

// AND between filter types, OR within the same type
export function itemMatchesFilters(item: Item, columns: Column[], filters: ActiveFilter[]): boolean {
  if (filters.length === 0) return true;

  const byType = new Map<string, ActiveFilter[]>();
  for (const f of filters) {
    const arr = byType.get(f.type) ?? [];
    arr.push(f);
    byType.set(f.type, arr);
  }

  for (const [, typeFilters] of byType) {
    if (!typeFilters.some((f) => itemMatchesSingleFilter(item, columns, f))) return false;
  }
  return true;
}
