import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray } from '../services/firestore.service.js';
import { userGroupsCollection, membershipsCollection } from '../db/collections.js';
import { JwtUserPayload, DBUserGroup, DBMembership } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';

const MAX_NAME_LENGTH = 100;
const MAX_MEMBERS = 5000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sortGroups = (groups: DBUserGroup[]) =>
  [...groups].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

// Explicitly picks and validates the writable fields from the request body.
// Order is not set here: new groups go last and the order changes via the reorder endpoint.
const parseGroupBody = (body: any): { name: string; memberIds: string[] } => {
  const name = sanitizeText(typeof body?.name === 'string' ? body.name : '').trim();
  if (!name) throw new HttpError(400, 'Group name is required.');
  if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `Group name must be at most ${MAX_NAME_LENGTH} characters.`);

  const rawIds = Array.isArray(body?.memberIds) ? body.memberIds : [];
  if (rawIds.some((id: unknown) => typeof id !== 'string' || !id)) {
    throw new HttpError(400, 'memberIds must be a list of user ids.');
  }
  const memberIds: string[] = Array.from(new Set<string>(rawIds));
  if (memberIds.length > MAX_MEMBERS) throw new HttpError(400, 'Too many members.');

  return { name, memberIds };
};

// Every member must belong to the caller's organization.
const assertUsersInOrg = async (orgId: string, userIds: string[]) => {
  if (userIds.length === 0) return;
  const valid = new Set<string>();
  for (let i = 0; i < userIds.length; i += 30) {
    const snap = await membershipsCollection.where('userId', 'in', userIds.slice(i, i + 30)).get();
    querySnapshotToArray<DBMembership>(snap).forEach(m => {
      // Workspace memberships carry orgId; org-admin memberships use entityId === orgId.
      if (m.orgId === orgId || m.entityId === orgId) valid.add(m.userId);
    });
  }
  if (userIds.some(id => !valid.has(id))) {
    throw new HttpError(400, 'One or more users do not belong to this organization.');
  }
};

const handleError = (res: Response, err: unknown, fallback: string) => {
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  logger.error(fallback, err);
  return res.status(500).json({ message: fallback });
};

// GET /user-groups
export const getUserGroups = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const snap = await userGroupsCollection(user.orgId).get();
    return res.json(sortGroups(querySnapshotToArray<DBUserGroup>(snap)));
  } catch (err) {
    return handleError(res, err, 'Failed to load groups.');
  }
};

// Shared create/update logic. A user may be in only one group, so a member that is
// already in a different group is rejected rather than silently moved.
const saveGroup = async (orgId: string, groupId: string | null, body: any): Promise<DBUserGroup> => {
  const { name, memberIds } = parseGroupBody(body);
  await assertUsersInOrg(orgId, memberIds);

  const col = userGroupsCollection(orgId);
  return db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(col);
    const all = querySnapshotToArray<DBUserGroup>(existingSnap);
    const others = all.filter(g => g.id !== groupId);
    const current = groupId ? all.find(g => g.id === groupId) : undefined;

    if (groupId && !current) {
      throw new HttpError(404, 'Group not found.');
    }
    const order = current ? current.order : Math.max(0, ...all.map(g => g.order)) + 1;
    if (others.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'A group with this name already exists.');
    }
    const taken = new Set(others.flatMap(g => g.memberIds ?? []));
    if (memberIds.some(id => taken.has(id))) {
      throw new HttpError(409, 'One or more users already belong to another group.');
    }

    const ref = groupId ? col.doc(groupId) : col.doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (groupId) {
      tx.update(ref, { name, memberIds, updatedAt: now });
    } else {
      tx.set(ref, { name, order, memberIds, createdAt: now, updatedAt: now });
    }
    return { id: ref.id, name, order, memberIds } as DBUserGroup;
  });
};

// POST /user-groups
export const createUserGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    return res.status(201).json(await saveGroup(user.orgId, null, req.body));
  } catch (err) {
    return handleError(res, err, 'Failed to create group.');
  }
};

// PUT /user-groups/:groupId
export const updateUserGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    return res.json(await saveGroup(user.orgId, req.params.groupId, req.body));
  } catch (err) {
    return handleError(res, err, 'Failed to update group.');
  }
};

// DELETE /user-groups/:groupId
export const deleteUserGroup = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const ref = userGroupsCollection(user.orgId).doc(req.params.groupId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ message: 'Group not found.' });
    await ref.delete();
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, 'Failed to delete group.');
  }
};

// PUT /user-groups/reorder  { orderedIds: string[] }
// Persists the drag-and-drop order: the group at position i gets order i + 1.
export const reorderUserGroups = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const orderedIds: unknown = req.body?.orderedIds;
    if (!Array.isArray(orderedIds) || orderedIds.some(id => typeof id !== 'string')) {
      throw new HttpError(400, 'orderedIds must be a list of group ids.');
    }
    const ids = orderedIds as string[];

    const col = userGroupsCollection(user.orgId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(col);
      const existing = new Set(snap.docs.map(d => d.id));
      if (ids.length !== existing.size || new Set(ids).size !== ids.length || ids.some(id => !existing.has(id))) {
        throw new HttpError(409, 'The group list has changed. Please reload and try again.');
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      ids.forEach((id, index) => tx.update(col.doc(id), { order: index + 1, updatedAt: now }));
    });
    const snap = await col.get();
    return res.json(sortGroups(querySnapshotToArray<DBUserGroup>(snap)));
  } catch (err) {
    return handleError(res, err, 'Failed to reorder groups.');
  }
};
