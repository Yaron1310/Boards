import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { querySnapshotToArray } from '../services/firestore.service.js';
import { customDashboardsCollection, itemsCollection, columnsCollection } from '../db/collections.js';
import {
  JwtUserPayload,
  UserRole,
  DBCustomDashboard,
  DBCustomDashboardConfig,
  DBMetricConfig,
  DBCategoryConfig,
  DBTimeSeriesConfig,
  DBItem,
  DBColumn,
  ColumnType,
  StatusColumnSettings,
  DropdownColumnSettings,
  CustomDashboardChartType,
  CustomDashboardVisibility,
  MetricAggregation,
  YAxisAggregation,
  TimeAxisGrouping,
  ITEM_NAME_COLUMN_ID,
} from '../types/index.js';
import { logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ADMIN_ROLES: UserRole[] = [UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN];
const VALID_CHART_TYPES: CustomDashboardChartType[] = ['pie', 'bar_vertical', 'bar_horizontal', 'radar', 'line', 'number'];
const VALID_VISIBILITIES: CustomDashboardVisibility[] = ['admins_only', 'all'];
const VALID_METRIC_AGGS: MetricAggregation[] = ['COUNT', 'SUM', 'AVERAGE', 'MIN', 'MAX'];
const VALID_Y_AGGS: YAxisAggregation[] = ['COUNT', 'SUM', 'AVERAGE'];
const VALID_GROUPINGS: TimeAxisGrouping[] = ['day', 'week', 'month'];

function isAdmin(user: JwtUserPayload): boolean {
  return ADMIN_ROLES.includes(user.role as UserRole);
}

function resolveItemValue(item: DBItem, columnId: string): unknown {
  return columnId === ITEM_NAME_COLUMN_ID ? item.name : item.values?.[columnId];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}

function toDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value !== null) {
    if ('toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
      return (value as { toDate(): Date }).toDate();
    }
    if ('_seconds' in value) {
      return new Date((value as { _seconds: number })._seconds * 1000);
    }
  }
  return null;
}

function floorToBucket(date: Date, grouping: TimeAxisGrouping): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (grouping === 'day') return `${y}-${m}-${d}`;
  if (grouping === 'month') return `${y}-${m}`;
  // week: use Monday of the week
  const dow = date.getDay();
  const diff = date.getDate() - dow + (dow === 0 ? -6 : 1);
  const mon = new Date(date);
  mon.setDate(diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

function fillGaps(buckets: Map<string, number>, grouping: TimeAxisGrouping): { label: string; value: number }[] {
  if (buckets.size === 0) return [];
  const keys = [...buckets.keys()].sort();
  const result: { label: string; value: number }[] = [];
  const current = new Date(keys[0]);
  const last = new Date(keys[keys.length - 1]);
  while (current <= last) {
    const key = floorToBucket(current, grouping);
    result.push({ label: key, value: buckets.get(key) ?? 0 });
    if (grouping === 'day') current.setDate(current.getDate() + 1);
    else if (grouping === 'week') current.setDate(current.getDate() + 7);
    else current.setMonth(current.getMonth() + 1);
  }
  return result;
}

function applyDateFilter(
  items: DBItem[],
  columnId: string,
  dateFrom: Date | null,
  dateTo: Date | null,
): DBItem[] {
  if (!dateFrom && !dateTo) return items;
  return items.filter(item => {
    const d = toDateValue(resolveItemValue(item, columnId));
    if (!d) return false;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}

function aggregateNumbers(values: number[], fn: MetricAggregation | YAxisAggregation): number {
  if (fn === 'COUNT') return values.length;
  if (values.length === 0) return 0;
  switch (fn) {
    case 'SUM': return values.reduce((a, b) => a + b, 0);
    case 'AVERAGE': return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
    case 'MIN': return Math.min(...values);
    case 'MAX': return Math.max(...values);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateConfig(config: unknown, chartType: CustomDashboardChartType): string | null {
  if (!config || typeof config !== 'object') return 'config is required.';
  const c = config as Record<string, unknown>;
  if (chartType === 'line') {
    if (c.type !== 'timeseries') return 'Line chart requires config.type = "timeseries".';
    if (!c.boardId || typeof c.boardId !== 'string') return 'timeseries config requires boardId.';
    if (!c.xAxisColumnId || typeof c.xAxisColumnId !== 'string') return 'timeseries config requires xAxisColumnId.';
    if (!VALID_GROUPINGS.includes(c.xAxisGrouping as TimeAxisGrouping)) return 'Invalid xAxisGrouping.';
    if (!VALID_Y_AGGS.includes(c.yAxisAggregation as YAxisAggregation)) return 'Invalid yAxisAggregation.';
  } else if (chartType === 'pie' || chartType === 'bar_vertical' || chartType === 'bar_horizontal') {
    if (c.type !== 'category') return 'Pie/bar charts require config.type = "category".';
    if (!c.boardId || typeof c.boardId !== 'string') return 'category config requires boardId.';
    if (!c.groupByColumnId || typeof c.groupByColumnId !== 'string') return 'category config requires groupByColumnId.';
  } else {
    // number, radar
    if (c.type !== 'metric') return 'Number/radar charts require config.type = "metric".';
    const metrics = c.metrics as unknown[];
    if (!Array.isArray(metrics) || metrics.length === 0) return 'metric config requires at least one metric.';
    for (const [i, m] of (metrics as Record<string, unknown>[]).entries()) {
      if (!m.boardId || typeof m.boardId !== 'string') return `metrics[${i}]: boardId is required.`;
      if (!VALID_METRIC_AGGS.includes(m.aggregation as MetricAggregation)) return `metrics[${i}]: invalid aggregation.`;
      if (!m.label || typeof m.label !== 'string' || !(m.label as string).trim()) return `metrics[${i}]: label is required.`;
    }
  }
  return null;
}

function sanitizeConfig(config: Record<string, unknown>, chartType: CustomDashboardChartType): DBCustomDashboardConfig {
  if (chartType === 'line') {
    const c = config as Record<string, unknown>;
    const ts: DBTimeSeriesConfig = {
      type: 'timeseries',
      boardId: String(c.boardId),
      xAxisColumnId: String(c.xAxisColumnId),
      xAxisGrouping: c.xAxisGrouping as TimeAxisGrouping,
      yAxisAggregation: c.yAxisAggregation as YAxisAggregation,
    };
    if (c.groupId && typeof c.groupId === 'string') ts.groupId = c.groupId;
    if (c.yAxisColumnId && typeof c.yAxisColumnId === 'string') ts.yAxisColumnId = c.yAxisColumnId;
    return ts;
  }
  if (chartType === 'pie' || chartType === 'bar_vertical' || chartType === 'bar_horizontal') {
    const c = config as Record<string, unknown>;
    const cat: DBCategoryConfig = {
      type: 'category',
      boardId: String(c.boardId),
      groupByColumnId: String(c.groupByColumnId),
    };
    if (c.groupId && typeof c.groupId === 'string') cat.groupId = c.groupId;
    if (c.timeAxisColumnId && typeof c.timeAxisColumnId === 'string') cat.timeAxisColumnId = c.timeAxisColumnId;
    return cat;
  }
  // metric (number, radar)
  const c = config as Record<string, unknown>;
  const metrics = (c.metrics as Record<string, unknown>[]).map(m => {
    const entry: DBMetricConfig['metrics'][number] = {
      boardId: String(m.boardId),
      aggregation: m.aggregation as MetricAggregation,
      label: String(m.label).trim(),
    };
    if (m.groupId && typeof m.groupId === 'string') entry.groupId = m.groupId;
    if (m.columnId && typeof m.columnId === 'string') entry.columnId = m.columnId;
    return entry;
  });
  const mc: DBMetricConfig = { type: 'metric', metrics };
  if (c.timeAxisColumnId && typeof c.timeAxisColumnId === 'string') mc.timeAxisColumnId = c.timeAxisColumnId;
  return mc;
}

// ---------------------------------------------------------------------------
// GET /custom-dashboards
// ---------------------------------------------------------------------------
export const listCustomDashboards = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const snap = await customDashboardsCollection(user.orgId).orderBy('createdAt', 'asc').get();
    const all = querySnapshotToArray<DBCustomDashboard>(snap);
    const visible = isAdmin(user) ? all : all.filter(d => d.visibility === 'all');
    res.json(visible);
  } catch (err) {
    logger.error('listCustomDashboards error:', err);
    res.status(500).json({ message: 'Failed to list custom dashboards.' });
  }
};

// ---------------------------------------------------------------------------
// POST /custom-dashboards
// ---------------------------------------------------------------------------
export const createCustomDashboard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!isAdmin(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { name, chartType, config, visibility } = req.body as Record<string, unknown>;

  if (!name || typeof name !== 'string' || !String(name).trim())
    return res.status(400).json({ message: 'name is required.' });
  if (!VALID_CHART_TYPES.includes(chartType as CustomDashboardChartType))
    return res.status(400).json({ message: 'Invalid chartType.' });
  if (!VALID_VISIBILITIES.includes(visibility as CustomDashboardVisibility))
    return res.status(400).json({ message: 'Invalid visibility.' });

  const configError = validateConfig(config, chartType as CustomDashboardChartType);
  if (configError) return res.status(400).json({ message: configError });

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = customDashboardsCollection(user.orgId).doc();
    const dashboard: Omit<DBCustomDashboard, 'id'> = {
      name: String(name).trim(),
      chartType: chartType as CustomDashboardChartType,
      config: sanitizeConfig(config as Record<string, unknown>, chartType as CustomDashboardChartType),
      visibility: visibility as CustomDashboardVisibility,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(dashboard);

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'CREATE',
      resourceType: 'item', resourceId: docRef.id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json({ id: docRef.id, ...dashboard });
  } catch (err) {
    logger.error('createCustomDashboard error:', err);
    res.status(500).json({ message: 'Failed to create custom dashboard.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /custom-dashboards/:id
// ---------------------------------------------------------------------------
export const updateCustomDashboard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!isAdmin(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { id } = req.params;
  const docRef = customDashboardsCollection(user.orgId).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return res.status(404).json({ message: 'Custom dashboard not found.' });

  const existing = snap.data() as DBCustomDashboard;
  const { name, chartType, config, visibility } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name must be a non-empty string.' });
    patch.name = name.trim();
  }
  const resolvedChartType = (chartType as CustomDashboardChartType | undefined) ?? existing.chartType;
  if (chartType !== undefined) {
    if (!VALID_CHART_TYPES.includes(chartType as CustomDashboardChartType)) return res.status(400).json({ message: 'Invalid chartType.' });
    patch.chartType = chartType;
  }
  if (visibility !== undefined) {
    if (!VALID_VISIBILITIES.includes(visibility as CustomDashboardVisibility)) return res.status(400).json({ message: 'Invalid visibility.' });
    patch.visibility = visibility;
  }
  if (config !== undefined) {
    const configError = validateConfig(config, resolvedChartType);
    if (configError) return res.status(400).json({ message: configError });
    patch.config = sanitizeConfig(config as Record<string, unknown>, resolvedChartType);
  }

  try {
    await docRef.update(patch);

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'UPDATE',
      resourceType: 'item', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ id, ...existing, ...patch });
  } catch (err) {
    logger.error('updateCustomDashboard error:', err);
    res.status(500).json({ message: 'Failed to update custom dashboard.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /custom-dashboards/:id
// ---------------------------------------------------------------------------
export const deleteCustomDashboard = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  if (!isAdmin(user)) return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

  const { id } = req.params;
  const docRef = customDashboardsCollection(user.orgId).doc(id);
  if (!(await docRef.get()).exists) return res.status(404).json({ message: 'Custom dashboard not found.' });

  try {
    await docRef.delete();
    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'DELETE',
      resourceType: 'item', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });
    res.status(204).send();
  } catch (err) {
    logger.error('deleteCustomDashboard error:', err);
    res.status(500).json({ message: 'Failed to delete custom dashboard.' });
  }
};

// ---------------------------------------------------------------------------
// GET /custom-dashboards/:id/data
// ---------------------------------------------------------------------------

async function fetchItems(orgId: string, boardId: string, groupId?: string): Promise<DBItem[]> {
  let q: admin.firestore.Query = itemsCollection(orgId)
    .where('boardId', '==', boardId)
    .where('isArchived', '==', false);
  if (groupId) q = q.where('groupId', '==', groupId);
  const snap = await q.limit(2000).get();
  return querySnapshotToArray<DBItem>(snap);
}

async function computeMetric(
  orgId: string,
  config: DBMetricConfig,
  dateFrom: Date | null,
  dateTo: Date | null,
): Promise<{ label: string; value: number }[]> {
  return Promise.all(
    config.metrics.map(async m => {
      let items = await fetchItems(orgId, m.boardId, m.groupId);
      if (config.timeAxisColumnId) {
        items = applyDateFilter(items, config.timeAxisColumnId, dateFrom, dateTo);
      }
      let value: number;
      if (m.aggregation === 'COUNT') {
        value = items.length;
      } else {
        const nums = items
          .map(item => toNumber(m.columnId ? resolveItemValue(item, m.columnId) : null))
          .filter((v): v is number => v !== null);
        value = aggregateNumbers(nums, m.aggregation);
      }
      return { label: m.label, value };
    }),
  );
}

async function computeCategory(
  orgId: string,
  config: DBCategoryConfig,
  dateFrom: Date | null,
  dateTo: Date | null,
): Promise<{ label: string; value: number }[]> {
  let items = await fetchItems(orgId, config.boardId, config.groupId);
  if (config.timeAxisColumnId) {
    items = applyDateFilter(items, config.timeAxisColumnId, dateFrom, dateTo);
  }

  // Build label resolver for STATUS / DROPDOWN columns
  let optionLabelMap: Map<string, string> | null = null;
  let columnType: ColumnType | null = null;

  if (config.groupByColumnId !== ITEM_NAME_COLUMN_ID) {
    const colSnap = await columnsCollection(orgId, config.boardId).doc(config.groupByColumnId).get();
    if (colSnap.exists) {
      const col = colSnap.data() as DBColumn;
      columnType = col.type;
      if (col.type === ColumnType.STATUS) {
        optionLabelMap = new Map(
          ((col.settings as StatusColumnSettings).options ?? []).map(o => [o.id, o.label]),
        );
      } else if (col.type === ColumnType.DROPDOWN) {
        optionLabelMap = new Map(
          ((col.settings as DropdownColumnSettings).options ?? []).map(o => [o.id, o.label]),
        );
      }
    }
  }

  const counts = new Map<string, number>();
  for (const item of items) {
    let raw: unknown;
    if (config.groupByColumnId === ITEM_NAME_COLUMN_ID) {
      raw = item.name;
    } else {
      raw = item.values?.[config.groupByColumnId];
    }

    let label: string;
    if (columnType === ColumnType.CHECKBOX) {
      label = raw ? 'Yes' : 'No';
    } else if (optionLabelMap && typeof raw === 'string') {
      label = optionLabelMap.get(raw) ?? raw;
    } else if (raw === null || raw === undefined) {
      label = '(empty)';
    } else if (Array.isArray(raw)) {
      label = raw.join(', ') || '(empty)';
    } else {
      label = String(raw);
    }

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

async function computeTimeSeries(
  orgId: string,
  config: DBTimeSeriesConfig,
  dateFrom: Date | null,
  dateTo: Date | null,
): Promise<{ label: string; value: number }[]> {
  let items = await fetchItems(orgId, config.boardId, config.groupId);

  // Always filter by x axis column range if dates provided
  if (dateFrom || dateTo) {
    items = applyDateFilter(items, config.xAxisColumnId, dateFrom, dateTo);
  }

  const buckets = new Map<string, number[]>();

  for (const item of items) {
    const raw = resolveItemValue(item, config.xAxisColumnId);
    const d = toDateValue(raw);
    if (!d) continue;
    const key = floorToBucket(d, config.xAxisGrouping);

    let yValue: number;
    if (config.yAxisAggregation === 'COUNT') {
      yValue = 1;
    } else {
      const colId = config.yAxisColumnId;
      const num = colId ? toNumber(resolveItemValue(item, colId)) : null;
      if (num === null) continue;
      yValue = num;
    }

    const existing = buckets.get(key) ?? [];
    existing.push(yValue);
    buckets.set(key, existing);
  }

  const aggregated = new Map<string, number>();
  for (const [key, vals] of buckets) {
    aggregated.set(key, aggregateNumbers(vals, config.yAxisAggregation));
  }

  return fillGaps(aggregated, config.xAxisGrouping);
}

export const getCustomDashboardData = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;
  const { dateFrom: rawFrom, dateTo: rawTo } = req.query;

  const dateFrom = rawFrom && typeof rawFrom === 'string' ? toDateValue(rawFrom) : null;
  const dateTo = rawTo && typeof rawTo === 'string' ? toDateValue(rawTo) : null;

  try {
    const dashSnap = await customDashboardsCollection(user.orgId).doc(id).get();
    if (!dashSnap.exists) return res.status(404).json({ message: 'Custom dashboard not found.' });

    const dashboard = dashSnap.data() as DBCustomDashboard;
    if (dashboard.visibility === 'admins_only' && !isAdmin(user))
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });

    let results: { label: string; value: number }[];
    const { config } = dashboard;

    if (config.type === 'metric') {
      results = await computeMetric(user.orgId, config, dateFrom, dateTo);
    } else if (config.type === 'category') {
      results = await computeCategory(user.orgId, config, dateFrom, dateTo);
    } else {
      results = await computeTimeSeries(user.orgId, config, dateFrom, dateTo);
    }

    void logAuditAndCheckAnomaly({
      actorUserId: user.id, actorRole: user.role, action: 'READ',
      resourceType: 'item', resourceId: id,
      workspaceId: user.orgId, orgId: user.orgId,
      ipAddress: getClientIp(req), userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(results);
  } catch (err) {
    logger.error('getCustomDashboardData error:', err);
    res.status(500).json({ message: 'Failed to compute custom dashboard data.' });
  }
};
