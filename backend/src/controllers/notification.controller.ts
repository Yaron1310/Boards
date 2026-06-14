import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { db, querySnapshotToArray } from '../services/firestore.service.js';
import { notificationsCollection } from '../db/collections.js';
import { JwtUserPayload, DBNotification } from '../types/index.js';

// ---------------------------------------------------------------------------
// GET /notifications
// ---------------------------------------------------------------------------
export const listNotifications = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { unreadOnly, cursor } = req.query;
  const limit = 20;

  try {
    let query = notificationsCollection(user.orgId)
      .where('recipientId', '==', user.id)
      .orderBy('createdAt', 'desc');

    if (unreadOnly === 'true') {
      query = notificationsCollection(user.orgId)
        .where('recipientId', '==', user.id)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc');
    }

    if (cursor && typeof cursor === 'string') {
      const startDoc = await notificationsCollection(user.orgId).doc(cursor).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc);
      }
    }

    const snapshot = await query.limit(limit + 1).get();
    const all = querySnapshotToArray<DBNotification>(snapshot);

    const hasMore = all.length > limit;
    const data = hasMore ? all.slice(0, limit) : all;
    const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

    res.json({ data, cursor: nextCursor, hasMore });
  } catch (err: unknown) {
    logger.error('Error fetching notifications:', err);
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /notifications/read-all   (must be registered BEFORE /:id/read)
// ---------------------------------------------------------------------------
export const markAllRead = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;

  try {
    const snapshot = await notificationsCollection(user.orgId)
      .where('recipientId', '==', user.id)
      .where('read', '==', false)
      .get();

    if (snapshot.empty) {
      return res.json({ message: 'No unread notifications.' });
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.update(doc.ref, { read: true });
    }
    await batch.commit();

    res.json({ message: 'All notifications marked as read.' });
  } catch (err: unknown) {
    logger.error('Error marking all notifications as read:', err);
    res.status(500).json({ message: 'Failed to mark notifications as read.' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read
// ---------------------------------------------------------------------------
export const markRead = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { id } = req.params;

  try {
    const doc = await notificationsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Notification not found.' });

    const notification = doc.data() as DBNotification;
    if (notification.recipientId !== user.id) {
      return res.status(403).json({ message: 'Forbidden.' });
    }

    await notificationsCollection(user.orgId).doc(id).update({ read: true });

    res.json({ message: 'Notification marked as read.' });
  } catch (err: unknown) {
    logger.error(`Error marking notification ${req.params.id} as read:`, err);
    res.status(500).json({ message: 'Failed to mark notification as read.' });
  }
};
