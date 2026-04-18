import React, { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { useBoards } from '../../hooks/queries/useBoardQueries';
import { getUsers } from '../../services/geminiService';
import type { DashboardParams } from '../../types';

// ---------------------------------------------------------------------------
// Filter state types — exported so DashboardPage can share the same shape
// ---------------------------------------------------------------------------

export interface FilterState {
  workspaceId: string;
  boardIds: string[];
  assigneeId: string;
  dueDateFrom: string;
  dueDateTo: string;
}

export const INITIAL_FILTER_STATE: FilterState = {
  workspaceId: '',
  boardIds: [],
  assigneeId: '',
  dueDateFrom: '',
  dueDateTo: '',
};

export type FilterAction =
  | { type: 'SET_WORKSPACE'; workspaceId: string }
  | { type: 'TOGGLE_BOARD'; boardId: string }
  | { type: 'SET_ASSIGNEE'; assigneeId: string }
  | { type: 'SET_DATE_FROM'; value: string }
  | { type: 'SET_DATE_TO'; value: string }
  | { type: 'CLEAR' };

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_WORKSPACE':
      return { ...state, workspaceId: action.workspaceId, boardIds: [], assigneeId: '' };
    case 'TOGGLE_BOARD': {
      const current = state.boardIds;
      const next = current.includes(action.boardId)
        ? current.filter(id => id !== action.boardId)
        : [...current, action.boardId];
      return { ...state, boardIds: next };
    }
    case 'SET_ASSIGNEE':
      return { ...state, assigneeId: action.assigneeId };
    case 'SET_DATE_FROM':
      return { ...state, dueDateFrom: action.value };
    case 'SET_DATE_TO':
      return { ...state, dueDateTo: action.value };
    case 'CLEAR':
      return INITIAL_FILTER_STATE;
    default:
      return state;
  }
}

/** Derive the API params from the internal filter state. */
export function toDashboardParams(filters: FilterState): DashboardParams {
  const params: DashboardParams = {};
  if (filters.workspaceId) params.workspaceId = filters.workspaceId;
  if (filters.boardIds.length > 0) params.boardIds = filters.boardIds;
  if (filters.assigneeId) params.assigneeId = filters.assigneeId;
  if (filters.dueDateFrom) params.dueDateFrom = filters.dueDateFrom;
  if (filters.dueDateTo) params.dueDateTo = filters.dueDateTo;
  return params;
}

// ---------------------------------------------------------------------------
// Board multi-select dropdown (internal helper)
// ---------------------------------------------------------------------------

interface BoardMultiSelectProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
  workspaceId: string;
  disabled: boolean;
}

const BoardMultiSelect: React.FC<BoardMultiSelectProps> = ({
  selectedIds,
  onToggle,
  workspaceId,
  disabled,
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: boards = [] } = useBoards(workspaceId, false, !!workspaceId && !disabled);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const label =
    selectedIds.length === 0
      ? 'All Boards'
      : selectedIds.length === 1
      ? boards.find(b => b.id === selectedIds[0])?.name ?? '1 board'
      : `${selectedIds.length} boards`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select boards"
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 shadow-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[130px]"
      >
        <span className="truncate">{label}</span>
        <svg
          className="w-4 h-4 text-gray-400 ml-auto shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && boards.length > 0 && (
        <ul
          role="listbox"
          aria-label="Available boards"
          aria-multiselectable="true"
          className="absolute z-10 mt-1 w-56 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {boards.map(board => {
            const checked = selectedIds.includes(board.id);
            return (
              <li
                key={board.id}
                role="option"
                aria-selected={checked}
              >
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(board.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={board.name}
                  />
                  <span className="truncate">{board.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {open && boards.length === 0 && (
        <div
          className="absolute z-10 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg px-3 py-2 text-sm text-gray-400"
          role="status"
        >
          No boards in this workspace
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DashboardFilterBar
// ---------------------------------------------------------------------------

interface DashboardFilterBarProps {
  filters: FilterState;
  dispatch: React.Dispatch<FilterAction>;
}

const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({ filters, dispatch }) => {
  const { user } = useAuth();
  const workspaces = user?.workspaces ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users', 'workspace', filters.workspaceId],
    queryFn: () => getUsers({ workspaceId: filters.workspaceId, limit: 100 }),
    enabled: !!filters.workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const members = usersData?.data ?? [];

  const hasActiveFilters =
    !!filters.workspaceId ||
    filters.boardIds.length > 0 ||
    !!filters.assigneeId ||
    !!filters.dueDateFrom ||
    !!filters.dueDateTo;

  return (
    <div
      className="flex flex-wrap gap-3 items-end p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
      role="search"
      aria-label="Dashboard filters"
    >
      {/* Workspace selector */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-workspace"
          className="text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          Workspace
        </label>
        <select
          id="filter-workspace"
          value={filters.workspaceId}
          onChange={e => dispatch({ type: 'SET_WORKSPACE', workspaceId: e.target.value })}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[150px]"
          aria-label="Select workspace"
        >
          <option value="">All Workspaces</option>
          {workspaces.map(ws => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
      </div>

      {/* Board multi-select */}
      <div className="flex flex-col gap-1">
        <span
          className="text-xs font-medium text-gray-500 uppercase tracking-wide"
          id="filter-boards-label"
        >
          Boards
        </span>
        <BoardMultiSelect
          selectedIds={filters.boardIds}
          onToggle={boardId => dispatch({ type: 'TOGGLE_BOARD', boardId })}
          workspaceId={filters.workspaceId}
          disabled={!filters.workspaceId}
        />
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-date-from"
          className="text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          Due From
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={filters.dueDateFrom}
          onChange={e => dispatch({ type: 'SET_DATE_FROM', value: e.target.value })}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Due date from"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-date-to"
          className="text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          Due To
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={filters.dueDateTo}
          min={filters.dueDateFrom || undefined}
          onChange={e => dispatch({ type: 'SET_DATE_TO', value: e.target.value })}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Due date to"
        />
      </div>

      {/* Assignee selector */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-assignee"
          className="text-xs font-medium text-gray-500 uppercase tracking-wide"
        >
          Assignee
        </label>
        <select
          id="filter-assignee"
          value={filters.assigneeId}
          onChange={e => dispatch({ type: 'SET_ASSIGNEE', assigneeId: e.target.value })}
          disabled={!filters.workspaceId}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
          aria-label="Filter by assignee"
        >
          <option value="">All Assignees</option>
          {members.map(member => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      {/* Clear button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR' })}
          className="h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors self-end"
          aria-label="Clear all filters"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};

export default DashboardFilterBar;
