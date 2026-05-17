import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { querySnapshotToArray } from '../services/firestore.service.js';
import {
  customDashboardsCollection,
  itemsCollection,
} from '../db/collections.js';
import {
  JwtUserPayload,
  UserRole,
  DBCustomDashboard,
  DBItem,
  CustomDashboardChartType,
  CustomDashboardAggregation,
  CustomDashboardVisibility,
  DBCustomDashboardDataSource,
} from '../types/index.js';
import { logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';

const ADMIN_ROLES: UserRole[] = [UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN];

function isAdmin(user: JwtUserPayload): boolean {
  return ADMIN_ROLES.includes(user.role as UserRole);
}

const VALID_CHART_TYPES: CustomDashboardChartType[] = [
  'pie', 'bar_vertical', 'bar_horizontal', 'radar', 'line', 'number',
];
const VALID_AGGREGATIONS: CustomDashboardAggregation[] = [
  'SUM', 'COUNT', 'AVERAGE', 'MIN', 'MAX',
];
const VALID_VISIBILITIES: CustomDashboardVisibility[] = ['admins_only', 'all'];

// ---------------------------------------------------------------------------
// GET /custom-dashboards
// ---------------------------------------------------------------------------
export const listCustomDashboards = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const snap = await customDashboardsCollection(user.orgId).orderBy('createdAt', 'asc').get();
    const all = querySnapshotToArray<DBCustomDashboard>(snap);
    const visible = isAdmin(user)
      ? all
      : all.filter(d => d.visibility === 'all');
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
  if (!isAdmin(user)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
  }

  const { name, chartType, aggregation, dataSources, visibility } = req.body as {
    name: unknown;
    chartType: unknown;
    aggregation: unknown;
    dataSources: unknown;
    visibility: unknown;
  };

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'name is required.' });
  }
  if (!VALID_CHART_TYPES.includes(chartType as CustomDashboardChartType)) {
    return res.status(400).json({ message: 'Invalid chartType.' });
  }
  if (!VALID_AGGREGATIONS.includes(aggregation as CustomDashboardAggregation)) {
    return res.status(400).json({ message: 'Invalid aggregation.' });
  }
  if (!VALID_VISIBILITIES.includes(visibility as CustomDashboardVisibility)) {
    return res.status(400).json({ message: 'Invalid visibility.' });
  }
  if (!Array.isArray(dataSources) || dataSources.length === 0) {
    return res.status(400).json({ message: 'At least one dataSource is required.' });
  }

  const sanitizedSources: DBCustomDashboardDataSource[] = (dataSources as DBCustomDashboardDataSource[]).map(ds => ({
    boardId: String(ds.boardId ?? ''),
    ...(ds.groupId ? { groupId: String(ds.groupId) } : {}),
    columnId: String(ds.columnId ?? ''),
    label: String(ds.label ?? '').trim(),
  }));

  const invalidSource = sanitizedSources.find(ds => !ds.boardId || !ds.columnId || !ds.label);
  if (invalidSource) {
    return res.status(400).json({ message: 'Each dataSource must have boardId, columnId, and label.' });
  }

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = customDashboardsCollection(user.orgId).doc();
    const dashboard: Omit<DBCustomDashboard, 'id'> = {
      name: name.trim(),
      chartType: chartType as CustomDashboardChartType,
      aggregation: aggregation as CustomDashboardAggregation,
      dataSources: sanitizedSources,
      visibility: visibility as CustomDashboardVisibility,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(dashboard);
    const created = { id: docRef.id, ...dashboard };

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'item',
      resourceId: docRef.id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.status(201).json(created);
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
  if (!isAdmin(user)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
  }

  const { id } = req.params;
  const docRef = customDashboardsCollection(user.orgId).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ message: 'Custom dashboard not found.' });
  }

  const { name, chartType, aggregation, dataSources, visibility } = req.body as {
    name?: unknown;
    chartType?: unknown;
    aggregation?: unknown;
    dataSources?: unknown;
    visibility?: unknown;
  };

  const patch: Partial<DBCustomDashboard> & { updatedAt: admin.firestore.FieldValue } = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name must be a non-empty string.' });
    }
    patch.name = name.trim();
  }
  if (chartType !== undefined) {
    if (!VALID_CHART_TYPES.includes(chartType as CustomDashboardChartType)) {
      return res.status(400).json({ message: 'Invalid chartType.' });
    }
    patch.chartType = chartType as CustomDashboardChartType;
  }
  if (aggregation !== undefined) {
    if (!VALID_AGGREGATIONS.includes(aggregation as CustomDashboardAggregation)) {
      return res.status(400).json({ message: 'Invalid aggregation.' });
    }
    patch.aggregation = aggregation as CustomDashboardAggregation;
  }
  if (visibility !== undefined) {
    if (!VALID_VISIBILITIES.includes(visibility as CustomDashboardVisibility)) {
      return res.status(400).json({ message: 'Invalid visibility.' });
    }
    patch.visibility = visibility as CustomDashboardVisibility;
  }
  if (dataSources !== undefined) {
    if (!Array.isArray(dataSources) || dataSources.length === 0) {
      return res.status(400).json({ message: 'At least one dataSource is required.' });
    }
    const sanitized: DBCustomDashboardDataSource[] = (dataSources as DBCustomDashboardDataSource[]).map(ds => ({
      boardId: String(ds.boardId ?? ''),
      ...(ds.groupId ? { groupId: String(ds.groupId) } : {}),
      columnId: String(ds.columnId ?? ''),
      label: String(ds.label ?? '').trim(),
    }));
    const invalid = sanitized.find(ds => !ds.boardId || !ds.columnId || !ds.label);
    if (invalid) {
      return res.status(400).json({ message: 'Each dataSource must have boardId, columnId, and label.' });
    }
    patch.dataSources = sanitized;
  }

  try {
    await docRef.update(patch);
    const updated = { id, ...snap.data(), ...patch } as DBCustomDashboard;

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE',
      resourceType: 'item',
      resourceId: id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(updated);
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
  if (!isAdmin(user)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
  }

  const { id } = req.params;
  const docRef = customDashboardsCollection(user.orgId).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    return res.status(404).json({ message: 'Custom dashboard not found.' });
  }

  try {
    await docRef.delete();

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'item',
      resourceId: id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
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

function aggregateValues(values: number[], fn: CustomDashboardAggregation): number {
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

export const getCustomDashboardData = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const dashSnap = await customDashboardsCollection(user.orgId).doc(id).get();
    if (!dashSnap.exists) {
      return res.status(404).json({ message: 'Custom dashboard not found.' });
    }

    const dashboard = dashSnap.data() as DBCustomDashboard;

    if (dashboard.visibility === 'admins_only' && !isAdmin(user)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
    }

    const results: { label: string; value: number }[] = await Promise.all(
      dashboard.dataSources.map(async (ds) => {
        let query: admin.firestore.Query = itemsCollection(user.orgId)
          .where('boardId', '==', ds.boardId)
          .where('isArchived', '==', false);

        if (ds.groupId) {
          query = query.where('groupId', '==', ds.groupId);
        }

        const snap = await query.limit(2000).get();
        const items = querySnapshotToArray<DBItem>(snap);

        let numericValues: number[];

        if (dashboard.aggregation === 'COUNT') {
          numericValues = items.map(() => 1);
        } else {
          numericValues = items
            .map(item => {
              const raw = item.values?.[ds.columnId];
              const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
              return isNaN(parsed) ? null : parsed;
            })
            .filter((v): v is number => v !== null);
        }

        return {
          label: ds.label,
          value: aggregateValues(numericValues, dashboard.aggregation),
        };
      }),
    );

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'item',
      resourceId: id,
      workspaceId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json(results);
  } catch (err) {
    logger.error('getCustomDashboardData error:', err);
    res.status(500).json({ message: 'Failed to compute custom dashboard data.' });
  }
};
