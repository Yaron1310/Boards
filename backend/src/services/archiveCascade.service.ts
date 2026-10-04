import admin from 'firebase-admin';
import { db } from './firestore.service.js';
import { itemsCollection, groupsCollection } from '../db/collections.js';
import type { DBItem } from '../types/index.js';

/**
 * Archiving a container (parent item, group, board) also archives every item inside it, so
 * every read path that filters on `isArchived == false` — board views, the Personal Hub,
 * dashboards — hides them without needing to know about containers.
 *
 * Each cascaded item is tagged with `archivedVia` naming the container that archived it.
 * Restoring that container restores only items carrying its tag; an item archived on its own
 * beforehand (or by another, still-archived container) stays archived.
 */
export type ArchiveSource =
  | { kind: 'item'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'board'; id: string };

const sourceKey = (source: ArchiveSource) => `${source.kind}:${source.id}`;

// Firestore 'in' queries cap at 30 values.
function chunk<T>(arr: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitInBatches(refs: FirebaseFirestore.DocumentReference[], data: FirebaseFirestore.UpdateData<DBItem>) {
  // Firestore batches cap at 500 writes.
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.update(ref, data);
    await batch.commit();
  }
}

/** Every item in the subitem groups hosted by the given parent items. */
async function findSubitemDocs(orgId: string, boardId: string, parentItemIds: string[]) {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const ids of chunk(parentItemIds)) {
    const groupSnap = await groupsCollection(orgId, boardId).where('parentItemId', 'in', ids).get();
    for (const groupDoc of groupSnap.docs) {
      const itemSnap = await itemsCollection(orgId).where('groupId', '==', groupDoc.id).get();
      docs.push(...itemSnap.docs.filter((d) => (d.data() as DBItem).boardId === boardId));
    }
  }
  return docs;
}

/** Every item the source contains: a parent item's subitems, a group's items plus their
 *  subitems, or every item (and subitem) on a board. */
async function findContainedItemDocs(orgId: string, boardId: string, source: ArchiveSource) {
  switch (source.kind) {
    case 'item':
      return findSubitemDocs(orgId, boardId, [source.id]);
    case 'group': {
      const snap = await itemsCollection(orgId).where('groupId', '==', source.id).get();
      const items = snap.docs.filter((d) => (d.data() as DBItem).boardId === boardId);
      const subitems = await findSubitemDocs(orgId, boardId, items.map((d) => d.id));
      return [...items, ...subitems];
    }
    case 'board': {
      const snap = await itemsCollection(orgId).where('boardId', '==', source.id).get();
      return snap.docs;
    }
  }
}

/** Archives every not-yet-archived item inside the source, tagging it with the source. */
export async function cascadeArchive(orgId: string, boardId: string, source: ArchiveSource): Promise<void> {
  const docs = await findContainedItemDocs(orgId, boardId, source);
  const refs = docs.filter((d) => (d.data() as DBItem).isArchived !== true).map((d) => d.ref);
  await commitInBatches(refs, {
    isArchived: true,
    archivedVia: sourceKey(source),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Restores the items the source's archive cascaded to — and nothing else. */
export async function cascadeRestore(orgId: string, source: ArchiveSource): Promise<void> {
  const snap = await itemsCollection(orgId).where('archivedVia', '==', sourceKey(source)).get();
  await commitInBatches(snap.docs.map((d) => d.ref), {
    isArchived: false,
    archivedVia: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Field update that clears the cascade tag when an item is archived/restored directly. */
export const clearArchivedVia = () => ({ archivedVia: admin.firestore.FieldValue.delete() });
