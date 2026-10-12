import { groupsCollection, itemsCollection, columnsCollection } from '../db/collections.js';
import { ColumnType } from '../types/index.js';
import type { DBColumn, DBGroup, DBItem } from '../types/index.js';

/**
 * A group's "Assign users" action (assignGroupUsers) records the users it assigned per PERSON
 * column under `assignedByColumn`. Items that land in the group afterwards — created there or
 * moved in — get the same users, so the group-wide assignment keeps holding for new rows:
 *
 * - a top-level group: each recorded column gets its recorded users;
 * - a subitem group (one item's subitems): the users recorded on the parent item's group go into
 *   every PERSON column of this subitem group — the same columns the bulk action fills.
 *
 * Returns columnId → user ids to add (empty when the group carries no assignment).
 */
export async function groupAutoAssignments(orgId: string, boardId: string, groupId: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const groupDoc = await groupsCollection(orgId, boardId).doc(groupId).get();
  if (!groupDoc.exists) return result;
  const group = groupDoc.data() as DBGroup;

  if (!group.parentItemId) {
    for (const [columnId, userIds] of Object.entries(group.assignedByColumn ?? {})) {
      if (Array.isArray(userIds) && userIds.length > 0) result.set(columnId, userIds);
    }
    return result;
  }

  // Subitem group: inherit from the parent item's group.
  const parentDoc = await itemsCollection(orgId).doc(group.parentItemId).get();
  if (!parentDoc.exists) return result;
  const parent = parentDoc.data() as DBItem;
  const parentGroupDoc = await groupsCollection(orgId, boardId).doc(parent.groupId).get();
  if (!parentGroupDoc.exists) return result;
  const users = [...new Set(Object.values((parentGroupDoc.data() as DBGroup).assignedByColumn ?? {}).flat())];
  if (users.length === 0) return result;

  const colsSnap = await columnsCollection(orgId, boardId).where('parentGroupId', '==', groupId).get();
  for (const doc of colsSnap.docs) {
    const col = doc.data() as DBColumn;
    if (col.type === ColumnType.PERSON) result.set(doc.id, users);
  }
  return result;
}

/**
 * Adds the auto-assigned users to an item's PERSON values and top-level `assignees` (union — no
 * one already assigned is removed). Returns only the changed columns, the new assignee list, and
 * whether anyone was newly assigned; `changed` is false when there is nothing to add.
 */
export function mergeAutoAssignments(
  values: Record<string, unknown>,
  assignees: string[],
  assignments: Map<string, string[]>,
): { changedValues: Record<string, string[]>; assignees: string[]; hasNewAssignee: boolean; changed: boolean } {
  const changedValues: Record<string, string[]> = {};
  for (const [columnId, userIds] of assignments) {
    const current = Array.isArray(values[columnId]) ? (values[columnId] as string[]) : [];
    const merged = [...new Set([...current, ...userIds])];
    if (merged.length !== current.length) changedValues[columnId] = merged;
  }
  const allUsers = [...new Set([...assignments.values()].flat())];
  const nextAssignees = [...new Set([...assignees, ...allUsers])];
  const hasNewAssignee = nextAssignees.length !== assignees.length;
  return {
    changedValues,
    assignees: nextAssignees,
    hasNewAssignee,
    changed: hasNewAssignee || Object.keys(changedValues).length > 0,
  };
}
