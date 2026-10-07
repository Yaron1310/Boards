import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useQueries } from '@tanstack/react-query';
import { FiChevronRight, FiLoader, FiSearch, FiUsers } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { useFormulaRecording } from '../../contexts/FormulaRecordingContext';
import { useUsersQuery } from '../../hooks/queries/useUserQueries';
import { useItems } from '../../hooks/queries/useItemQueries';
import { usePersonalColumns } from '../../hooks/queries/usePersonalHubQueries';
import { useForeignCellValues } from '../../hooks/queries/useForeignCellValues';
import { queryKeys } from '../../hooks/queries/queryKeys';
import * as wm from '../../services/workManagementService';
import { hubDisplayRows } from '../../utils/personalHubGrid';
import { formatGroupedNumber } from '../../utils/numberFormat';
import { namesMatchByWords } from '../../utils/nameMatch';
import { serializeRef, type CellRef, type SummaryCalc } from '../../utils/formulaEngine';
import { ColumnType, UserRole } from '../../types';
import type { Board, Group, Item, PersonalColumn, User } from '../../types';

/** Same page size the Personal Hub page loads a user's assigned items with — sharing the query
 *  key means a hub that was already opened costs nothing here, and vice versa. */
const HUB_ITEMS_LIMIT = 500;

/** Personal column types a hub cell can be clicked into a formula from (see PersonalNumberCell /
 *  PersonalHoursLogCell) — the menu offers exactly what clicking in the hub would. */
const INSERTABLE_TYPES = new Set<ColumnType>([ColumnType.NUMBER, ColumnType.HOURS_LOG]);

const CALC_LABEL: Record<string, string> = {
  sum: 'Sum', avg: 'Average', median: 'Median', min: 'Min', max: 'Max', count: 'Count',
};

const formatValue = (v: number | null | undefined): string =>
  v === undefined ? '…' : v === null ? '—' : formatGroupedNumber(v, 2);

interface MenuEntry {
  key: string;
  label: string;
  ref: CellRef;
  isTotal?: boolean;
}

interface ColumnSection {
  column: PersonalColumn;
  entries: MenuEntry[];
}

interface BoardSection {
  board: Board;
  columns: ColumnSection[];
}

/**
 * The submenu for one user: every value in their Personal Hub's template columns, limited to the
 * hub group (= source board) whose name matches the recorded item's name. Each entry inserts the
 * very reference clicking that cell (or the group's summary cell) in their hub would insert.
 */
const UserHubValuesPanel: React.FC<{
  user: User;
  itemName: string;
  currentItemId: string;
  orgId: string | undefined;
  onPick: (ref: CellRef) => void;
}> = ({ user, itemName, currentItemId, orgId, onPick }) => {
  const { user: authUser } = useAuth();
  const viewerId = (authUser as { id?: string } | null | undefined)?.id;
  // Cells in your own hub record no owner (see PersonalNumberCell), so neither does this.
  const ownerId = user.id === viewerId ? undefined : user.id;

  const { data: itemsPage, isLoading: itemsLoading } = useItems({ assignee: user.id, limit: HUB_ITEMS_LIMIT });
  const assigned = useMemo(() => itemsPage?.data ?? [], [itemsPage]);
  const { data: personalColumns = [], isLoading: columnsLoading } = usePersonalColumns(ownerId);

  const boardIds = useMemo(() => [...new Set(assigned.map((i) => i.boardId))].sort(), [assigned]);
  const boardQueries = useQueries({
    queries: boardIds.map((id) => ({
      queryKey: queryKeys.boards.one(id),
      queryFn: () => wm.getBoard(id),
      staleTime: 2 * 60 * 1000,
      retry: false,
    })),
  });
  const boardsLoading = boardQueries.some((q) => q.isLoading);
  const matchedBoards = useMemo(
    () => boardQueries
      .map((q) => q.data as Board | undefined)
      .filter((b): b is Board => !!b && namesMatchByWords(b.name, itemName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardQueries.map((q) => q.data?.id ?? '').join(','), itemName],
  );

  // A hub row is not always the assigned item itself: an assigned subitem is shown as the item
  // hosting it. Which group belongs to a parent item tells the two apart — same as the Hub.
  const groupQueries = useQueries({
    queries: matchedBoards.map((b) => ({
      queryKey: queryKeys.groups.all(b.id),
      queryFn: () => wm.listGroups(b.id, false),
      staleTime: 2 * 60 * 1000,
    })),
  });
  const groupsLoading = groupQueries.some((q) => q.isLoading);
  const parentByGroup = useMemo(() => {
    const m = new Map<string, string>();
    matchedBoards.forEach((b, i) => {
      ((groupQueries[i]?.data as Group[] | undefined) ?? []).forEach((g) => {
        if (g.parentItemId) m.set(`${b.id}:${g.id}`, g.parentItemId);
      });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedBoards, groupQueries.map((q) => q.dataUpdatedAt).join(',')]);

  const matchedIds = useMemo(() => new Set(matchedBoards.map((b) => b.id)), [matchedBoards]);
  const assignedOnMatched = useMemo(() => assigned.filter((i) => matchedIds.has(i.boardId)), [assigned, matchedIds]);
  const parentIdOf = useMemo(
    () => (it: Item) => parentByGroup.get(`${it.boardId}:${it.groupId}`),
    [parentByGroup],
  );
  const hostIds = useMemo(() => {
    const assignedIds = new Set(assignedOnMatched.map((i) => i.id));
    const ids = new Set<string>();
    for (const it of assignedOnMatched) {
      const p = parentIdOf(it);
      if (p && !assignedIds.has(p)) ids.add(p);
    }
    return [...ids].sort();
  }, [assignedOnMatched, parentIdOf]);
  const hostQueries = useQueries({
    queries: hostIds.map((id) => ({
      queryKey: queryKeys.items.one(id),
      queryFn: () => wm.getItem(id),
      staleTime: 60 * 1000,
      retry: false,
    })),
  });
  const hostsLoading = hostQueries.some((q) => q.isLoading);

  const sections = useMemo<BoardSection[]>(() => {
    const parentsById = new Map<string, Item>();
    hostQueries.forEach((q) => { if (q.data) parentsById.set((q.data as Item).id, q.data as Item); });
    assignedOnMatched.forEach((it) => parentsById.set(it.id, it));
    const rows = hubDisplayRows(assignedOnMatched, parentIdOf, parentsById);

    const templateColumns = personalColumns
      .filter((c) => c.fromTemplate && INSERTABLE_TYPES.has(c.type))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return matchedBoards.map((board) => {
      const boardRows = rows.filter((r) => r.boardId === board.id);
      const columns = templateColumns
        .filter((c) => c.scope === 'all' || (c.scope === 'board' && c.boardId === board.id))
        .map<ColumnSection>((col) => {
          // A cross-group column's cells live on the hub's page-wide grid, which has no board
          // of its own — the cells record '' there (see PersonalHubBoardGroup's grid contexts).
          const cellBoardId = col.scope === 'board' ? board.id : '';
          const entries: MenuEntry[] = boardRows.map((row) => ({
            key: `${col.id}:${row.id}`,
            label: row.name,
            ref: { kind: 'p', boardId: cellBoardId, columnId: col.id, itemId: row.id, ownerId },
          }));
          // The group's own summary cell — whatever aggregate it is set to show in the hub.
          const calc = (col.summaryConfig?.calc || 'sum') as SummaryCalc | 'none';
          if (calc !== 'none') {
            entries.push({
              key: `${col.id}:total`,
              label: `Group total (${CALC_LABEL[calc] ?? calc})`,
              ref: { kind: 'p', boardId: board.id, columnId: col.id, itemId: null, agg: calc, ownerId },
              isTotal: true,
            });
          }
          return { column: col, entries };
        });
      return { board, columns };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedBoards, assignedOnMatched, parentIdOf, personalColumns, ownerId, hostQueries.map((q) => q.data?.id ?? '').join(',')]);

  const refs = useMemo(
    () => sections.flatMap((s) => s.columns.flatMap((c) => c.entries.map((e) => e.ref))),
    [sections],
  );
  const { resolve } = useForeignCellValues(refs, orgId, [currentItemId]);

  const loading = itemsLoading || columnsLoading || boardsLoading || groupsLoading || hostsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label={`Loading ${user.name}'s Personal Hub`}>
        <FiLoader className="animate-spin text-indigo-500" size={18} aria-hidden="true" />
      </div>
    );
  }

  if (matchedBoards.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-gray-500">
        {user.name}’s Personal Hub has no group named “{itemName}”.
      </p>
    );
  }

  return (
    <div className="py-1">
      {sections.map(({ board, columns }) => (
        <div key={board.id} role="group" aria-label={`Group ${board.name}`}>
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-500 truncate" title={board.name}>
            {board.name}
          </div>
          {columns.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">No number or hours template columns in this hub.</p>
          )}
          {columns.map(({ column, entries }) => (
            <div key={column.id} role="group" aria-label={`Column ${column.name}`} className="mb-1">
              <div className="mx-2 mt-1 px-1.5 py-1 text-xs font-semibold text-gray-700 bg-[#fff0de80] rounded truncate" title={column.name}>
                {column.name}
              </div>
              {entries.length === 0 && (
                <p className="px-3 py-1 text-xs text-gray-400 italic">No rows in this group.</p>
              )}
              {entries.map((entry) => {
                const value = formatValue(resolve(entry.ref, currentItemId));
                return (
                  <button
                    key={entry.key}
                    type="button"
                    role="menuitem"
                    onClick={() => onPick(entry.ref)}
                    data-ref={serializeRef(entry.ref)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none ${entry.isTotal ? 'border-t border-gray-100 font-semibold text-gray-800' : 'text-gray-700'}`}
                    aria-label={`Insert ${user.name}'s ${column.name}, ${entry.label}: ${value}`}
                  >
                    <span className="truncate">{entry.label}</span>
                    <span className="flex-shrink-0 font-mono text-indigo-700">{value}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const PANEL_MARGIN = 8;

/**
 * Admin shortcut in the formula recording bar: pick a user, then pick a value from their Personal
 * Hub — no need to navigate to Users Management and into that user's hub to click the cell.
 */
const UserHubValuesMenu: React.FC = () => {
  const { session, insertRef } = useFormulaRecording();
  const { user: authUser, selectedWorkspace } = useAuth();
  const role = (authUser as { role?: UserRole } | null | undefined)?.role;
  const isOrgAdmin = role === UserRole.ORGANIZATION_ADMIN || role === UserRole.SYSTEM_ADMIN;
  const orgId = selectedWorkspace?.orgId ?? (authUser as { orgId?: string } | null | undefined)?.orgId;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Same query (and order) the Users Management / Personal Hub pages list users with.
  const { data: users = [], isLoading: usersLoading } = useUsersQuery({ limit: 200 }, isOrgAdmin && open);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const close = useCallback(() => { setOpen(false); setSelectedUserId(null); setSearch(''); }, []);

  // Close on any click outside the button and the menu itself.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Anchor under the button, right-aligned to it, and pulled back inside the viewport.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const btn = btnRef.current?.getBoundingClientRect();
    if (!btn) return;
    const width = panelRef.current?.offsetWidth ?? 0;
    const left = Math.max(PANEL_MARGIN, Math.min(btn.right - width, window.innerWidth - PANEL_MARGIN - width));
    setPos({ top: btn.bottom + 6, left });
  }, [open, selectedUserId]);

  if (!isOrgAdmin || !session) return null;

  const handlePick = (ref: CellRef) => {
    insertRef(ref);
    close();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap ${open ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Insert a value from a user's Personal Hub"
        title="Insert a value from a user's Personal Hub"
      >
        <FiUsers size={13} aria-hidden="true" /> User hub
      </button>
      {open && ReactDOM.createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Insert a value from a user's Personal Hub"
          // Keys pressed in here belong to the menu: recording listens for keys on the window
          // (Enter saves, Esc cancels, digits type into the formula), so stop them here.
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              if (selectedUserId) setSelectedUserId(null);
              else close();
            }
          }}
          className="fixed z-[9999] flex items-start gap-1"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        >
          <div className="w-60 bg-white rounded-lg shadow-xl ring-1 ring-black/10 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  aria-label="Search users"
                />
              </div>
            </div>
            <div role="menu" aria-label="Users" className="max-h-80 overflow-y-auto py-1">
              {usersLoading ? (
                <div className="flex justify-center py-4" role="status" aria-label="Loading users">
                  <FiLoader className="animate-spin text-indigo-500" size={16} aria-hidden="true" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-500">No users found.</p>
              ) : filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={selectedUserId === u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs focus:outline-none ${selectedUserId === u.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50 focus:bg-gray-50'}`}
                  aria-label={`Show ${u.name}'s Personal Hub values`}
                >
                  <img
                    className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                    src={u.profileImageUrl || '/default_user.webp'}
                    onError={(e) => { e.currentTarget.src = '/default_user.webp'; }}
                    alt=""
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[10px] text-gray-400">{u.email}</span>
                  </span>
                  <FiChevronRight size={12} className="flex-shrink-0 text-gray-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {selectedUser && (
            <div
              role="menu"
              aria-label={`${selectedUser.name}'s Personal Hub values`}
              className="w-80 max-h-[26rem] overflow-y-auto bg-white rounded-lg shadow-xl ring-1 ring-black/10"
            >
              <UserHubValuesPanel
                key={selectedUser.id}
                user={selectedUser}
                itemName={session.origin.itemName}
                currentItemId={session.origin.itemId}
                orgId={orgId}
                onPick={handlePick}
              />
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default UserHubValuesMenu;
