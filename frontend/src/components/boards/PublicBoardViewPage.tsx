import React, { useEffect, useState, useLayoutEffect } from 'react';
import { useParams, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { FiEye, FiAlertTriangle, FiLoader } from 'react-icons/fi';
import { AuthSessionContext } from '../../contexts/AuthContext';
import type { AuthSessionContextType } from '../../contexts/AuthContext';
import BoardViewPage from './BoardViewPage';
import { BACKEND_API_URL } from '../../constants';
import type { Board, Group, Item, Column } from '../../types';

interface PublicBoardPayload {
  board: Board;
  groups: Group[];
  columns: Column[];
  items: Item[];
  expiresAt: string;
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function paginated<T>(data: T[]): Response {
  return jsonResp({ data, cursor: null, hasMore: false, total: data.length });
}

// Intercepts the app's normal /api/* calls and serves them from the one
// read-only snapshot fetched for this link — the same trick DemoBoardPage
// uses to render the real BoardViewPage outside of an authenticated session.
function installFetchInterceptor(payload: PublicBoardPayload): () => void {
  const original = window.fetch.bind(window);
  const { board, groups, columns, items } = payload;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const apiIdx = url.indexOf('/api/');
    if (apiIdx === -1) return original(input, init);

    const [path] = url.slice(apiIdx).split('?');
    const segments = path.split('/').filter(Boolean); // ['api', resource, ...]
    const resource = segments[1];

    if (method !== 'GET') return jsonResp({ message: 'This is a read-only view.' }, 403);

    if (resource === 'boards' && segments[2] === board.id) {
      const subRes = segments[3];
      if (!subRes) return jsonResp({ ...board, userBoardRole: 'viewer' });
      if (subRes === 'groups') return jsonResp(groups);
      if (subRes === 'columns') return jsonResp(columns);
      if (subRes === 'version') return jsonResp({ version: 0 });
      if (subRes === 'members' || subRes === 'participants') return jsonResp([]);
      return jsonResp({});
    }

    if (resource === 'items') return paginated(items);

    // Anything else (users, custom dashboards, notifications, chat, personal hub…)
    // gets a benign empty response so the read-only view never hard-crashes.
    return jsonResp({});
  };

  return () => { window.fetch = original; };
}

const noop = () => { /* no-op for a read-only public view */ };
const noopBool = async () => false;
const noopVoid = async () => { /* no-op for a read-only public view */ };

function buildMockAuth(board: Board): AuthSessionContextType {
  return {
    user: {
      id: 'public-viewer',
      name: 'Guest',
      email: '',
      role: 'regular_user',
      status: 'active',
    } as unknown as AuthSessionContextType['user'],
    token: 'public-view',
    selectedWorkspace: {
      id: board.workspaceId,
      name: '',
      orgId: '', // intentionally blank — prevents useBoardSnapshot from opening a Firestore listener
      workspacePermissions: 'read_only',
    } as unknown as AuthSessionContextType['selectedWorkspace'],
    isOrgSubscriptionActive: true,
    isPublicView: true,
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
}

const PublicBoardViewPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; payload: PublicBoardPayload }
  >({ status: 'loading' });
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10_000 } },
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${BACKEND_API_URL}/api/public/board-view/${token}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setState({ status: 'error', message: data.message || 'This link is invalid.' });
          return;
        }
        setState({ status: 'ready', payload: data });
      } catch {
        if (!cancelled) setState({ status: 'error', message: 'Failed to load this board. Please check your connection.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Install the fetch interceptor synchronously (before BoardViewPage's effects fire)
  // for the lifetime of the ready state only.
  useLayoutEffect(() => {
    if (state.status !== 'ready') return;
    return installFetchInterceptor(state.payload);
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50" aria-live="polite">
        <FiLoader size={20} className="animate-spin text-indigo-500" aria-hidden="true" />
        <span className="ml-2 text-sm text-gray-500">Loading board…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <FiAlertTriangle size={28} className="text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-gray-800 mb-1">Can't open this board</h1>
          <p className="text-xs text-gray-500">{state.message}</p>
        </div>
      </div>
    );
  }

  const { board, expiresAt } = state.payload;
  const mockAuth = buildMockAuth(board);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionContext.Provider value={mockAuth}>
        <div className="flex flex-col h-screen overflow-hidden" aria-label="Read-only board view">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs flex-shrink-0" role="note">
            <FiEye size={13} aria-hidden="true" />
            <span>Read-only view — no login required. This link expires on {new Date(expiresAt).toLocaleDateString()}.</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <Routes>
              <Route index element={<Navigate to={`boards/${board.id}`} replace />} />
              <Route path="boards/:boardId" element={<BoardViewPage />} />
              <Route path="*" element={<Navigate to={`boards/${board.id}`} replace />} />
            </Routes>
          </div>
        </div>
      </AuthSessionContext.Provider>
    </QueryClientProvider>
  );
};

export default PublicBoardViewPage;
