import admin from 'firebase-admin';
import { webhooksCollection } from '../db/collections.js';

/**
 * Revokes the active webhook for a group (fire-and-forget safe — never throws).
 * Called automatically when a group is archived or deleted.
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
