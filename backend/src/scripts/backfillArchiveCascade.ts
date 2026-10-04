/**
 * One-off backfill: applies the archive cascade (see services/archiveCascade.service.ts) to
 * data archived before the cascade existed — items still active inside an archived board,
 * an archived group, or under an archived parent item.
 *
 * Run after building, with admin credentials for the target project:
 *   GOOGLE_APPLICATION_CREDENTIALS=<key.json> node dist/scripts/backfillArchiveCascade.js [--dry-run]
 *
 * Safe to re-run: cascadeArchive skips items that are already archived.
 */
import { organizationsCollection, boardsCollection, groupsCollection, itemsCollection } from '../db/collections.js';
import { cascadeArchive } from '../services/archiveCascade.service.js';
import type { DBItem } from '../types/index.js';

const dryRun = process.argv.includes('--dry-run');

async function backfillOrg(orgId: string) {
  const boards = await boardsCollection(orgId).get();
  for (const board of boards.docs) {
    const boardId = board.id;
    // Board first, so everything on an archived board is tagged with the board and comes
    // back when the board is restored.
    if (board.data().isArchived === true) {
      console.log(`[${orgId}] board ${boardId} archived → cascading`);
      if (!dryRun) await cascadeArchive(orgId, boardId, { kind: 'board', id: boardId });
      continue;
    }
    const groups = await groupsCollection(orgId, boardId).where('isArchived', '==', true).get();
    for (const group of groups.docs) {
      console.log(`[${orgId}] group ${group.id} on board ${boardId} archived → cascading`);
      if (!dryRun) await cascadeArchive(orgId, boardId, { kind: 'group', id: group.id });
    }
  }

  // Directly archived items: their subitems follow them.
  const archivedItems = await itemsCollection(orgId).where('isArchived', '==', true).get();
  for (const doc of archivedItems.docs) {
    const item = doc.data() as DBItem;
    if (item.archivedVia) continue;
    if (!dryRun) await cascadeArchive(orgId, item.boardId, { kind: 'item', id: doc.id });
  }
  console.log(`[${orgId}] checked ${archivedItems.size} archived items for subitems`);
}

async function main() {
  const orgs = await organizationsCollection.get();
  for (const org of orgs.docs) await backfillOrg(org.id);
  console.log(dryRun ? 'Dry run complete — nothing written.' : 'Backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
