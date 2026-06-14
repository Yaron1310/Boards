import admin from 'firebase-admin';
import { db } from './firestore.service.js';
import { webhooksCollection } from '../db/collections.js';

/**
 * Revokes the active webhook for a single group (fire-and-forget safe).
 * Called when a group is archived or deleted.
 */
export async function revokeWebhookForGroup(orgId: string, groupId: string): Promise<void> {
  try {
    const snap = await webhooksCollection
      .where('orgId', '==', orgId)
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snap.empty) return;

    await snap.docs[0].ref.update({
      status: 'revoked',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Non-critical — group operation should still succeed
  }
}

/**
 * Revokes all active webhooks across every group in a board (fire-and-forget safe).
 * Called when a board is archived or deleted.
 */
export async function revokeAllWebhooksForBoard(orgId: string, boardId: string): Promise<void> {
  try {
    const snap = await webhooksCollection
      .where('orgId', '==', orgId)
      .where('boardId', '==', boardId)
      .where('status', '==', 'active')
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    snap.forEach((doc) => {
      batch.update(doc.ref, { status: 'revoked', updatedAt: timestamp });
    });
    await batch.commit();
  } catch {
    // Non-critical — board operation should still succeed
  }
}

