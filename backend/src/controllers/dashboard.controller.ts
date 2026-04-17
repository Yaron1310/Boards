import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { querySnapshotToArray } from '../services/firestore.service.js';
import {
  itemsCollection,
  columnsCollection,
  boardsCollection,
  membershipsCollection,
} from '../db/collections.js';
import {
  JwtUserPayload,
  DBItem,
  DBColumn,
  DBBoard,
  DBMembership,
  ColumnType,
  StatusColumnSettings,
  StatusOption,
} from '../types/index.js';
import { canAccessItem } from '../utils/workManagementAuth.js';
import { logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';
import type { PaginatedResult } from '../utils/pagination.js';

const ITEM_CAP = 1000;

function resolveDoneOptionIds(options: StatusOption[]): Set<string> {
  return new Set(
    options
      .filter(opt => /done|complete|finished|closed/i.test(opt.label))
      .map(opt => opt.id),
  );
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as Record<string, unknown>)['toDate'] === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

async function fetchStatusOptions(orgId: string): Promise<StatusOption[]> {
  const snap = await columnsCollection(orgId)
    .where('type', '==', ColumnType.STATUS)
    .limit(1)
    .get();
  if (snap.empty) return [];
  const col = snap.docs[0].data() as DBColumn;
  return (col.settings as StatusColumnSettings).options ?? [];
}

// ---------------------------------------------------------------------------
// GET /dashboard/summary
// ---------------------------------------------------------------------------
export const getDashboardSummary = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { workspaceId, boardIds, assigneeId, dueDateFrom, dueDateTo } = req.query;

  try {
    let query: admin.firestore.Query = itemsCollection(user.orgId);

    if (workspaceId && typeof workspaceId === 'string') {
      query = query.where('workspaceId', '==', workspaceId);
    }
    if (assigneeId && typeof assigneeId === 'string') {
      query = query.where('assignees', 'array-contains', assigneeId);
    }

    let hasDateRangeFilter = false;
    if (dueDateFrom && typeof dueDateFrom === 'string') {
      const from = new Date(dueDateFrom);
      if (!isNaN(from.getTime())) {
        query = query.where('dueDate', '>=', from);
        hasDateRangeFilter = true;
      }
    }
    if (dueDateTo && typeof dueDateTo === 'string') {
      const to = new Date(dueDateTo);
      if (!isNaN(to.getTime())) {
        query = query.where('dueDate', '<=', to);
        hasDateRangeFilter = true;
      }
    }
    // Firestore requires orderBy on the range-filter field when range filters are used
    if (hasDateRangeFilter) {
      query = query.orderBy('dueDate');
    }

    const snapshot = await query.limit(ITEM_CAP + 1).get();
    const truncated = snapshot.size > ITEM_CAP;
    const allFetched = querySnapshotToArray<DBItem>(snapshot).slice(0, ITEM_CAP);

    const boardIdsFilter = boardIds
      ? String(boardIds).split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const items = allFetched.filter(item => {
      if (!canAccessItem(user, item, 'read')) return false;
      if (boardIdsFilter && !boardIdsFilter.includes(item.boardId)) return false;
      return true;
    });

    const activeItems = items.filter(item => !item.isArchived);
    const archivedCount = items.filter(item => item.isArchived).length;

    const statusOptions = await fetchStatusOptions(user.orgId);
    const statusOptionMap = new Map(statusOptions.map(opt => [opt.id, opt]));
    const doneOptionIds = resolveDoneOptionIds(statusOptions);

    // Collect unique IDs for batch lookups
    const uniqueBoardIds = [...new Set(activeItems.map(item => item.boardId))];
    const uniqueUserIds = [...new Set(activeItems.flatMap(item => item.assignees ?? []))];

    // Batch-fetch board names (chunks of 30 for Firestore 'in' limit)
    const boardNameMap = new Map<string, string>();
    for (let i = 0; i < uniqueBoardIds.length; i += 30) {
      const chunk = uniqueBoardIds.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const boardsSnap = await boardsCollection(user.orgId)
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      for (const doc of boardsSnap.docs) {
        boardNameMap.set(doc.id, (doc.data() as DBBoard).name);
      }
    }

    // Batch-fetch user info from memberships (chunks of 30)
    const userInfoMap = new Map<string, { name: string; profileImageUrl?: string }>();
    for (let i = 0; i < uniqueUserIds.length; i += 30) {
      const chunk = uniqueUserIds.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const membSnap = await membershipsCollection
        .where('userId', 'in', chunk)
        .where('orgId', '==', user.orgId)
        .get();
      for (const doc of membSnap.docs) {
        const m = doc.data() as DBMembership;
        if (!userInfoMap.has(m.userId)) {
          userInfoMap.set(m.userId, {
            name: m.userName ?? m.userId,
            profileImageUrl: m.userProfileImageUrl,
          });
        }
      }
    }

    // Aggregate: statusDistribution
    const statusCountMap = new Map<string, number>();
    for (const item of activeItems) {
      const key = item.status ?? '__none__';
      statusCountMap.set(key, (statusCountMap.get(key) ?? 0) + 1);
    }
    const statusDistribution = [...statusCountMap.entries()].map(([statusId, count]) => {
      const opt = statusOptionMap.get(statusId);
      return {
        statusId,
        label: opt?.label ?? (statusId === '__none__' ? 'No Status' : statusId),
        color: opt?.color ?? '#cccccc',
        count,
      };
    });

    // Aggregate: itemsByBoard
    const boardCountMap = new Map<string, number>();
    for (const item of activeItems) {
      boardCountMap.set(item.boardId, (boardCountMap.get(item.boardId) ?? 0) + 1);
    }
    const itemsByBoard = [...boardCountMap.entries()].map(([boardId, count]) => ({
      boardId,
      name: boardNameMap.get(boardId) ?? boardId,
      count,
    }));

    // Aggregate: workloadByPerson
    const personCountMap = new Map<string, number>();
    for (const item of activeItems) {
      for (const uid of item.assignees ?? []) {
        personCountMap.set(uid, (personCountMap.get(uid) ?? 0) + 1);
      }
    }
    const workloadByPerson = [...personCountMap.entries()].map(([userId, count]) => ({
      userId,
      name: userInfoMap.get(userId)?.name ?? userId,
      profileImageUrl: userInfoMap.get(userId)?.profileImageUrl,
      count,
    }));

    // Compute overdue: active, dueDate < now, not done
    const now = new Date();
    const overdueItems = activeItems
      .filter(item => {
        const due = toDate(item.dueDate);
        if (!due || due >= now) return false;
        return !item.status || !doneOptionIds.has(item.status);
      })
      .sort((a, b) => {
        const da = toDate(a.dueDate)?.getTime() ?? 0;
        const db2 = toDate(b.dueDate)?.getTime() ?? 0;
        return da - db2;
      });

    // Aggregate: summary
    const completedCount = activeItems.filter(
      item => item.status !== undefined && item.status !== null && doneOptionIds.has(item.status),
    ).length;
    const total = activeItems.length;

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'item',
      resourceId: 'dashboard-summary',
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({
      statusDistribution,
      overdue: {
        count: overdueItems.length,
        items: overdueItems.slice(0, 5),
      },
      workloadByPerson,
      itemsByBoard,
      summary: {
        total,
        completed: completedCount,
        completionRate: total > 0 ? Math.round((completedCount / total) * 100) : 0,
        archived: archivedCount,
      },
      truncated,
    });
  } catch (err: unknown) {
    logger.error('Error fetching dashboard summary:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard summary.' });
  }
};

// ---------------------------------------------------------------------------
// GET /dashboard/overdue
// ---------------------------------------------------------------------------
export const getDashboardOverdue = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { workspaceId, boardIds, cursor } = req.query;

  const rawLimit = parseInt(req.query.limit as string, 10);
  const limit = isNaN(rawLimit) ? 20 : Math.min(Math.max(rawLimit, 1), 100);

  try {
    const now = new Date();

    const statusOptions = await fetchStatusOptions(user.orgId);
    const doneOptionIds = resolveDoneOptionIds(statusOptions);

    // Firestore query: active items past their due date, ordered by dueDate ASC
    let query: admin.firestore.Query = itemsCollection(user.orgId)
      .where('isArchived', '==', false)
      .where('dueDate', '<', now)
      .orderBy('dueDate', 'asc');

    if (cursor && typeof cursor === 'string') {
      const startDoc = await itemsCollection(user.orgId).doc(cursor).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    // Fetch limit + 1 to detect hasMore
    const snapshot = await query.limit(limit + 1).get();
    const allFetched = querySnapshotToArray<DBItem>(snapshot);

    const boardIdsFilter = boardIds
      ? String(boardIds).split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const filtered = allFetched.filter(item => {
      if (!canAccessItem(user, item, 'read')) return false;
      if (boardIdsFilter && !boardIdsFilter.includes(item.boardId)) return false;
      if (workspaceId && typeof workspaceId === 'string' && item.workspaceId !== workspaceId) {
        return false;
      }
      if (item.status !== undefined && item.status !== null && doneOptionIds.has(item.status)) {
        return false;
      }
      return true;
    });

    const hasMore = filtered.length > limit;
    const data = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

    void logAuditAndCheckAnomaly({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'READ',
      resourceType: 'item',
      resourceId: 'dashboard-overdue',
      organizationId: user.orgId,
      orgId: user.orgId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const result: PaginatedResult<DBItem> = { data, cursor: nextCursor, hasMore };
    res.json(result);
  } catch (err: unknown) {
    logger.error('Error fetching overdue items:', err);
    res.status(500).json({ message: 'Failed to fetch overdue items.' });
  }
};
