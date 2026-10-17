import admin from 'firebase-admin';
import { db } from './firestore.service.js';
import { columnsCollection, groupsCollection, itemsCollection } from '../db/collections.js';
import { ColumnType } from '../types/index.js';
import type { DBColumn, DBGroup, DBItem, PersonColumnSettings } from '../types/index.js';

// ---------------------------------------------------------------------------
// Assignee mirroring
//
// `item.assignees` is the top-level list the Personal Hub (and its "assigned to me" queries)
// read. It mirrors the item's PERSON cells — ALL of them combined. (It used to mirror whichever
// PERSON column was written last, so editing e.g. a "Reviewer" column wiped the people in
// "Person" out of it and the item vanished from their hub.)
// ---------------------------------------------------------------------------

/** Ids of every PERSON column on the board — top-level and subitem-table columns alike. */
export async function personColumnIds(orgId: string, boardId: string): Promise<Set<string>> {
  const snap = await columnsCollection(orgId, boardId).where('type', '==', ColumnType.PERSON).get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Union of the user ids held in an item's PERSON cells. */
export function assigneesFromValues(values: Record<string, unknown> | undefined, personIds: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const [columnId, value] of Object.entries(values ?? {})) {
    if (!personIds.has(columnId) || !Array.isArray(value)) continue;
    for (const uid of value) if (typeof uid === 'string') out.add(uid);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Assigning people to an item's subitems ("Include subitems?")
// ---------------------------------------------------------------------------

/** The item's subitem table (group), preferring a live one; null when it has none yet. */
export async function findSubitemGroup(orgId: string, boardId: string, parentItemId: string): Promise<DBGroup | null> {
  const snap = await groupsCollection(orgId, boardId).where('parentItemId', '==', parentItemId).get();
  const groups = snap.docs.map((d) => ({ ...(d.data() as DBGroup), id: d.id }));
  return groups.find((g) => !g.isArchived) ?? groups[0] ?? null;
}

const createdMs = (c: DBColumn) => {
  const v = c.createdAt as { toMillis?: () => number } | Date | undefined;
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
};

/**
 * The subitem table's PERSON column that assignments go into: the one named like the parent's
 * column when there is one, else the oldest PERSON column. When the table has none (someone
 * deleted it) and `createIfMissing`, a "Person" column is added back so the assignment is visible.
 */
export async function subitemPersonColumn(
  orgId: string,
  boardId: string,
  subitemGroupId: string,
  preferredName: string | undefined,
  createIfMissing: boolean,
): Promise<DBColumn | null> {
  const snap = await columnsCollection(orgId, boardId).where('parentGroupId', '==', subitemGroupId).get();
  const people = snap.docs
    .map((d) => ({ ...(d.data() as DBColumn), id: d.id }))
    .filter((c) => c.type === ColumnType.PERSON)
    .sort((a, b) => createdMs(a) - createdMs(b));
  const byName = preferredName ? people.find((c) => c.name.trim().toLowerCase() === preferredName.trim().toLowerCase()) : undefined;
  const found = byName ?? people[0];
  if (found || !createIfMissing) return found ?? null;

  const ref = columnsCollection(orgId, boardId).doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const column = {
    id: ref.id,
    boardId,
    name: preferredName || 'Person',
    type: ColumnType.PERSON,
    settings: { multiple: true },
    parentGroupId: subitemGroupId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await ref.set(column);
  return { ...(column as unknown as DBColumn), createdAt: new Date() };
}

/** Adds/removes people in one PERSON cell. A single-person column only gets someone when empty. */
export function applyToPersonCell(current: unknown, add: string[], remove: string[], multiple: boolean): string[] {
  let next = Array.isArray(current) ? (current as string[]).filter((v) => typeof v === 'string') : [];
  if (remove.length > 0) next = next.filter((uid) => !remove.includes(uid));
  if (add.length > 0) {
    if (multiple) next = [...new Set([...next, ...add])];
    else if (next.length === 0) next = [add[0]];
  }
  return next;
}

export interface SubitemAssignChange { add: string[]; remove: string[] }

export interface SubitemAssignResult {
  /** What actually changed on each subitem — passed back inverted to undo exactly this. */
  perItem: Record<string, SubitemAssignChange>;
  /** The parent's "assign to future subitems" list before this call. */
  autoAssigneesBefore: string[];
  subitemCount: number;
  /** Users who landed on at least one subitem they weren't on before. */
  newlyAssigned: string[];
}

/**
 * Adds/removes people on every live subitem of `parent`, and on the parent's list of people
 * who are put on subitems created later. With `exact` (undo), applies precisely those per-item
 * changes and restores the given future-subitems list instead.
 */
export async function assignSubitems(
  orgId: string,
  parent: DBItem,
  opts: {
    add: string[];
    remove: string[];
    parentColumnName?: string;
    exact?: { perItem: Record<string, SubitemAssignChange>; autoAssignees: string[] };
  },
): Promise<SubitemAssignResult> {
  const { add, remove, exact } = opts;
  const autoBefore = Array.isArray(parent.subitemAutoAssignees) ? parent.subitemAutoAssignees : [];
  const columnName = opts.parentColumnName ?? parent.subitemAutoAssignColumnName;
  const perItem: Record<string, SubitemAssignChange> = {};
  const newly = new Set<string>();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  const group = await findSubitemGroup(orgId, parent.boardId, parent.id);
  let subitemCount = 0;
  if (group) {
    const itemsSnap = await itemsCollection(orgId).where('groupId', '==', group.id).where('isArchived', '==', false).get();
    subitemCount = itemsSnap.size;
    const wantsChange = exact ? Object.keys(exact.perItem).length > 0 : (add.length > 0 || remove.length > 0);
    // Only add a missing Person column back when someone is actually being put on subitems.
    const column = subitemCount > 0 && wantsChange
      ? await subitemPersonColumn(orgId, parent.boardId, group.id, columnName, !exact && add.length > 0)
      : null;

    if (column) {
      const multiple = (column.settings as PersonColumnSettings | undefined)?.multiple ?? true;
      const personIds = await personColumnIds(orgId, parent.boardId);
      let batch = db.batch();
      let pending = 0;
      for (const doc of itemsSnap.docs) {
        const sub = doc.data() as DBItem;
        const change = exact ? exact.perItem[doc.id] : { add, remove };
        if (!change) continue;
        const before = Array.isArray(sub.values?.[column.id]) ? (sub.values[column.id] as string[]) : [];
        const after = applyToPersonCell(before, change.add, change.remove, multiple);
        const added = after.filter((u) => !before.includes(u));
        const removed = before.filter((u) => !after.includes(u));
        if (added.length === 0 && removed.length === 0) continue;

        const nextValues = { ...(sub.values ?? {}), [column.id]: after };
        const prevAssignees = sub.assignees ?? [];
        const nextAssignees = assigneesFromValues(nextValues, personIds);
        const patch: Record<string, unknown> = {
          [`values.${column.id}`]: after,
          assignees: nextAssignees,
          updatedAt: timestamp,
        };
        if (nextAssignees.some((u) => !prevAssignees.includes(u))) patch.lastAssignedAt = timestamp;
        batch.update(doc.ref, patch);
        perItem[doc.id] = { add: added, remove: removed };
        added.forEach((u) => newly.add(u));
        if (++pending % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
      if (pending % 400 !== 0) await batch.commit();
    }
  }

  // Future subitems.
  const autoAfter = exact
    ? exact.autoAssignees
    : [...new Set([...autoBefore.filter((u) => !remove.includes(u)), ...add])];
  const autoChanged = autoAfter.length !== autoBefore.length || autoAfter.some((u) => !autoBefore.includes(u));
  if (autoChanged || (columnName && columnName !== parent.subitemAutoAssignColumnName)) {
    await itemsCollection(orgId).doc(parent.id).update({
      subitemAutoAssignees: autoAfter,
      ...(columnName ? { subitemAutoAssignColumnName: columnName } : {}),
      updatedAt: timestamp,
    });
  }

  return { perItem, autoAssigneesBefore: autoBefore, subitemCount, newlyAssigned: [...newly] };
}

/**
 * For a subitem being created: the people its parent asked to put on future subitems, as
 * changed PERSON values for the new row. Empty when the group isn't a subitem table, the parent
 * has no such list, or the table has no PERSON column.
 */
export async function futureSubitemAssignments(
  orgId: string,
  boardId: string,
  group: DBGroup,
  values: Record<string, unknown>,
): Promise<{ changedValues: Record<string, string[]>; userIds: string[] }> {
  const none = { changedValues: {}, userIds: [] };
  if (!group.parentItemId) return none;
  const parentDoc = await itemsCollection(orgId).doc(group.parentItemId).get();
  if (!parentDoc.exists) return none;
  const parent = parentDoc.data() as DBItem;
  const users = Array.isArray(parent.subitemAutoAssignees) ? parent.subitemAutoAssignees : [];
  if (users.length === 0) return none;
  const column = await subitemPersonColumn(orgId, boardId, group.id, parent.subitemAutoAssignColumnName, false);
  if (!column) return none;
  const multiple = (column.settings as PersonColumnSettings | undefined)?.multiple ?? true;
  const before = Array.isArray(values[column.id]) ? (values[column.id] as string[]) : [];
  const after = applyToPersonCell(before, users, [], multiple);
  const added = after.filter((u) => !before.includes(u));
  return added.length > 0 ? { changedValues: { [column.id]: after }, userIds: added } : none;
}
