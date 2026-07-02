import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { FiLoader, FiUser, FiUsers, FiPlus, FiSearch, FiX, FiUpload, FiList } from 'react-icons/fi';
import { useAuthSession } from '../../hooks/useAuthSession';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { useItems } from '../../hooks/queries/useItemQueries';
import { useBoard } from '../../hooks/queries/useBoardQueries';
import { useColumns } from '../../hooks/queries/useColumnQueries';
import { BoardRenderProvider } from '../../contexts/BoardRenderContext';
import type { BoardView } from '../../contexts/BoardRenderContext';
import { DependencyProvider } from '../../contexts/DependencyContext';
import { FormulaEditProvider } from '../../contexts/FormulaEditContext';
import { UndoProvider } from '../../contexts/UndoContext';
import { UserRole, ColumnType } from '../../types';
import type { Item, Group } from '../../types';
import PersonalHubBoardGroup from './PersonalHubBoardGroup';
import PersonalHubFilterDropdown from './PersonalHubFilterDropdown';
import type { PersonalHubActiveFilter } from './PersonalHubFilterDropdown';
import GanttView from '../boards/GanttView';
import BoardDashboardView from '../boards/BoardDashboardView';
import ItemDetailPanel from '../boards/ItemDetailPanel';
import ItemChatModal from '../boards/ItemChatModal';
import UndoButton from '../boards/UndoButton';
import AddColumnModal from '../boards/AddColumnModal';
import PersonalColumnHeaderCell from './PersonalColumnHeaderCell';
import { COLUMN_TYPE_ICONS } from '../boards/ColumnHeader';
import { usePersonalColumns } from '../../hooks/queries/usePersonalHubQueries';
import { PERSONAL_COL_WIDTH } from './constants';
import { exportPersonalHubToXlsx } from '../../utils/exportPersonalHubToXlsx';
import type { PersonalGridContext } from './cells/types';

type ViewMode = 'table' | 'rows' | 'gantt' | 'dashboard';

/** Renders the Gantt swimlane for a single board's assigned items, using the board name as the group label. */
const PersonalHubGanttBoard: React.FC<{ boardId: string; items: Item[] }> = ({ boardId, items }) => {
  const { data: board } = useBoard(boardId);
  const { data: columns = [] } = useColumns(boardId);
  const hasTimeRange = columns.some((c) => c.type === ColumnType.TIME_RANGE);
  if (!board || !hasTimeRange) return null;

  const pseudoGroup: Group = {
    id: boardId,
    workspaceId: board.workspaceId,
    boardId,
    name: board.name,
    order: 0,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };

  return (
    <div className="flex flex-col mb-6 min-h-[220px]" aria-label={`Gantt for board ${board.name}`}>
      <h2 className="text-lg font-bold text-indigo-700 px-4 pt-4">{board.name}</h2>
      <div className="relative flex-1 min-h-[180px]">
        <GanttView
          groups={[pseudoGroup]}
          itemsByGroup={{ [boardId]: items }}
          columns={columns}
          onItemUpdate={() => {}}
        />
      </div>
    </div>
  );
};

/** Invisible — just resolves a board's name for the export button, independent of which view is active. */
const BoardNameResolver: React.FC<{ boardId: string; onResolved: (boardId: string, name: string) => void }> = ({ boardId, onResolved }) => {
  const { data: board } = useBoard(boardId);
  React.useEffect(() => {
    if (board) onResolved(boardId, board.name);
  }, [board, boardId, onResolved]);
  return null;
};

const FilterChip: React.FC<{ filter: PersonalHubActiveFilter; onRemove: () => void }> = ({ filter, onRemove }) => {
  const label = filter.type === 'date' ? filter.value : filter.label;
  return (
    <div className="flex items-center gap-1 pl-2 pr-1 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
      <span className="max-w-[90px] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-indigo-400 hover:text-indigo-700 flex-shrink-0 p-0.5 rounded-full hover:bg-indigo-200 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <FiX size={10} aria-hidden="true" />
      </button>
    </div>
  );
};

const PersonalHubPageInner: React.FC = () => {
  const { userId: routeUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuthSession();

  const targetUserId = routeUserId || authUser?.id || '';
  const isOwn = !routeUserId || targetUserId === authUser?.id;
  const isOrgAdmin = authUser?.role === UserRole.ORGANIZATION_ADMIN || authUser?.role === UserRole.SYSTEM_ADMIN;

  const { data: allUsers = [] } = useUsersQuery({ limit: 200 });
  const targetUser = isOwn ? authUser : allUsers.find((u) => u.id === targetUserId);

  const { data: allPersonalColumns = [] } = usePersonalColumns();
  const crossGroupColumns = useMemo(() => allPersonalColumns.filter((c) => c.scope === 'all'), [allPersonalColumns]);

  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [chatItem, setChatItem] = useState<Item | null>(null);
  const [dashboardBoardId, setDashboardBoardId] = useState<string>('');
  const [showAddCrossGroupColumn, setShowAddCrossGroupColumn] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [activeFilters, setActiveFilters] = useState<PersonalHubActiveFilter[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [boardNames, setBoardNames] = useState<Record<string, string>>({});

  const registerBoardName = React.useCallback((boardId: string, name: string) => {
    setBoardNames((prev) => (prev[boardId] === name ? prev : { ...prev, [boardId]: name }));
  }, []);

  // Each board group reports its resolved rows + personal values here so cross-group
  // ("all groups") Simple Formula columns can address a Number cell in ANY group's
  // table, not just their own — matching the real board's any-cell addressing.
  const [rowsByBoard, setRowsByBoard] = useState<Record<string, string[]>>({});
  const [valuesByBoard, setValuesByBoard] = useState<Record<string, Record<string, Record<string, unknown>>>>({});

  const handleRowsResolved = React.useCallback(
    (boardId: string, itemIds: string[], values: Record<string, Record<string, unknown>>) => {
      setRowsByBoard((prev) => (prev[boardId]?.join(',') === itemIds.join(',') ? prev : { ...prev, [boardId]: itemIds }));
      setValuesByBoard((prev) => (prev[boardId] === values ? prev : { ...prev, [boardId]: values }));
    },
    [],
  );

  const { data: itemsPage, isLoading } = useItems(
    { assignee: targetUserId, limit: 500 },
    !!targetUserId && (isOwn || isOrgAdmin),
  );
  const items = useMemo(() => itemsPage?.data ?? [], [itemsPage]);

  const displayItems = useMemo(() => {
    const userFilters = activeFilters.filter((f): f is { type: 'user'; value: string; label: string } => f.type === 'user');
    const dateFilter = activeFilters.find((f): f is { type: 'date'; value: string } => f.type === 'date');
    const search = searchText.trim().toLowerCase();
    return items.filter((item) => {
      if (search && !item.name.toLowerCase().includes(search)) return false;
      if (userFilters.length > 0 && !userFilters.some((f) => (item.assignees ?? []).includes(f.value))) return false;
      if (dateFilter) {
        if (!item.dueDate) return false;
        const due = new Date(item.dueDate).toISOString().slice(0, 10);
        if (due !== dateFilter.value) return false;
      }
      return true;
    });
  }, [items, searchText, activeFilters]);

  const itemsByBoard = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const item of displayItems) {
      (map[item.boardId] ??= []).push(item);
    }
    return map;
  }, [displayItems]);

  const boardIds = Object.keys(itemsByBoard);
  const allBoardIds = useMemo(() => [...new Set(items.map((i) => i.boardId))], [items]);

  const pageCrossGroupGridContext = useMemo<PersonalGridContext>(() => {
    const rowOrder = boardIds.flatMap((id) => rowsByBoard[id] ?? []);
    const valuesByItem = boardIds.reduce<Record<string, Record<string, unknown>>>((acc, id) => {
      Object.assign(acc, valuesByBoard[id]);
      return acc;
    }, {});
    return { rowOrder, columns: crossGroupColumns, valuesByItem };
  }, [boardIds, rowsByBoard, valuesByBoard, crossGroupColumns]);

  React.useEffect(() => {
    if (!dashboardBoardId && boardIds.length > 0) setDashboardBoardId(boardIds[0]);
  }, [boardIds, dashboardBoardId]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportPersonalHubToXlsx(
        isOwn ? 'Personal Hub' : `Personal Hub — ${targetUser?.name ?? 'User'}`,
        itemsByBoard,
        boardNames,
        allUsers,
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!authUser) return null;

  if (!isOwn && !isOrgAdmin) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {allBoardIds.map((boardId) => (
        <BoardNameResolver key={boardId} boardId={boardId} onResolved={registerBoardName} />
      ))}

      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <FiUser size={20} className="text-indigo-600 flex-shrink-0" aria-hidden="true" />
        <h1 className="text-xl font-bold text-gray-800 flex-shrink-0">
          {isOwn ? 'Personal Hub' : `Personal Hub — ${targetUser?.name ?? 'User'}`}
        </h1>

        {/* Search + filter row */}
        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
          <div className="relative">
            <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search items…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-44 pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              aria-label="Search items by name"
            />
          </div>

          <PersonalHubFilterDropdown items={items} activeFilters={activeFilters} onFilterChange={setActiveFilters} />

          {activeFilters.map((f, i) => (
            <FilterChip
              key={`${f.type}-${i}`}
              filter={f}
              onRemove={() => setActiveFilters((prev) => prev.filter((x) => x !== f))}
            />
          ))}

          {(searchText.trim() !== '' || activeFilters.length > 0) && (
            <button
              type="button"
              onClick={() => { setSearchText(''); setActiveFilters([]); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors flex-shrink-0"
              aria-label="Clear all filters and search"
            >
              <FiX size={11} aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View switcher — icon toggle group, styled identically to a board's view switcher */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden" role="group" aria-label="Personal Hub view">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center justify-center px-2.5 py-1.5 transition-colors ${viewMode === 'table' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
              title="Table"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                <rect x="1" y="1" width="12" height="12" rx="1" />
                <line x1="5" y1="1" x2="5" y2="13" />
                <line x1="9" y1="1" x2="9" y2="13" />
                <line x1="1" y1="5" x2="13" y2="5" />
                <line x1="1" y1="9" x2="13" y2="9" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('rows')}
              className={`flex items-center justify-center px-2.5 py-1.5 border-l border-gray-300 transition-colors ${viewMode === 'rows' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              aria-label="Rows view"
              aria-pressed={viewMode === 'rows'}
              title="Rows"
            >
              <FiList size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gantt')}
              className={`flex items-center justify-center px-2.5 py-1.5 border-l border-gray-300 transition-colors ${viewMode === 'gantt' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              aria-label="Gantt view"
              aria-pressed={viewMode === 'gantt'}
              title="Gantt"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="1" y="2" width="7" height="2.5" rx="0.8" />
                <rect x="4" y="6" width="8" height="2.5" rx="0.8" />
                <rect x="2" y="10" width="5" height="2.5" rx="0.8" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center justify-center px-2.5 py-1.5 border-l border-gray-300 transition-colors ${viewMode === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
              aria-label="Dashboard view"
              aria-pressed={viewMode === 'dashboard'}
              title="Dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M14 2.25A10 10 0 0 1 22 10h-8V2.25z" opacity="0.5" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Export Personal Hub items to Excel file"
          >
            <FiUpload size={13} aria-hidden="true" />
            {isExporting ? 'Exporting…' : 'Export'}
          </button>

          <UndoButton />
        </div>
      </div>

      <div className="flex-1 relative min-h-0 flex flex-col">
      <div className="absolute inset-y-0 left-0 w-4 bg-gray-100 z-[20] pointer-events-none" aria-hidden="true" />

      {isLoading ? (
        <div className="flex justify-center items-center h-64" role="status" aria-label="Loading assigned items">
          <FiLoader className="animate-spin h-8 w-8 text-indigo-600" aria-hidden="true" />
        </div>
      ) : boardIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
          <FiUsers size={32} aria-hidden="true" />
          <p className="text-sm">
            {items.length === 0
              ? `No items are currently assigned to ${isOwn ? 'you' : (targetUser?.name ?? 'this user')}.`
              : 'No items match your search/filters.'}
          </p>
        </div>
      ) : viewMode === 'table' || viewMode === 'rows' ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto" role="region" aria-label="Assigned items by board">
          {/* Page-level header — this is the ONLY place cross-group personal columns are
              managed (rename/settings/reorder/delete); each group below shows their
              names too for alignment, but read-only — their own source-board columns
              are never editable here. */}
          <div className="sticky top-0 z-[3] flex items-center bg-gray-50/95 backdrop-blur-sm border-b border-[#d2d2d4]" role="row" aria-label="Personal Hub column controls">
            <div className="w-[282px] flex-shrink-0 px-4 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-gray-600 sticky left-0 z-[1] bg-gray-50/95">
              Item
            </div>
            {crossGroupColumns.map((col) => (
              isOwn
                ? <PersonalColumnHeaderCell key={col.id} column={col} />
                : (
                  <div
                    key={col.id}
                    role="columnheader"
                    style={{ width: `${PERSONAL_COL_WIDTH}px` }}
                    className="flex flex-shrink-0 items-center justify-center gap-1.5 px-2 py-2 border-r border-[#d2d2d4] text-sm font-semibold text-indigo-600 bg-indigo-50/50"
                    title={`${col.name} (personal column)`}
                  >
                    <span className="text-indigo-400 flex-shrink-0">{COLUMN_TYPE_ICONS[col.type]}</span>
                    <span className="truncate">{col.name}</span>
                  </div>
                )
            ))}
            {isOwn && (
              <button
                type="button"
                onClick={() => setShowAddCrossGroupColumn(true)}
                className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-indigo-600 hover:bg-indigo-100 rounded transition-colors flex-shrink-0"
                aria-label="Add a personal column to every group"
                title="Add column to all groups"
              >
                <FiPlus size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="px-4 pb-4 space-y-4">
            <FormulaEditProvider>
              {boardIds.map((boardId) => (
                <PersonalHubBoardGroup
                  key={boardId}
                  boardId={boardId}
                  items={itemsByBoard[boardId]}
                  isOwn={isOwn}
                  boardView={viewMode as BoardView}
                  onOpenDetail={setDetailItem}
                  onOpenChat={setChatItem}
                  onBoardResolved={registerBoardName}
                  crossGroupGridContext={pageCrossGroupGridContext}
                  onRowsResolved={handleRowsResolved}
                />
              ))}
            </FormulaEditProvider>
          </div>
        </div>
      ) : viewMode === 'gantt' ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto" role="region" aria-label="Assigned items timeline">
          {boardIds.map((boardId) => (
            <PersonalHubGanttBoard key={boardId} boardId={boardId} items={itemsByBoard[boardId]} />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-shrink-0 px-6 py-2 border-b border-gray-100 bg-white flex items-center gap-2">
            <label htmlFor="personal-hub-dashboard-board" className="text-sm text-gray-500">
              Board:
            </label>
            <select
              id="personal-hub-dashboard-board"
              value={dashboardBoardId}
              onChange={(e) => setDashboardBoardId(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
              aria-label="Select board for dashboard widgets"
            >
              {boardIds.map((boardId) => (
                <option key={boardId} value={boardId}>{boardNames[boardId] ?? boardId}</option>
              ))}
            </select>
          </div>
          {dashboardBoardId && (
            <BoardDashboardView boardId={dashboardBoardId} boardName="" isAdmin={isOwn} />
          )}
        </div>
      )}
      </div>

      {detailItem && (
        <DependencyProvider items={items}>
          <BoardRenderProvider visibleItems={items} columns={[]} openChat={setChatItem}>
            <ItemDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />
          </BoardRenderProvider>
        </DependencyProvider>
      )}

      {chatItem && createPortal(
        <ItemChatModal item={chatItem} onClose={() => setChatItem(null)} />,
        document.body,
      )}

      {showAddCrossGroupColumn && (
        <AddColumnModal mode="personal" personalScope="all" onClose={() => setShowAddCrossGroupColumn(false)} />
      )}
    </div>
  );
};

const PersonalHubPage: React.FC = () => (
  <UndoProvider>
    <PersonalHubPageInner />
  </UndoProvider>
);

export default PersonalHubPage;
