import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { db, snapshotToData } from './firestore.service.js';
import { groupsCollection, organizationSettingsCollection, personalHubTemplateTotalsCollection } from '../db/collections.js';
import { ColumnType } from '../types/index.js';
import type { DBItem, DBOrganizationSettings } from '../types/index.js';

/**
 * Per-item Personal Hub template totals are computed on demand from every user's private values,
 * which clients can't read — so there's nothing for a board to subscribe to directly. Instead,
 * anything that can change one of those totals stamps `itemsChangedAt` on the template column's
 * org-readable totals doc; boards showing the totals watch that doc and refetch (at most once a
 * minute) when it moves, rather than polling. The stamp carries no values, only "changed at".
 */
export async function signalTemplateItemTotalsChanged(orgId: string, templateColumnIds: string[]): Promise<void> {
  if (templateColumnIds.length === 0) return;
  const batch = db.batch();
  for (const id of templateColumnIds) {
    batch.set(
      personalHubTemplateTotalsCollection(orgId).doc(id),
      { id, templateColumnId: id, itemsChangedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
}

/**
 * A subitem being assigned, unassigned, archived, restored or deleted changes what a "Subitems
 * only" Hours Log total counts for its parent item. Signals every Hours Log template column when
 * `item` is a subitem; does nothing (beyond one group read) for a top-level item. Never throws —
 * a missed signal only delays the refresh until the board is next opened.
 */
export async function signalIfSubitemAffectsHoursTotals(orgId: string, item: Pick<DBItem, 'boardId' | 'groupId'>): Promise<void> {
  try {
    const groupDoc = await groupsCollection(orgId, item.boardId).doc(item.groupId).get();
    if (!groupDoc.exists || !(groupDoc.data() as { parentItemId?: string }).parentItemId) return;

    const settingsDoc = await organizationSettingsCollection.doc(orgId).get();
    const settings = settingsDoc.exists ? snapshotToData<DBOrganizationSettings>(settingsDoc) : null;
    const hoursColumnIds = (settings?.personalHubTemplate?.columns ?? [])
      .filter((c) => c.type === ColumnType.HOURS_LOG)
      .map((c) => c.id);
    await signalTemplateItemTotalsChanged(orgId, hoursColumnIds);
  } catch (err) {
    logger.warn('Failed to signal Personal Hub template item totals change', err);
  }
}
