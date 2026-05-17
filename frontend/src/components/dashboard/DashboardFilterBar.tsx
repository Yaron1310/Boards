import React, { useRef, useEffect, useState } from 'react';
import { FiFilter, FiChevronLeft, FiCalendar, FiUser, FiCheck } from 'react-icons/fi';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../services/geminiService';
import type { DashboardParams } from '../../types';
import DateRangePicker from '../shared/DateRangePicker';

// ---------------------------------------------------------------------------
// Filter state types — exported so DashboardPage can share the same shape
// ---------------------------------------------------------------------------

export type DashboardActiveFilter =
  | { type: 'user'; value: string; label: string; avatarUrl?: string }
  | { type: 'timerange'; start: string; end: string };

export interface FilterState {
  filters: DashboardActiveFilter[];
}

export const INITIAL_FILTER_STATE: FilterState = {
  filters: [],
};

export type FilterAction =
  | { type: 'TOGGLE_USER'; value: string; label: string; avatarUrl?: string }
  | { type: 'SET_TIME_RANGE'; start: string; end: string }
  | { type: 'CLEAR' };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'TOGGLE_USER': {
      const alreadyActive = state.filters.some(
        (f): f is { type: 'user'; value: string; label: string } =>
          f.type === 'user' && f.value === action.value,
      );
      if (alreadyActive) {
        return { filters: state.filters.filter((f) => !(f.type === 'user' && (f as { type: 'user'; value: string }).value === action.value)) };
      }
      return {
        filters: [
          ...state.filters.filter((f) => f.type !== 'user'),
          { type: 'user', value: action.value, label: action.label, avatarUrl: action.avatarUrl },
        ],
      };
    }
    case 'SET_TIME_RANGE': {
      const without = state.filters.filter((f) => f.type !== 'timerange');
      if (!action.start || !action.end) return { filters: without };
      return { filters: [...without, { type: 'timerange', start: action.start, end: action.end }] };
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

type Step = 'root' | 'user' | 'timerange';

interface DashboardFilterBarProps {
  filters: FilterState;
  dispatch: React.Dispatch<FilterAction>;
}

const AVATAR_BG = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-blue-500', 'bg-amber-500'];
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
  { step: 'timerange', label: 'Time Range', icon: <FiCalendar size={13} aria-hidden="true" /> },
  { step: 'user',      label: 'User',       icon: <FiUser size={13} aria-hidden="true" /> },
];

const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({ filters, dispatch }) => {
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
  const currentTimeRange = filters.filters.find(
    (f): f is { type: 'timerange'; start: string; end: string } => f.type === 'timerange',
  );

  const isUserActive = (id: string) =>
    filters.filters.some((f): f is { type: 'user'; value: string; label: string } => f.type === 'user' && f.value === id);

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
                      active={isUserActive(m.id)}
                      onToggle={() =>
                        dispatch({ type: 'TOGGLE_USER', value: m.id, label: m.name, avatarUrl: m.profileImageUrl })
                      }
                    />
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

export default DashboardFilterBar;
