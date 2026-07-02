import type { ColumnSettings, ColumnType, PersonalColumn, PersonalColumnScope } from '../types';
import { BACKEND_API_URL } from '../constants';

const AUTH_TOKEN_STORAGE_KEY = 'authJwt';

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}${url}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    let errorData: { message?: string };
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: `HTTP error! status: ${response.status}` };
    }
    const err = new Error(errorData.message || `HTTP error! status: ${response.status}`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }
  if (response.status === 204) return null;
  return response.json();
};

export interface CreatePersonalColumnData {
  name: string;
  type: ColumnType;
  settings?: ColumnSettings;
  scope: PersonalColumnScope;
  boardId?: string;
}

export interface UpdatePersonalColumnData {
  name?: string;
  settings?: ColumnSettings;
  width?: number;
}

export const listPersonalColumns = (): Promise<PersonalColumn[]> =>
  fetchWithAuth('/api/personal-hub/columns');

export const createPersonalColumn = (data: CreatePersonalColumnData): Promise<PersonalColumn> =>
  fetchWithAuth('/api/personal-hub/columns', { method: 'POST', body: JSON.stringify(data) });

export const updatePersonalColumn = (id: string, patch: UpdatePersonalColumnData): Promise<PersonalColumn> =>
  fetchWithAuth(`/api/personal-hub/columns/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deletePersonalColumn = (id: string): Promise<null> =>
  fetchWithAuth(`/api/personal-hub/columns/${id}`, { method: 'DELETE' });

export interface ReorderPersonalColumnItem {
  id: string;
  order: number;
}

export const reorderPersonalColumns = (order: ReorderPersonalColumnItem[]): Promise<void> =>
  fetchWithAuth('/api/personal-hub/columns/reorder', { method: 'PATCH', body: JSON.stringify({ order }) });

export const getPersonalItemValues = (itemIds: string[]): Promise<Record<string, Record<string, unknown>>> => {
  if (itemIds.length === 0) return Promise.resolve({});
  return fetchWithAuth(`/api/personal-hub/item-values?itemIds=${itemIds.map(encodeURIComponent).join(',')}`);
};

export const updatePersonalItemValue = (itemId: string, columnId: string, value: unknown): Promise<{ values: Record<string, unknown> }> =>
  fetchWithAuth(`/api/personal-hub/item-values/${itemId}`, { method: 'PATCH', body: JSON.stringify({ columnId, value }) });
