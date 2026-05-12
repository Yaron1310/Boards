import type { Board, Group, Item, Column, ColumnType, ColumnSettings, PaginatedResponse, DashboardParams, DashboardSummary, TimeRangeDependency, BoardMember, BoardRole, ChatMessage, Webhook } from '../types';
import { BACKEND_API_URL } from '../constants';

const AUTH_TOKEN_STORAGE_KEY = 'authJwt';

const handleAuthError = () => {
  if (!(window as Window & { isLoggingOut?: boolean }).isLoggingOut) {
    window.dispatchEvent(new CustomEvent('session-expired'));
  }
};

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const callerHeaders = (options.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = {
    ...callerHeaders,
  };

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({ message: '' }));
    const serverMessage = errorData.message || '';
    const isSessionError = !serverMessage || /token|session|expired|unauthorized/i.test(serverMessage);
    if (isSessionError) handleAuthError();
    const err = new Error(isSessionError ? 'Your session has expired. Please log in again.' : serverMessage) as Error & { status: number };
    err.status = 401;
    throw err;
  }
  if (response.status === 403) {
    const errorData = await response.json().catch(() => ({ message: 'You do not have permission to perform this action.' }));
    const error = new Error(errorData.message) as Error & { status: number; code?: string; orgId?: string };
    error.status = 403;
    if (errorData.code) error.code = errorData.code;
    if (errorData.orgId) error.orgId = errorData.orgId;
    throw error;
  }
  if (!response.ok) {
    let errorData: { message?: string };
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: `HTTP error! status: ${response.status}` };
    }
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
};

// ─── BOARDS ──────────────────────────────────────────────────────────────────

export interface CreateBoardData {
  name: string;
  description?: string;
  workspaceId: string;
  order?: number;
}

export interface UpdateBoardData {
  name?: string;
  description?: string;
  order?: number;
  workspaceId?: string;
}

export const createBoard = (data: CreateBoardData): Promise<Board> =>
  fetchWithAuth('/api/boards', { method: 'POST', body: JSON.stringify(data) });

export const listBoards = (workspaceId?: string, includeArchived = false): Promise<Board[]> => {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);
  if (includeArchived) params.set('includeArchived', 'true');
  const qs = params.toString();
  return fetchWithAuth(`/api/boards${qs ? `?${qs}` : ''}`);
};

export const getBoard = (id: string): Promise<Board> =>
  fetchWithAuth(`/api/boards/${id}`);

export const updateBoard = (id: string, patch: UpdateBoardData): Promise<Board> =>
  fetchWithAuth(`/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const archiveBoard = (id: string): Promise<void> =>
  fetchWithAuth(`/api/boards/${id}/archive`, { method: 'PATCH' });

export const restoreBoard = (id: string): Promise<Board> =>
  fetchWithAuth(`/api/boards/${id}/restore`, { method: 'PATCH' });

export const deleteBoard = (id: string): Promise<null> =>
  fetchWithAuth(`/api/boards/${id}`, { method: 'DELETE' });

export const getBoardVersion = (id: string): Promise<{ lastUpdatedAt: string | null }> =>
  fetchWithAuth(`/api/boards/${id}/version`);

// ─── GROUPS ──────────────────────────────────────────────────────────────────

export interface CreateGroupData {
  name: string;
  color?: string;
  order?: number;
}

export interface UpdateGroupData {
  name?: string;
  color?: string;
  isCollapsed?: boolean;
  order?: number;
}

export interface ReorderGroupItem {
  id: string;
  order: number;
}

export const listGroups = (boardId: string, includeArchived = false): Promise<Group[]> => {
  const qs = includeArchived ? '?includeArchived=true' : '';
  return fetchWithAuth(`/api/boards/${boardId}/groups${qs}`);
};

export const createGroup = (boardId: string, data: CreateGroupData): Promise<Group> =>
  fetchWithAuth(`/api/boards/${boardId}/groups`, { method: 'POST', body: JSON.stringify(data) });

export const updateGroup = (boardId: string, groupId: string, patch: UpdateGroupData): Promise<Group> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteGroup = (boardId: string, groupId: string): Promise<null> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}`, { method: 'DELETE' });

export const archiveGroup = (boardId: string, groupId: string): Promise<void> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}/archive`, { method: 'PATCH' });

export const restoreGroup = (boardId: string, groupId: string): Promise<Group> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}/restore`, { method: 'PATCH' });

export const reorderGroups = (boardId: string, order: ReorderGroupItem[]): Promise<void> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/reorder`, { method: 'PATCH', body: JSON.stringify({ order }) });

// ─── ITEMS ────────────────────────────────────────────────────────────────────

export interface CreateItemData {
  name: string;
  workspaceId: string;
  boardId: string;
  groupId: string;
  order?: number;
  values?: Record<string, unknown>;
  assignees?: string[];
  status?: string;
  dueDate?: string;
}

export interface UpdateItemData {
  name?: string;
  groupId?: string;
  order?: number;
  values?: Record<string, unknown>;
  assignees?: string[];
  status?: string;
  dueDate?: string;
  dependencies?: TimeRangeDependency[];
}

export interface ListItemsParams {
  boardId?: string;
  groupId?: string;
  workspaceId?: string;
  assignee?: string;
  status?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  includeArchived?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ReorderItemUpdate {
  id: string;
  groupId: string;
  order: number;
}

export const createItem = (data: CreateItemData): Promise<Item> =>
  fetchWithAuth('/api/items', { method: 'POST', body: JSON.stringify(data) });

export const listItems = (params: ListItemsParams = {}): Promise<PaginatedResponse<Item>> => {
  const p = new URLSearchParams();
  if (params.boardId) p.set('boardId', params.boardId);
  if (params.groupId) p.set('groupId', params.groupId);
  if (params.workspaceId) p.set('workspaceId', params.workspaceId);
  if (params.assignee) p.set('assignee', params.assignee);
  if (params.status) p.set('status', params.status);
  if (params.dueDateFrom) p.set('dueDateFrom', params.dueDateFrom);
  if (params.dueDateTo) p.set('dueDateTo', params.dueDateTo);
  if (params.includeArchived) p.set('includeArchived', 'true');
  if (params.cursor) p.set('cursor', params.cursor);
  if (params.limit) p.set('limit', String(params.limit));
  const qs = p.toString();
  return fetchWithAuth(`/api/items${qs ? `?${qs}` : ''}`);
};

export const getItem = (id: string): Promise<Item> =>
  fetchWithAuth(`/api/items/${id}`);

export const updateItem = (id: string, patch: UpdateItemData): Promise<Item> =>
  fetchWithAuth(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const reorderItems = (updates: ReorderItemUpdate[]): Promise<void> =>
  fetchWithAuth('/api/items/reorder', { method: 'PATCH', body: JSON.stringify({ updates }) });

export const archiveItem = (id: string): Promise<void> =>
  fetchWithAuth(`/api/items/${id}/archive`, { method: 'PATCH' });

export const restoreItem = (id: string): Promise<Item> =>
  fetchWithAuth(`/api/items/${id}/restore`, { method: 'PATCH' });

export const deleteItem = (id: string): Promise<null> =>
  fetchWithAuth(`/api/items/${id}`, { method: 'DELETE' });

// ─── COLUMNS ─────────────────────────────────────────────────────────────────

export interface CreateColumnData {
  name: string;
  type: ColumnType;
  settings?: ColumnSettings;
}

export interface UpdateColumnData {
  name?: string;
  settings?: ColumnSettings;
  summaryConfig?: { calc: string; unit: string; unitAlign: 'left' | 'right' } | null;
}

export interface ReorderColumnItem {
  id: string;
  order: number;
}

export const listColumns = (boardId: string): Promise<Column[]> =>
  fetchWithAuth(`/api/boards/${boardId}/columns`);

export const getColumn = (boardId: string, id: string): Promise<Column> =>
  fetchWithAuth(`/api/boards/${boardId}/columns/${id}`);

export const createColumn = (boardId: string, data: CreateColumnData): Promise<Column> =>
  fetchWithAuth(`/api/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify(data) });

export const updateColumn = (boardId: string, id: string, patch: UpdateColumnData): Promise<Column> =>
  fetchWithAuth(`/api/boards/${boardId}/columns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const reorderColumns = (boardId: string, order: ReorderColumnItem[]): Promise<void> =>
  fetchWithAuth(`/api/boards/${boardId}/columns/reorder`, { method: 'PATCH', body: JSON.stringify({ order }) });

export const deleteColumn = (boardId: string, id: string): Promise<null> =>
  fetchWithAuth(`/api/boards/${boardId}/columns/${id}`, { method: 'DELETE' });

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export interface DashboardPaginationParams {
  cursor?: string;
  limit?: number;
}

const buildDashboardQs = (params: DashboardParams): string => {
  const p = new URLSearchParams();
  if (params.workspaceId) p.set('workspaceId', params.workspaceId);
  if (params.boardIds?.length) p.set('boardIds', params.boardIds.join(','));
  if (params.assigneeId) p.set('assigneeId', params.assigneeId);
  if (params.dueDateFrom) p.set('dueDateFrom', params.dueDateFrom);
  if (params.dueDateTo) p.set('dueDateTo', params.dueDateTo);
  return p.toString();
};

export const getDashboardSummary = (params: DashboardParams = {}): Promise<DashboardSummary> => {
  const qs = buildDashboardQs(params);
  return fetchWithAuth(`/api/dashboard/summary${qs ? `?${qs}` : ''}`);
};

export const getDashboardOverdue = (
  params: DashboardParams & DashboardPaginationParams = {},
): Promise<PaginatedResponse<Item>> => {
  const p = new URLSearchParams(buildDashboardQs(params));
  if (params.cursor) p.set('cursor', params.cursor);
  if (params.limit) p.set('limit', String(params.limit));
  const qs = p.toString();
  return fetchWithAuth(`/api/dashboard/overdue${qs ? `?${qs}` : ''}`);
};

// ─── BOARD MEMBERS ───────────────────────────────────────────────────────────

export const getBoardMembers = (boardId: string): Promise<BoardMember[]> =>
  fetchWithAuth(`/api/boards/${boardId}/members`);

export const addBoardMember = (boardId: string, userId: string, role: BoardRole): Promise<BoardMember> =>
  fetchWithAuth(`/api/boards/${boardId}/members`, { method: 'POST', body: JSON.stringify({ userId, role }) });

export const removeBoardMember = (boardId: string, userId: string): Promise<null> =>
  fetchWithAuth(`/api/boards/${boardId}/members/${userId}`, { method: 'DELETE' });

// ─── ITEM CHAT ────────────────────────────────────────────────────────────────

export const listChatMessages = (itemId: string): Promise<ChatMessage[]> =>
  fetchWithAuth(`/api/items/${itemId}/chat`);

async function uploadFileToBackend(
  itemId: string,
  file: File,
): Promise<{ url: string; name: string; mimeType: string; size: number }> {
  return fetchWithAuth(`/api/items/${itemId}/chat/file`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-Filename': encodeURIComponent(file.name),
    },
    body: file,
  }) as Promise<{ url: string; name: string; mimeType: string; size: number }>;
}

export const postChatMessage = async (
  itemId: string,
  text: string,
  files?: File[],
): Promise<ChatMessage> => {
  const attachments =
    files && files.length > 0
      ? await Promise.all(files.map((f) => uploadFileToBackend(itemId, f)))
      : [];

  return fetchWithAuth(`/api/items/${itemId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ text, attachments }),
  });
};

export const deleteChatMessage = (itemId: string, messageId: string): Promise<void> =>
  fetchWithAuth(`/api/items/${itemId}/chat/${messageId}`, { method: 'DELETE' });


// ─── WEBHOOKS ─────────────────────────────────────────────────────────────────

export interface CreateWebhookData {
  insertPosition: 'top' | 'bottom';
  allowedOrigins: string[];
}

export const getGroupWebhook = async (boardId: string, groupId: string): Promise<Webhook | null> => {
  try {
    return await fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}/webhook`);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
};

export const createGroupWebhook = (
  boardId: string,
  groupId: string,
  data: CreateWebhookData,
): Promise<Webhook> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}/webhook`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const revokeGroupWebhook = (boardId: string, groupId: string): Promise<void> =>
  fetchWithAuth(`/api/boards/${boardId}/groups/${groupId}/webhook`, { method: 'DELETE' });
