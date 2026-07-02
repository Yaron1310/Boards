import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiFilter, FiChevronLeft, FiCalendar, FiUser, FiCheck } from 'react-icons/fi';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import type { Item, User } from '../../types';

export type PersonalHubActiveFilter =
  | { type: 'user'; value: string; label: string }
  | { type: 'date'; value: string };

interface Props {
  items: Item[];
  activeFilters: PersonalHubActiveFilter[];
  onFilterChange: (filters: PersonalHubActiveFilter[]) => void;
}

type Step = 'root' | 'user' | 'date';

const AVATAR_BG = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-blue-500', 'bg-amber-500', 'bg-rose-500'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

const SubHeader: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100">
    <button type="button" onClick={onBack} className="text-gray-400 hover:text-gray-600 p-0.5 rounded" aria-label="Back to filter options">
      <FiChevronLeft size={14} aria-hidden="true" />
    </button>
    <span className="text-xs font-semibold text-gray-600">{label}</span>
  </div>
);

/**
 * Filters across every board in the Personal Hub using only fields every
 * item has regardless of source board: assignees and due date.
 */
const PersonalHubFilterDropdown: React.FC<Props> = ({ items, activeFilters, onFilterChange }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('root');
  const ref = useRef<HTMLDivElement>(null);
  const { data: allUsers = [] } = useUsersQuery({ limit: 200 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setStep('root'); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const availableUsers = useMemo<User[]>(() => {
    const ids = new Set<string>();
    for (const item of items) for (const id of item.assignees ?? []) ids.add(id);
    return allUsers.filter((u) => ids.has(u.id));
  }, [items, allUsers]);

  const isFilterActive = (type: string, value: string) => activeFilters.some((f) => f.type === type && f.value === value);
  const hasTypeActive = (type: string) => activeFilters.some((f) => f.type === type);

  const toggleUser = (u: User) => {
    if (isFilterActive('user', u.id)) {
      onFilterChange(activeFilters.filter((f) => !(f.type === 'user' && f.value === u.id)));
    } else {
      onFilterChange([...activeFilters, { type: 'user', value: u.id, label: u.name }]);
    }
  };

  const currentDate = activeFilters.find((f): f is { type: 'date'; value: string } => f.type === 'date')?.value ?? '';
  const setDateFilter = (date: string) => {
    const without = activeFilters.filter((f) => f.type !== 'date');
    onFilterChange(date ? [...without, { type: 'date', value: date }] : without);
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setStep('root'); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          activeFilters.length > 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
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
              <button type="button" role="menuitem" onClick={() => setStep('user')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                <FiUser size={13} className="text-gray-400" aria-hidden="true" />
                <span className="flex-1 text-left">Assignee</span>
                {hasTypeActive('user') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" aria-hidden="true" />}
              </button>
              <button type="button" role="menuitem" onClick={() => setStep('date')} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                <FiCalendar size={13} className="text-gray-400" aria-hidden="true" />
                <span className="flex-1 text-left">Due date</span>
                {hasTypeActive('date') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" aria-hidden="true" />}
              </button>
            </>
          )}

          {step === 'user' && (
            <>
              <SubHeader label="Assignee" onBack={() => setStep('root')} />
              <div className="max-h-52 overflow-y-auto">
                {availableUsers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No other assignees found</p>
                ) : (
                  availableUsers.map((u) => {
                    const active = isFilterActive('user', u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="menuitem"
                        onClick={() => toggleUser(u)}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white font-medium flex-shrink-0 ${avatarColor(u.id)}`}>
                          {u.name?.[0]?.toUpperCase() ?? '?'}
                        </span>
                        <span className="flex-1 text-left truncate">{u.name}</span>
                        {active && <FiCheck size={11} className="text-indigo-600 flex-shrink-0" aria-hidden="true" />}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          {step === 'date' && (
            <>
              <SubHeader label="Due date" onBack={() => setStep('root')} />
              <div className="px-3 py-2">
                <input
                  type="date"
                  autoFocus
                  value={currentDate}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Select due date to filter by"
                />
                {currentDate && (
                  <button type="button" onClick={() => setDateFilter('')} className="mt-1.5 w-full text-xs text-gray-400 hover:text-red-500 transition-colors">
                    Clear due date filter
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PersonalHubFilterDropdown;
