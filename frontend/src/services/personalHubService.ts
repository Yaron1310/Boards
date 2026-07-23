import type { ColumnSettings, ColumnType, PersonalColumn, PersonalColumnScope } from '../types';
import { fetchWithAuth } from './authFetch';

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
  summaryConfig?: {
    calc: string;
    unit: string;
    unitAlign: 'left' | 'right';
    cumulative?: boolean;
  };
  boardSummaryConfig?: {
    calc: string;
    unit: string;
    unitAlign: 'left' | 'right';
  };
  summaryCumulativeByBoard?: Record<string, boolean>;
}

export const listPersonalColumns = (userId?: string): Promise<PersonalColumn[]> =>
  fetchWithAuth(`/api/personal-hub/columns${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);

export const createPersonalColumn = (data: CreatePersonalColumnData, userId?: string): Promise<PersonalColumn> =>
  fetchWithAuth('/api/personal-hub/columns', { method: 'POST', body: JSON.stringify({ ...data, userId }) });

export const updatePersonalColumn = (id: string, patch: UpdatePersonalColumnData, userId?: string): Promise<PersonalColumn> =>
  fetchWithAuth(`/api/personal-hub/columns/${id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, userId }) });

export const deletePersonalColumn = (id: string, userId?: string): Promise<null> =>
  fetchWithAuth(`/api/personal-hub/columns/${id}`, { method: 'DELETE', body: JSON.stringify({ userId }) });

export interface ReorderPersonalColumnItem {
  id: string;
  order: number;
}

export const reorderPersonalColumns = (order: ReorderPersonalColumnItem[], userId?: string): Promise<void> =>
  fetchWithAuth('/api/personal-hub/columns/reorder', { method: 'PATCH', body: JSON.stringify({ order, userId }) });

export const getPersonalItemValues = (itemIds: string[], userId?: string): Promise<Record<string, Record<string, unknown>>> => {
  if (itemIds.length === 0) return Promise.resolve({});
  const query = `itemIds=${itemIds.map(encodeURIComponent).join(',')}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
  return fetchWithAuth(`/api/personal-hub/item-values?${query}`);
};

export const updatePersonalItemValue = (itemId: string, columnId: string, value: unknown, userId?: string): Promise<{ values: Record<string, unknown> }> =>
  fetchWithAuth(`/api/personal-hub/item-values/${itemId}`, { method: 'PATCH', body: JSON.stringify({ columnId, value, userId }) });
