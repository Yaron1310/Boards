import React, { useRef, useEffect, useState, useMemo } from 'react';
import { FiFilter, FiChevronLeft, FiCalendar, FiUser, FiFlag, FiTag, FiCheck } from 'react-icons/fi';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../services/geminiService';
import { useBoards } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { ColumnType } from '../../types';
import type { DashboardParams, StatusColumnSettings, StatusOption } from '../../types';
import DateRangePicker from '../shared/DateRangePicker';

// ---------------------------------------------------------------------------
// Filter state types — exported so DashboardPage can share the same shape
// ---------------------------------------------------------------------------

export type DashboardActiveFilter =
  | { type: 'date'; value: string }
  | { type: 'user'; value: string; label: string; avatarUrl?: string }
  | { type: 'status'; value: string; label: string; color: string }
  | { type: 'tag'; value: string }
  | { type: 'timerange'; start: string; end: string };

export interface FilterState {
  filters: DashboardActiveFilter[];
}

export const INITIAL_FILTER_STATE: FilterState = {
  filters: [],
};

export type FilterAction =
  | { type: 'SET_DATE'; value: string }
  | { type: 'TOGGLE_USER'; value: string; label: string; avatarUrl?: string }
  | { type: 'TOGGLE_STATUS'; value: string; label: string; color: string }
  | { type: 'TOGGLE_TAG'; value: string }
  | { type: 'SET_TIME_RANGE'; start: string; end: string }
  | { type: 'REMOVE_FILTER'; filter: DashboardActiveFilter }
  | { type: 'CLEAR' };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_DATE': {
      const without = state.filters.filter((f) => f.type !== 'date');
      if (!action.value) return { filters: without };
      return { filters: [...without, { type: 'date', value: action.value }] };
    }
    case 'TOGGLE_USER': {
      const alreadyActive = state.filters.some(
        (f): f is { type: 'user'; value: string; label: string } =>
          f.type === 'user' && f.value === action.value,
      );
      if (alreadyActive) {
        return { filters: state.filters.filter((f) => !(f.type === 'user' && (f as { type: 'user'; value: string }).value === action.value)) };
      }
      return { filters: [...state.filters, { type: 'user', value: action.value, label: action.label, avatarUrl: action.avatarUrl }] };
    }
    case 'TOGGLE_STATUS': {
      const alreadyActive = state.filters.some(
        (f): f is { type: 'status'; value: string; label: string; color: string } =>
          f.type === 'status' && f.value === action.value,
      );
      if (alreadyActive) {
        return { filters: state.filters.filter((f) => !(f.type === 'status' && (f as { type: 'status'; value: string }).value === action.value)) };
      }
      return { filters: [...state.filters, { type: 'status', value: action.value, label: action.label, color: action.color }] };
    }
    case 'TOGGLE_TAG': {
      const alreadyActive = state.filters.some(
        (f): f is { type: 'tag'; value: string } => f.type === 'tag' && f.value === action.value,
      );
      if (alreadyActive) {
        return { filters: state.filters.filter((f) => !(f.type === 'tag' && (f as { type: 'tag'; value: string }).value === action.value)) };
      }
      return { filters: [...state.filters, { type: 'tag', value: action.value }] };
    }
    case 'SET_TIME_RANGE': {
      const without = state.filters.filter((f) => f.type !== 'timerange');
      if (!action.start || !action.end) return { filters: without };
      return { filters: [...without, { type: 'timerange', start: action.start, end: action.end }] };
    }
    case 'REMOVE_FILTER': {
      const removed = action.filter;
      return {
        filters: state.filters.filter((f) => {
          if (f.type !== removed.type) return true;
          if (f.type === 'timerange') return false;
          return (f as { value: string }).value !== (removed as { value: string }).value;
        }),
      };
    }
    case 'CLEAR':
      return INITIAL_FILTER_STATE;
    default:
      return state;
  }
}

/** Derive the API params from the filter state. */
export function toDashboardParams(state: FilterState): DashboardParams {
  const params: DashboardParams = {};
  for (const f of state.filters) {
    if (f.type === 'user') params.assigneeId = f.value;
    if (f.type === 'date') params.dueDateFrom = f.value;
    if (f.type === 'timerange') {
      params.dueDateFrom = f.start;
      params.dueDateTo = f.end;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// DashboardFilterBar
// ---------------------------------------------------------------------------

type Step = 'root' | 'date' | 'user' | 'status' | 'tag' | 'timerange';

interface DashboardFilterBarProps {
  filters: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  boardIds?: string[];
}

const AVATAR_BG = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-blue-500', 'bg-amber-500', 'bg-rose-500'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

interface MemberRowProps {
  member: { id: string; name: string; profileImageUrl?: string };
  active: boolean;
  onToggle: () => void;
}

const MemberRow: React.FC<MemberRowProps> = ({ member, active, onToggle }) => {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onToggle}
      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
        active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {member.profileImageUrl && !imgErr ? (
        <img
          src={member.profileImageUrl}
          alt={member.name}
          className="w-5 h-5 rounded-full object-cover flex-shrink-0"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-medium flex-shrink-0 ${avatarColor(member.id)}`}>
          {member.name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="flex-1 truncate text-left">{member.name}</span>
      {active && <FiCheck size={11} className="text-indigo-600 flex-shrink-0" aria-hidden="true" />}
    </button>
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

const FILTER_OPTIONS: { step: Step; label: string; icon: React.ReactNode }[] = [
  { step: 'date',      label: 'Date',       icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'timerange', label: 'Time Range', icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'user',      label: 'User',       icon: <FiUser size={13} aria-hidden="true" /> },
  { step: 'status',    label: 'Status',     icon: <FiFlag size={13} aria-hidden="true" /> },
  { step: 'tag',       label: 'Tags',       icon: <FiTag size={13} aria-hidden="true" /> },
];

// ---------------------------------------------------------------------------
// Hook: collect all status options and tags from all org boards
// ---------------------------------------------------------------------------

const useOrgStatusOptions = (enabled: boolean, specificBoardIds?: string[]) => {
  const { data: boards = [] } = useBoards(undefined, false, enabled && !specificBoardIds?.length);
  const boardIds = specificBoardIds?.length
    ? specificBoardIds.slice(0, 5)
    : boards.slice(0, 5).map((b) => b.id);

  const q0 = useColumns(boardIds[0] ?? '', boardIds.length > 0 && enabled);
  const q1 = useColumns(boardIds[1] ?? '', boardIds.length > 1 && enabled);
  const q2 = useColumns(boardIds[2] ?? '', boardIds.length > 2 && enabled);
  const q3 = useColumns(boardIds[3] ?? '', boardIds.length > 3 && enabled);
  const q4 = useColumns(boardIds[4] ?? '', boardIds.length > 4 && enabled);

  const allColumns = [
    ...(q0.data ?? []),
    ...(q1.data ?? []),
    ...(q2.data ?? []),
    ...(q3.data ?? []),
    ...(q4.data ?? []),
  ];

  const statusOptions = useMemo<StatusOption[]>(() => {
    const seen = new Set<string>();
    const opts: StatusOption[] = [];
    for (const col of allColumns) {
      if (col.type !== ColumnType.STATUS) continue;
      const settings = col.settings as StatusColumnSettings;
      for (const opt of (settings.options ?? [])) {
        if (!seen.has(opt.id)) { seen.add(opt.id); opts.push(opt); }
      }
    }
    return opts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q0.data, q1.data, q2.data, q3.data, q4.data]);

  return statusOptions;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({ filters, dispatch, boardIds }) => {
  const { user } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('root');
  const [timeRangeAnchor, setTimeRangeAnchor] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: usersData } = useQuery({
    queryKey: ['users', 'org', user?.workspaces?.[0]?.orgId],
    queryFn: () => getUsers({ limit: 200 }),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const members = usersData?.data ?? [];

  const statusOptions = useOrgStatusOptions(open && step === 'status', boardIds);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStep('root');
        setTimeRangeAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeCount = filters.filters.length;
  const currentDate = filters.filters.find((f): f is { type: 'date'; value: string } => f.type === 'date')?.value ?? '';
  const currentTimeRange = filters.filters.find(
    (f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange',
  );

  const isActive = (type: string, value: string) =>
    filters.filters.some((f) => f.type === type && (f as Record<string, string>).value === value);

  const hasTypeActive = (t: string) => filters.filters.some((f) => f.type === t);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setStep('root'); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          activeCount > 0
            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
        aria-label="Filter dashboard"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <FiFilter size={12} aria-hidden="true" />
        Filter
        {activeCount > 0 && (
          <span className="ml-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-indigo-600 text-white rounded-full">
            {activeCount}
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
              {activeCount > 0 && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { dispatch({ type: 'CLEAR' }); setOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Clear all filters
                  </button>
                </>
              )}
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
                  onChange={(e) => dispatch({ type: 'SET_DATE', value: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Select date to filter by"
                />
                {currentDate && (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SET_DATE', value: '' })}
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
                    onClick={() => dispatch({ type: 'SET_TIME_RANGE', start: '', end: '' })}
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
                    dispatch({ type: 'SET_TIME_RANGE', start, end });
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
                {members.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No users found</p>
                ) : (
                  members.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      active={isActive('user', m.id)}
                      onToggle={() =>
                        dispatch({ type: 'TOGGLE_USER', value: m.id, label: m.name, avatarUrl: m.profileImageUrl })
                      }
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
                  <p className="px-3 py-2 text-xs text-gray-400">No status columns found</p>
                ) : (
                  statusOptions.map((opt) => {
                    const active = isActive('status', opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitem"
                        onClick={() => dispatch({ type: 'TOGGLE_STATUS', value: opt.id, label: opt.label, color: opt.color })}
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
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">Tag filtering is not available at the dashboard level</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardFilterBar;
