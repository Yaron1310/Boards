import React, { useReducer, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiLayout, FiChevronDown, FiChevronRight, FiSearch,
  FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiGrid,
  FiHash, FiCalendar, FiType, FiList, FiCheckSquare, FiInfo, FiCheck,
} from 'react-icons/fi';
import {
  createInitialDemoState,
  DemoState, DemoColumn, DemoGroup, DemoItem, DemoStatusOption,
} from './demoData';

// ── Types ──────────────────────────────────────────────────────────────────

type DemoAction =
  | { type: 'SET_ACTIVE_BOARD'; boardId: string }
  | { type: 'UPDATE_ITEM_NAME'; itemId: string; name: string }
  | { type: 'UPDATE_CELL'; itemId: string; columnId: string; value: unknown }
  | { type: 'ADD_ITEM'; groupId: string; boardId: string }
  | { type: 'DELETE_ITEM'; itemId: string }
  | { type: 'ADD_GROUP'; boardId: string }
  | { type: 'DELETE_GROUP'; groupId: string }
  | { type: 'RENAME_GROUP'; groupId: string; name: string }
  | { type: 'TOGGLE_GROUP_COLLAPSE'; groupId: string }
  | { type: 'RENAME_BOARD'; boardId: string; name: string }
  | { type: 'SET_SEARCH'; text: string }
  | { type: 'SET_SORT'; columnId: string | null; direction: 'asc' | 'desc' };

interface StatusDropdownOverlay {
  itemId: string;
  columnId: string;
  type: 'status';
  options: DemoStatusOption[];
  x: number;
  y: number;
}

interface TextDropdownOverlay {
  itemId: string;
  columnId: string;
  type: 'dropdown';
  options: string[];
  x: number;
  y: number;
}

type DropdownOverlay = StatusDropdownOverlay | TextDropdownOverlay;

// ── Reducer ────────────────────────────────────────────────────────────────

let nextId = 1000;
function genId() { return `demo-${nextId++}`; }

const GROUP_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];

function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'SET_ACTIVE_BOARD':
      return { ...state, activeBoardId: action.boardId, searchText: '', sortConfig: null };

    case 'UPDATE_ITEM_NAME':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.itemId ? { ...item, name: action.name } : item
        ),
      };

    case 'UPDATE_CELL':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.itemId
            ? { ...item, values: { ...item.values, [action.columnId]: action.value } }
            : item
        ),
      };

    case 'ADD_ITEM': {
      const groupItems = state.items.filter(i => i.groupId === action.groupId);
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: genId(),
            boardId: action.boardId,
            groupId: action.groupId,
            name: 'New Item',
            order: groupItems.length,
            values: {},
          },
        ],
      };
    }

    case 'DELETE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.itemId) };

    case 'ADD_GROUP': {
      const boardGroups = state.groups.filter(g => g.boardId === action.boardId);
      return {
        ...state,
        groups: [
          ...state.groups,
          {
            id: genId(),
            boardId: action.boardId,
            name: 'New Group',
            color: GROUP_COLORS[boardGroups.length % GROUP_COLORS.length],
            isCollapsed: false,
            order: boardGroups.length,
          },
        ],
      };
    }

    case 'DELETE_GROUP':
      return {
        ...state,
        groups: state.groups.filter(g => g.id !== action.groupId),
        items: state.items.filter(i => i.groupId !== action.groupId),
      };

    case 'RENAME_GROUP':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.groupId ? { ...g, name: action.name } : g
        ),
      };

    case 'TOGGLE_GROUP_COLLAPSE':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.groupId ? { ...g, isCollapsed: !g.isCollapsed } : g
        ),
      };

    case 'RENAME_BOARD':
      return {
        ...state,
        boards: state.boards.map(b =>
          b.id === action.boardId ? { ...b, name: action.name } : b
        ),
      };

    case 'SET_SEARCH':
      return { ...state, searchText: action.text };

    case 'SET_SORT':
      return {
        ...state,
        sortConfig: action.columnId
          ? { columnId: action.columnId, direction: action.direction }
          : null,
      };

    default:
      return state;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const COLUMN_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <FiType size={12} aria-hidden="true" />,
  number: <FiHash size={12} aria-hidden="true" />,
  date: <FiCalendar size={12} aria-hidden="true" />,
  status: <FiList size={12} aria-hidden="true" />,
  dropdown: <FiList size={12} aria-hidden="true" />,
  checkbox: <FiCheckSquare size={12} aria-hidden="true" />,
};

// ── Sidebar ────────────────────────────────────────────────────────────────

interface SidebarProps {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
}

const DemoSidebar: React.FC<SidebarProps> = ({ state, dispatch }) => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>(
    () => Object.fromEntries(state.workspaces.map(ws => [ws.id, true]))
  );

  const toggleWorkspace = (id: string) =>
    setExpandedWorkspaces(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col h-full"
      style={{ backgroundColor: '#312e81' }}
      aria-label="Demo navigation sidebar"
    >
      {/* Logo */}
      <div className="p-6 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <FiGrid size={18} color="white" />
          </div>
          <span className="text-white font-bold text-xl">Logyx</span>
        </div>
      </div>

      {/* Demo badge */}
      <div className="mx-4 mb-3 px-3 py-1.5 bg-amber-500/90 rounded-lg flex items-center gap-2">
        <FiInfo size={13} color="white" aria-hidden="true" />
        <span className="text-white text-xs font-medium">Demo — resets on refresh</span>
      </div>

      {/* Nav links */}
      <div className="px-3 mb-3 space-y-0.5">
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Go to home page"
        >
          <FiGrid size={15} aria-hidden="true" />
          <span>Dashboard</span>
        </Link>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 cursor-default select-none"
          role="presentation"
          aria-hidden="true"
        >
          <FiLayout size={15} />
          <span>WorkHubs</span>
        </div>
      </div>

      <div className="mx-4 mb-2 border-t border-white/10" />

      {/* Workspaces + boards */}
      <div className="flex-1 overflow-y-auto px-3 space-y-3">
        {state.workspaces.map(ws => {
          const wsBoards = state.boards.filter(b => b.workspaceId === ws.id);
          const isExpanded = expandedWorkspaces[ws.id] ?? true;
          return (
            <div key={ws.id}>
              <button
                type="button"
                onClick={() => toggleWorkspace(ws.id)}
                className="flex items-center gap-1 w-full text-left px-2 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors"
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${ws.name}`}
              >
                {isExpanded
                  ? <FiChevronDown size={11} aria-hidden="true" />
                  : <FiChevronRight size={11} aria-hidden="true" />}
                <span>{ws.name}</span>
              </button>
              {isExpanded && (
                <ul role="list" aria-label={`${ws.name} boards`}>
                  {wsBoards.map(board => {
                    const isActive = state.activeBoardId === board.id;
                    return (
                      <li key={board.id} role="listitem">
                        <button
                          type="button"
                          onClick={() => dispatch({ type: 'SET_ACTIVE_BOARD', boardId: board.id })}
                          className={`flex items-center gap-2 w-full text-left px-5 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-white/15 text-white font-semibold'
                              : 'text-gray-300 hover:text-white hover:bg-white/10'
                          }`}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={`Open ${board.name} board`}
                        >
                          <FiLayout size={13} className="flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{board.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* User profile */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            aria-hidden="true"
          >
            DU
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">Demo User</p>
            <p className="text-gray-400 text-xs truncate">demo@example.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ── Cell ───────────────────────────────────────────────────────────────────

interface CellProps {
  column: DemoColumn;
  value: unknown;
  onSave: (value: unknown) => void;
  onOpenDropdown: (
    e: React.MouseEvent,
    type: 'status' | 'dropdown',
    options: DemoStatusOption[] | string[]
  ) => void;
}

const DemoCell: React.FC<CellProps> = ({ column, value, onSave, onOpenDropdown }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(String(value ?? ''));
    setEditing(true);
  };

  const commit = () => {
    if (column.type === 'number') {
      const n = parseFloat(draft);
      onSave(isNaN(n) ? null : n);
    } else {
      onSave(draft || null);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  };

  const cellStyle: React.CSSProperties = { width: column.width, minWidth: column.width, maxWidth: column.width };

  // Status
  if (column.type === 'status') {
    const opts = column.statusOptions ?? [];
    const opt = opts.find(o => o.id === value);
    return (
      <div style={cellStyle} className="flex-shrink-0 px-2 py-1 flex items-center border-r border-gray-100">
        <button
          type="button"
          onClick={(e) => onOpenDropdown(e, 'status', opts)}
          className="w-full text-left focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
          aria-label={`Status: ${opt?.label ?? 'None'}. Click to change`}
        >
          {opt ? (
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-medium w-full text-center truncate"
              style={{ backgroundColor: opt.color, color: getContrastColor(opt.color) }}
            >
              {opt.label}
            </span>
          ) : (
            <span className="text-gray-300 text-xs px-1">—</span>
          )}
        </button>
      </div>
    );
  }

  // Dropdown
  if (column.type === 'dropdown') {
    const val = value as string | undefined;
    return (
      <div style={cellStyle} className="flex-shrink-0 px-2 py-1 flex items-center border-r border-gray-100">
        <button
          type="button"
          onClick={(e) => onOpenDropdown(e, 'dropdown', column.dropdownOptions ?? [])}
          className="w-full text-left text-sm text-gray-700 hover:text-indigo-600 truncate focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
          aria-label={`${column.name}: ${val ?? 'None'}. Click to change`}
        >
          {val || <span className="text-gray-300">—</span>}
        </button>
      </div>
    );
  }

  // Checkbox
  if (column.type === 'checkbox') {
    return (
      <div style={cellStyle} className="flex-shrink-0 px-2 py-1 flex items-center justify-center border-r border-gray-100">
        <button
          type="button"
          role="checkbox"
          aria-checked={!!value}
          onClick={() => onSave(!value)}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
            value ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 hover:border-indigo-400'
          }`}
          aria-label={`${column.name}: ${value ? 'checked' : 'unchecked'}`}
        >
          {value && <FiCheck size={10} color="white" aria-hidden="true" />}
        </button>
      </div>
    );
  }

  // Date
  if (column.type === 'date') {
    if (editing) {
      return (
        <div style={cellStyle} className="flex-shrink-0 px-1 py-0.5 border-r border-gray-100">
          <input
            ref={inputRef}
            type="date"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="w-full text-sm border border-indigo-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label={`Edit ${column.name}`}
          />
        </div>
      );
    }
    return (
      <div style={cellStyle} className="flex-shrink-0 px-2 py-1 border-r border-gray-100">
        <button
          type="button"
          onClick={startEdit}
          className="w-full text-left text-sm text-gray-700 hover:text-indigo-600 truncate focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
          aria-label={`${column.name}: ${value ? formatDate(value as string) : 'None'}. Click to edit`}
        >
          {value ? formatDate(value as string) : <span className="text-gray-300">—</span>}
        </button>
      </div>
    );
  }

  // Text and Number
  const displayVal = column.type === 'number' && column.unit && value != null
    ? `${column.unit}${Number(value).toLocaleString()}`
    : String(value ?? '');

  if (editing) {
    return (
      <div style={cellStyle} className="flex-shrink-0 px-1 py-0.5 border-r border-gray-100">
        <input
          ref={inputRef}
          type={column.type === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-indigo-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          aria-label={`Edit ${column.name}`}
        />
      </div>
    );
  }

  return (
    <div style={cellStyle} className="flex-shrink-0 px-2 py-1 border-r border-gray-100">
      <button
        type="button"
        onClick={startEdit}
        className="w-full text-left text-sm text-gray-700 hover:text-indigo-600 truncate focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
        aria-label={`${column.name}: ${displayVal || 'Empty'}. Click to edit`}
      >
        {displayVal || <span className="text-gray-300">—</span>}
      </button>
    </div>
  );
};

// ── Item Row ───────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: DemoItem;
  columns: DemoColumn[];
  onUpdateName: (name: string) => void;
  onUpdateCell: (columnId: string, value: unknown) => void;
  onDelete: () => void;
  onOpenDropdown: (
    e: React.MouseEvent,
    itemId: string,
    columnId: string,
    type: 'status' | 'dropdown',
    options: DemoStatusOption[] | string[]
  ) => void;
}

const DemoItemRow: React.FC<ItemRowProps> = ({
  item, columns, onUpdateName, onUpdateCell, onDelete, onOpenDropdown,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [hovered, setHovered] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const startNameEdit = () => {
    setNameDraft(item.name);
    setEditingName(true);
  };

  const commitName = () => {
    if (nameDraft.trim()) onUpdateName(nameDraft.trim());
    setEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') setEditingName(false);
  };

  return (
    <div
      className={`flex border-b border-gray-100 transition-colors ${hovered ? 'bg-indigo-50/40' : 'bg-white'}`}
      role="row"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Item name — sticky left */}
      <div
        className="sticky left-0 z-10 bg-inherit flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-r border-gray-200"
        style={{ width: 280, minWidth: 280 }}
        role="rowheader"
      >
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            className="flex-1 text-sm border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Edit item name"
          />
        ) : (
          <button
            type="button"
            onClick={startNameEdit}
            className="flex-1 text-left text-sm text-gray-800 hover:text-indigo-600 truncate focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
            aria-label={`Item: ${item.name}. Click to rename`}
          >
            {item.name}
          </button>
        )}
        {hovered && !editingName && (
          <button
            type="button"
            onClick={onDelete}
            className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
            aria-label={`Delete ${item.name}`}
          >
            <FiTrash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Data cells */}
      {columns.map(col => (
        <DemoCell
          key={col.id}
          column={col}
          value={item.values[col.id]}
          onSave={(val) => onUpdateCell(col.id, val)}
          onOpenDropdown={(e, type, opts) => onOpenDropdown(e, item.id, col.id, type, opts)}
        />
      ))}
    </div>
  );
};

// ── Group Section ──────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: DemoGroup;
  items: DemoItem[];
  columns: DemoColumn[];
  boardId: string;
  searchText: string;
  sortConfig: DemoState['sortConfig'];
  dispatch: React.Dispatch<DemoAction>;
  onOpenDropdown: (
    e: React.MouseEvent,
    itemId: string,
    columnId: string,
    type: 'status' | 'dropdown',
    options: DemoStatusOption[] | string[]
  ) => void;
}

const DemoGroupSection: React.FC<GroupSectionProps> = ({
  group, items, columns, boardId, searchText, sortConfig, dispatch, onOpenDropdown,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const startNameEdit = () => {
    setNameDraft(group.name);
    setEditingName(true);
  };

  const commitName = () => {
    if (nameDraft.trim()) dispatch({ type: 'RENAME_GROUP', groupId: group.id, name: nameDraft.trim() });
    setEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitName();
    if (e.key === 'Escape') setEditingName(false);
  };

  let displayItems = items;
  if (searchText) {
    const q = searchText.toLowerCase();
    displayItems = items.filter(item =>
      item.name.toLowerCase().includes(q) ||
      Object.values(item.values).some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }

  if (sortConfig) {
    displayItems = [...displayItems].sort((a, b) => {
      const av = a.values[sortConfig.columnId];
      const bv = b.values[sortConfig.columnId];
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }

  return (
    <div className="mb-2" role="rowgroup" aria-label={group.name}>
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200"
        style={{ borderLeft: `4px solid ${group.color}` }}
      >
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_GROUP_COLLAPSE', groupId: group.id })}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          aria-expanded={!group.isCollapsed}
          aria-label={`${group.isCollapsed ? 'Expand' : 'Collapse'} ${group.name}`}
        >
          {group.isCollapsed
            ? <FiChevronRight size={15} aria-hidden="true" />
            : <FiChevronDown size={15} aria-hidden="true" />}
        </button>

        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={nameDraft}
            onChange={e => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            className="text-sm font-semibold border border-indigo-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            aria-label="Edit group name"
          />
        ) : (
          <button
            type="button"
            onClick={startNameEdit}
            className="text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
            aria-label={`Group: ${group.name}. Click to rename`}
          >
            {group.name}
          </button>
        )}

        <span className="text-xs text-gray-400">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {confirmDelete ? (
            <>
              <span className="text-xs text-gray-500 mr-1">Delete group?</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'DELETE_GROUP', groupId: group.id })}
                className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                aria-label="Confirm delete group"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                aria-label="Cancel delete group"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="p-1 text-gray-300 hover:text-red-400 transition-colors rounded"
              aria-label={`Delete group ${group.name}`}
            >
              <FiTrash2 size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      {!group.isCollapsed && (
        <>
          {displayItems.length === 0 && searchText ? (
            <div className="px-4 py-2 text-sm text-gray-400 italic border-b border-gray-100">
              No matching items
            </div>
          ) : (
            displayItems.map(item => (
              <DemoItemRow
                key={item.id}
                item={item}
                columns={columns}
                onUpdateName={(name) => dispatch({ type: 'UPDATE_ITEM_NAME', itemId: item.id, name })}
                onUpdateCell={(colId, val) => dispatch({ type: 'UPDATE_CELL', itemId: item.id, columnId: colId, value: val })}
                onDelete={() => dispatch({ type: 'DELETE_ITEM', itemId: item.id })}
                onOpenDropdown={onOpenDropdown}
              />
            ))
          )}
          {/* Add item */}
          <div
            className="flex items-center border-b border-gray-100 bg-white"
            style={{ borderLeft: `4px solid ${group.color}` }}
          >
            <button
              type="button"
              onClick={() => dispatch({ type: 'ADD_ITEM', groupId: group.id, boardId })}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-gray-400 hover:text-indigo-600 transition-colors"
              aria-label={`Add item to ${group.name}`}
            >
              <FiPlus size={13} aria-hidden="true" />
              <span>Add Item</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Column Headers ─────────────────────────────────────────────────────────

interface ColumnHeaderProps {
  columns: DemoColumn[];
  sortConfig: DemoState['sortConfig'];
  onSort: (columnId: string) => void;
}

const DemoColumnHeaders: React.FC<ColumnHeaderProps> = ({ columns, sortConfig, onSort }) => (
  <div className="flex border-b-2 border-gray-200 bg-gray-50 sticky top-0 z-20" role="row">
    <div
      className="sticky left-0 z-30 bg-gray-50 flex-shrink-0 flex items-center px-3 py-2 border-r border-gray-200"
      style={{ width: 280, minWidth: 280 }}
      role="columnheader"
    >
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Item Name</span>
    </div>
    {columns.map(col => {
      const isSorted = sortConfig?.columnId === col.id;
      const dir = sortConfig?.direction;
      return (
        <div
          key={col.id}
          className="flex-shrink-0 flex items-center gap-1.5 px-2 py-2 border-r border-gray-100"
          style={{ width: col.width, minWidth: col.width }}
          role="columnheader"
          aria-sort={isSorted ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <span className="text-gray-400 flex-shrink-0" aria-hidden="true">
            {COLUMN_TYPE_ICONS[col.type]}
          </span>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">
            {col.name}
          </span>
          <button
            type="button"
            onClick={() => onSort(col.id)}
            className={`ml-auto flex-shrink-0 p-0.5 rounded hover:bg-gray-200 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
              isSorted ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-500'
            }`}
            aria-label={`Sort by ${col.name} ${isSorted && dir === 'asc' ? 'descending' : 'ascending'}`}
          >
            {isSorted && dir === 'desc'
              ? <FiArrowDown size={11} aria-hidden="true" />
              : <FiArrowUp size={11} aria-hidden="true" />}
          </button>
        </div>
      );
    })}
  </div>
);

// ── Board View ─────────────────────────────────────────────────────────────

interface BoardViewProps {
  state: DemoState;
  dispatch: React.Dispatch<DemoAction>;
}

const DemoBoardView: React.FC<BoardViewProps> = ({ state, dispatch }) => {
  const [dropdownOverlay, setDropdownOverlay] = useState<DropdownOverlay | null>(null);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const boardNameInputRef = useRef<HTMLInputElement>(null);

  const board = state.boards.find(b => b.id === state.activeBoardId);
  const columns = state.columns.filter(c => c.boardId === state.activeBoardId);
  const groups = state.groups
    .filter(g => g.boardId === state.activeBoardId)
    .sort((a, b) => a.order - b.order);

  useEffect(() => {
    if (editingBoardName) boardNameInputRef.current?.focus();
  }, [editingBoardName]);

  // Reset board name editing when board changes
  useEffect(() => {
    setEditingBoardName(false);
  }, [state.activeBoardId]);

  const startBoardNameEdit = () => {
    setBoardNameDraft(board?.name ?? '');
    setEditingBoardName(true);
  };

  const commitBoardName = () => {
    if (boardNameDraft.trim() && board) {
      dispatch({ type: 'RENAME_BOARD', boardId: board.id, name: boardNameDraft.trim() });
    }
    setEditingBoardName(false);
  };

  const handleBoardNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitBoardName();
    if (e.key === 'Escape') setEditingBoardName(false);
  };

  const handleSort = (columnId: string) => {
    const current = state.sortConfig;
    if (!current || current.columnId !== columnId) {
      dispatch({ type: 'SET_SORT', columnId, direction: 'asc' });
    } else if (current.direction === 'asc') {
      dispatch({ type: 'SET_SORT', columnId, direction: 'desc' });
    } else {
      dispatch({ type: 'SET_SORT', columnId: null, direction: 'asc' });
    }
  };

  const handleOpenDropdown = (
    e: React.MouseEvent,
    itemId: string,
    columnId: string,
    type: 'status' | 'dropdown',
    options: DemoStatusOption[] | string[]
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (type === 'status') {
      setDropdownOverlay({ itemId, columnId, type, options: options as DemoStatusOption[], x: rect.left, y: rect.bottom + 4 });
    } else {
      setDropdownOverlay({ itemId, columnId, type, options: options as string[], x: rect.left, y: rect.bottom + 4 });
    }
  };

  const handleDropdownSelect = (value: string | null) => {
    if (!dropdownOverlay) return;
    dispatch({ type: 'UPDATE_CELL', itemId: dropdownOverlay.itemId, columnId: dropdownOverlay.columnId, value: value || null });
    setDropdownOverlay(null);
  };

  useEffect(() => {
    if (!dropdownOverlay) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-demo-dropdown]')) {
        setDropdownOverlay(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOverlay]);

  if (!board) return null;

  const totalWidth = 280 + columns.reduce((sum, c) => sum + c.width, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Board header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4 flex-wrap">
          {editingBoardName ? (
            <input
              ref={boardNameInputRef}
              type="text"
              value={boardNameDraft}
              onChange={e => setBoardNameDraft(e.target.value)}
              onBlur={commitBoardName}
              onKeyDown={handleBoardNameKeyDown}
              className="text-2xl font-bold text-gray-900 border border-indigo-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Edit board name"
            />
          ) : (
            <button
              type="button"
              onClick={startBoardNameEdit}
              className="text-2xl font-bold text-gray-900 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
              aria-label={`Board name: ${board.name}. Click to rename`}
            >
              {board.name}
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
            <FiSearch size={14} className="text-gray-400 flex-shrink-0" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search items..."
              value={state.searchText}
              onChange={e => dispatch({ type: 'SET_SEARCH', text: e.target.value })}
              className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-44"
              aria-label="Search items"
            />
          </div>
        </div>
      </div>

      {/* Board body */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          <DemoColumnHeaders
            columns={columns}
            sortConfig={state.sortConfig}
            onSort={handleSort}
          />

          <div role="rowgroup">
            {groups.map(group => (
              <DemoGroupSection
                key={group.id}
                group={group}
                items={state.items.filter(i => i.groupId === group.id)}
                columns={columns}
                boardId={board.id}
                searchText={state.searchText}
                sortConfig={state.sortConfig}
                dispatch={dispatch}
                onOpenDropdown={handleOpenDropdown}
              />
            ))}
          </div>

          {/* Add group */}
          <div className="px-4 py-4">
            <button
              type="button"
              onClick={() => dispatch({ type: 'ADD_GROUP', boardId: board.id })}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-indigo-600 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
              aria-label="Add new group"
            >
              <FiPlus size={14} aria-hidden="true" />
              <span>Add Group</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown overlay — rendered at fixed position to escape overflow */}
      {dropdownOverlay && (
        <div
          data-demo-dropdown
          role="menu"
          aria-label="Select option"
          style={{
            position: 'fixed',
            top: Math.min(dropdownOverlay.y, window.innerHeight - 200),
            left: Math.min(dropdownOverlay.x, window.innerWidth - 180),
            zIndex: 9999,
          }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36"
        >
          {dropdownOverlay.type === 'status'
            ? (dropdownOverlay.options as DemoStatusOption[]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleDropdownSelect(opt.id)}
                  className="flex items-center w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label={`Set status to ${opt.label}`}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2.5 flex-shrink-0"
                    style={{ backgroundColor: opt.color }}
                    aria-hidden="true"
                  />
                  {opt.label}
                </button>
              ))
            : (dropdownOverlay.options as string[]).map(opt => (
                <button
                  key={opt}
                  type="button"
                  role="menuitem"
                  onClick={() => handleDropdownSelect(opt)}
                  className="flex items-center w-full px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  aria-label={`Select ${opt}`}
                >
                  {opt}
                </button>
              ))
          }
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => handleDropdownSelect(null)}
              className="w-full px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 text-left transition-colors"
              aria-label="Clear value"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────

const DemoBoardPage: React.FC = () => {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);

  return (
    <div className="flex h-screen overflow-hidden" aria-label="Demo board application">
      <DemoSidebar state={state} dispatch={dispatch} />
      <DemoBoardView state={state} dispatch={dispatch} />
    </div>
  );
};

export default DemoBoardPage;
