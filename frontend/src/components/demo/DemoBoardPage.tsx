import React, { useLayoutEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FiLayout, FiChevronDown, FiChevronRight, FiGrid, FiInfo } from 'react-icons/fi';
import { AuthSessionContext } from '../../contexts/AuthContext';
import type { AuthSessionContextType } from '../../contexts/AuthContext';
import BoardViewPage from '../boards/BoardViewPage';
import type { Board, Group, Item, Column } from '../../types';
import {
  DEMO_USER, DEMO_SELECTED_WORKSPACE, DEMO_WORKSPACES, DEMO_BOARDS,
  DEMO_GROUPS, DEMO_ITEMS, DEMO_COLUMNS, DEMO_USERS, DEMO_USER_ID, DEMO_ORG_ID, NOW,
} from './demoData';

// ── Demo state (mutable in-memory store, resets on browser refresh) ────────

interface DemoStore {
  boards: Board[];
  groups: Group[];
  items: Item[];
  columns: Column[];
}

function cloneInitialStore(): DemoStore {
  return {
    boards:  JSON.parse(JSON.stringify(DEMO_BOARDS))  as Board[],
    groups:  JSON.parse(JSON.stringify(DEMO_GROUPS))  as Group[],
    items:   JSON.parse(JSON.stringify(DEMO_ITEMS))   as Item[],
    columns: JSON.parse(JSON.stringify(DEMO_COLUMNS)) as Column[],
  };
}

let store: DemoStore = cloneInitialStore();
let nextId = 1000;
function genId() { return `demo-${nextId++}`; }

// ── Fetch interceptor ──────────────────────────────────────────────────────

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paginated<T>(data: T[], cursor: string | null = null): Response {
  return jsonResp({ data, cursor, hasMore: cursor !== null, total: data.length });
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (!body || typeof body !== 'string') return {};
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
}

function handleGroups(boardId: string, rest: string[], method: string, rawBody: BodyInit | null | undefined): Response {
  const subId  = rest[0]; // group id or 'reorder'
  const action = rest[1]; // 'archive' | 'restore'
  const ts = new Date().toISOString();

  if (!subId) {
    if (method === 'GET') {
      const includeArchived = false;
      const groups = store.groups.filter(g => g.boardId === boardId && (includeArchived || !g.isArchived))
        .sort((a, b) => a.order - b.order);
      return jsonResp(groups);
    }
    if (method === 'POST') {
      const data = parseBody(rawBody);
      const ws = store.boards.find(b => b.id === boardId)?.workspaceId ?? DEMO_WORKSPACES[0].id;
      const newGroup: Group = {
        id: genId(), boardId, workspaceId: ws,
        name: (data.name as string) ?? 'New Group',
        color: (data.color as string) ?? '#6366f1',
        order: store.groups.filter(g => g.boardId === boardId).length,
        isCollapsed: false, isArchived: false, createdAt: ts, updatedAt: ts,
      };
      store.groups.push(newGroup);
      return jsonResp(newGroup);
    }
  }

  if (subId === 'reorder') {
    if (method === 'PATCH') {
      const { order } = parseBody(rawBody) as { order?: { id: string; order: number }[] };
      (order ?? []).forEach(({ id, order: o }) => {
        const g = store.groups.find(gr => gr.id === id);
        if (g) g.order = o;
      });
      return jsonResp({});
    }
  }

  const group = store.groups.find(g => g.id === subId);

  if (!action) {
    if (method === 'PATCH') {
      if (!group) return jsonResp({}, 404);
      const patch = parseBody(rawBody);
      Object.assign(group, { ...patch, updatedAt: ts });
      return jsonResp(group);
    }
    if (method === 'DELETE') {
      store.groups = store.groups.filter(g => g.id !== subId);
      store.items  = store.items.filter(i => i.groupId !== subId);
      return jsonResp(null);
    }
  }

  if (action === 'archive' && method === 'PATCH') {
    if (group) group.isArchived = true;
    return jsonResp({});
  }
  if (action === 'restore' && method === 'PATCH') {
    if (group) { group.isArchived = false; return jsonResp(group); }
  }

  return jsonResp({});
}

function handleColumns(boardId: string, rest: string[], method: string, rawBody: BodyInit | null | undefined): Response {
  const subId  = rest[0];
  const ts = new Date().toISOString();

  if (!subId) {
    if (method === 'GET') {
      const cols = store.columns.filter(c => c.boardId === boardId);
      return jsonResp(cols);
    }
    if (method === 'POST') {
      const data = parseBody(rawBody);
      const newCol: Column = {
        id: genId(), boardId,
        name: (data.name as string) ?? 'New Column',
        type: (data.type as Column['type']) ?? 'text',
        settings: (data.settings as Column['settings']) ?? ({} as Column['settings']),
        width: (data.width as number) ?? 140,
        createdAt: ts, updatedAt: ts,
      };
      store.columns.push(newCol);
      return jsonResp(newCol);
    }
  }

  if (subId === 'reorder') {
    if (method === 'PATCH') {
      return jsonResp({});
    }
  }

  const col = store.columns.find(c => c.id === subId);

  if (method === 'PATCH') {
    if (!col) return jsonResp({}, 404);
    const patch = parseBody(rawBody);
    if (patch.settings) {
      col.settings = { ...col.settings, ...(patch.settings as object) } as Column['settings'];
      delete patch.settings;
    }
    Object.assign(col, { ...patch, updatedAt: ts });
    return jsonResp(col);
  }
  if (method === 'DELETE') {
    store.columns = store.columns.filter(c => c.id !== subId);
    return jsonResp(null);
  }

  return jsonResp({});
}

function handleItems(segments: string[], method: string, search: URLSearchParams, rawBody: BodyInit | null | undefined): Response {
  const subId  = segments[2]; // item id or 'reorder'
  const action = segments[3]; // 'archive' | 'restore'
  const ts = new Date().toISOString();

  if (!subId) {
    if (method === 'GET') {
      const groupId = search.get('groupId') ?? undefined;
      const cursor  = search.get('cursor')  || undefined;
      const limit   = parseInt(search.get('limit') ?? '50');
      const includeArchived = search.get('includeArchived') === 'true';

      let items = store.items.filter(i =>
        (!groupId || i.groupId === groupId) && (includeArchived || !i.isArchived)
      ).sort((a, b) => a.order - b.order);

      if (cursor) {
        const idx = items.findIndex(i => i.id === cursor);
        if (idx >= 0) items = items.slice(idx + 1);
      }

      const page = items.slice(0, limit);
      const nextCursor = items.length > limit ? items[limit].id : null;
      return paginated(page, nextCursor);
    }

    if (method === 'POST') {
      const data = parseBody(rawBody);
      const newItem: Item = {
        id: genId(),
        boardId:     (data.boardId     as string) ?? '',
        groupId:     (data.groupId     as string) ?? '',
        workspaceId: (data.workspaceId as string) ?? DEMO_WORKSPACES[0].id,
        name:        (data.name        as string) ?? 'New Item',
        order: store.items.filter(i => i.groupId === data.groupId).length,
        createdBy: DEMO_USER_ID,
        isArchived: false,
        status:   data.status   as string | undefined,
        dueDate:  data.dueDate  as string | undefined,
        assignees: (data.assignees as string[]) ?? [],
        values:   (data.values   as Record<string, unknown>) ?? {},
        chatMessageCount: 0,
        createdAt: ts, updatedAt: ts,
      };
      store.items.push(newItem);
      return jsonResp(newItem);
    }
  }

  if (subId === 'reorder') {
    if (method === 'PATCH') {
      const updates = parseBody(rawBody) as unknown as { id: string; order: number; groupId?: string }[];
      (Array.isArray(updates) ? updates : []).forEach(({ id, order, groupId }) => {
        const it = store.items.find(i => i.id === id);
        if (it) { it.order = order; if (groupId) it.groupId = groupId; }
      });
      return jsonResp({});
    }
  }

  const it = store.items.find(i => i.id === subId);

  if (!action) {
    if (method === 'GET') return it ? jsonResp(it) : jsonResp({}, 404);
    if (method === 'PATCH') {
      if (!it) return jsonResp({}, 404);
      const patch = parseBody(rawBody);
      if (patch.values && typeof patch.values === 'object') {
        it.values = { ...it.values, ...(patch.values as Record<string, unknown>) };
        delete patch.values;
      }
      Object.assign(it, { ...patch, updatedAt: ts });
      return jsonResp(it);
    }
    if (method === 'DELETE') {
      store.items = store.items.filter(i => i.id !== subId);
      return jsonResp(null);
    }
  }

  if (action === 'archive' && method === 'PATCH') {
    if (it) it.isArchived = true;
    return jsonResp({});
  }
  if (action === 'restore' && method === 'PATCH') {
    if (it) { it.isArchived = false; return jsonResp(it); }
  }

  return jsonResp({});
}

function handleDemoFetch(input: RequestInfo | URL, init?: RequestInit): Response | null {
  const url    = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? 'GET').toUpperCase();

  const apiIdx = url.indexOf('/api/');
  if (apiIdx === -1) return null; // not an API call, pass through

  const withQuery = url.slice(apiIdx);
  const [path, qs = ''] = withQuery.split('?');
  const search   = new URLSearchParams(qs);
  const segments = path.split('/').filter(Boolean); // ['api', resource, ...]
  const resource = segments[1];

  if (resource === 'boards') {
    const boardId    = segments[2];
    const subRes     = segments[3]; // 'groups' | 'columns' | 'members' | 'version'
    const ts = new Date().toISOString();

    if (!boardId) {
      if (method === 'GET') {
        const wsId = search.get('workspaceId') ?? undefined;
        const inc  = search.get('includeArchived') === 'true';
        const boards = store.boards.filter(b =>
          (!wsId || b.workspaceId === wsId) && (inc || !b.isArchived)
        );
        return jsonResp(boards);
      }
      return jsonResp([]);
    }

    if (!subRes) {
      if (method === 'GET') {
        const b = store.boards.find(b => b.id === boardId);
        return b ? jsonResp(b) : jsonResp({}, 404);
      }
      if (method === 'PATCH') {
        const b = store.boards.find(b => b.id === boardId);
        if (b) { Object.assign(b, { ...parseBody(init?.body), updatedAt: ts }); return jsonResp(b); }
        return jsonResp({}, 404);
      }
      return jsonResp({});
    }

    if (subRes === 'groups')  return handleGroups(boardId,  segments.slice(4), method, init?.body);
    if (subRes === 'columns') return handleColumns(boardId, segments.slice(4), method, init?.body);
    if (subRes === 'members') {
      return jsonResp([{ userId: DEMO_USER_ID, boardId, workspaceId: 'ws-marketing', role: 'admin', addedBy: DEMO_USER_ID, createdAt: NOW, userName: 'Demo User', userEmail: 'demo@logyx.app' }]);
    }
    if (subRes === 'version') return jsonResp({ version: 0 });
    if (subRes === 'invite')  return jsonResp({});
    return jsonResp({});
  }

  if (resource === 'items') return handleItems(segments, method, search, init?.body);

  if (resource === 'workspaces') {
    if (method === 'GET') return jsonResp(DEMO_WORKSPACES);
    return jsonResp({});
  }

  if (resource === 'users') {
    if (method === 'GET') return paginated(DEMO_USERS);
    return jsonResp({});
  }

  if (resource === 'chat') {
    if (method === 'GET')  return paginated([]);
    if (method === 'POST') return jsonResp({ id: genId(), ...parseBody(init?.body), createdAt: new Date().toISOString() });
    return jsonResp({});
  }

  if (resource === 'organizations') {
    return jsonResp([{ id: DEMO_ORG_ID, name: 'Demo Corp', createdAt: NOW }]);
  }

  // Anything else: silent success
  return jsonResp({});
}

// ── Auth mock ──────────────────────────────────────────────────────────────

const noop = () => { /* no-op for demo */ };
const noopBool = async () => false;
const noopVoid = async () => { /* no-op for demo */ };

const MOCK_AUTH: AuthSessionContextType = {
  user: DEMO_USER,
  token: 'demo-token',
  selectedWorkspace: DEMO_SELECTED_WORKSPACE,
  isOrgSubscriptionActive: true,
  logout: noop,
  updateAuthUser: noop,
  refreshAuthUser: noopVoid,
  updateUserDetails: noopBool,
  updateUserPassword: noopBool,
  updateUserProfileImage: noopBool,
  setAuthenticatedUserFromGoogle: noopBool,
  setAuthenticatedUserFromToken: noopBool,
  nativeGoogleLogin: noopVoid,
  nativeMicrosoftLogin: noopVoid,
};

// ── Demo sidebar ───────────────────────────────────────────────────────────

interface SidebarProps { activeBoardId: string }

const DemoBoardSidebar: React.FC<SidebarProps> = ({ activeBoardId }) => {
  const [expandedWs, setExpandedWs] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DEMO_WORKSPACES.map(ws => [ws.id, true]))
  );

  // Pull board names from store so renames are reflected
  const getBoard = (id: string) => store.boards.find(b => b.id === id);

  const hoverCss = `
    .demo-nav-item { position: relative; z-index: 10; overflow: hidden; }
    .demo-nav-item::before { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.15); opacity: 0; transition: opacity 0.15s; z-index: -1; }
    .demo-nav-item:hover::before, .demo-nav-item.active::before { opacity: 1; }
  `;

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: '#312e81' }}
      aria-label="Demo sidebar"
    >
      <style>{hoverCss}</style>

      {/* Logo */}
      <div className="p-6 pb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-400 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <FiGrid size={18} color="white" />
        </div>
        <span className="text-white font-bold text-xl">Logyx</span>
      </div>

      {/* Demo badge */}
      <div className="mx-4 mb-3 px-3 py-1.5 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.9)' }}>
        <FiInfo size={13} color="white" aria-hidden="true" />
        <span className="text-white text-xs font-medium">Demo — resets on refresh</span>
      </div>

      {/* Nav links */}
      <div className="px-3 space-y-0.5 mb-3">
        {[
          { label: 'Dashboard',  path: '/WorkHubs'   },
          { label: 'WorkHubs',   path: '/WorkHubs'   },
        ].map(({ label, path }) => (
          <NavLink
            key={label}
            to={path}
            className="demo-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:text-white"
            style={{ color: '#e5e7eb' }}
            aria-label={label}
          >
            <FiGrid size={15} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="mx-4 mb-3 border-t" style={{ borderColor: 'rgba(229,231,235,0.2)' }} />

      {/* Workspaces + boards */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-3" aria-label="Boards">
        {DEMO_WORKSPACES.map(ws => {
          const wsBoards = DEMO_BOARDS.filter(b => b.workspaceId === ws.id);
          const isOpen = expandedWs[ws.id] ?? true;
          return (
            <div key={ws.id}>
              <button
                type="button"
                onClick={() => setExpandedWs(prev => ({ ...prev, [ws.id]: !prev[ws.id] }))}
                className="flex items-center gap-1 w-full px-2 mb-1 text-xs font-semibold uppercase tracking-wider hover:opacity-100 transition-opacity"
                style={{ color: '#e5e7eb', opacity: 0.7 }}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${ws.name}`}
              >
                {isOpen ? <FiChevronDown size={11} aria-hidden="true" /> : <FiChevronRight size={11} aria-hidden="true" />}
                <span>{ws.name}</span>
              </button>
              {isOpen && (
                <ul role="list" aria-label={`${ws.name} boards`}>
                  {wsBoards.map(board => {
                    const current = getBoard(board.id);
                    const isActive = activeBoardId === board.id;
                    return (
                      <li key={board.id} role="listitem">
                        <NavLink
                          to={`/demo-board/boards/${board.id}`}
                          className={`demo-nav-item flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm transition-colors ${
                            isActive ? 'active font-semibold' : ''
                          }`}
                          style={{ color: '#e5e7eb' }}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={`Open board ${current?.name ?? board.name}`}
                        >
                          <FiLayout size={13} className="flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{current?.name ?? board.name}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t" style={{ borderColor: 'rgba(229,231,235,0.2)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0" aria-hidden="true">
            DU
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">Demo User</p>
            <p className="text-xs truncate" style={{ color: '#9ca3af' }}>demo@logyx.app</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ── Page ───────────────────────────────────────────────────────────────────

const DemoBoardPage: React.FC = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
  }));

  // Install fetch interceptor before any child effects fire
  useLayoutEffect(() => {
    store = cloneInitialStore();
    const saved = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const mockResp = handleDemoFetch(input, init);
      if (mockResp !== null) return Promise.resolve(mockResp);
      return saved(input, init);
    };
    return () => { window.fetch = saved; };
  }, []);

  // Derive current boardId from URL so the sidebar highlights the right entry
  const pathBoardId = window.location.pathname.split('/').pop() ?? '';
  const activeBoardId = DEMO_BOARDS.some(b => b.id === pathBoardId)
    ? pathBoardId
    : DEMO_BOARDS[0].id;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionContext.Provider value={MOCK_AUTH}>
        <div className="flex h-screen overflow-hidden" aria-label="Demo board application">
          <DemoBoardSidebar activeBoardId={activeBoardId} />

          <div className="flex-1 overflow-hidden">
            <Routes>
              <Route index element={<Navigate to={`boards/${DEMO_BOARDS[0].id}`} replace />} />
              <Route path="boards/:boardId" element={<BoardViewPage />} />
              <Route path="*" element={<Navigate to={`boards/${DEMO_BOARDS[0].id}`} replace />} />
            </Routes>
          </div>
        </div>
      </AuthSessionContext.Provider>
    </QueryClientProvider>
  );
};

export default DemoBoardPage;
