import * as logger from 'firebase-functions/logger';
import { organizationsCollection, membershipsCollection } from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from './firestore.service.js';
import { DBOrganization, DBMembership, UserRole } from '../types/index.js';
import { sendSeatLimitWarningEmail } from './email.service.js';
import { getOrganizationName } from '../utils/notificationHelpers.js';

/** Thrown when an action would push an org's billable seat count past its seatLimit.
 *  Controllers should catch this and respond 403 with `.message`. */
export class SeatLimitError extends Error {
  status = 403;
  constructor(public seatLimit: number, public currentSeats: number) {
    super(`Seat limit reached (${currentSeats}/${seatLimit}). Free up a seat or ask your org admin to increase the plan.`);
    this.name = 'SeatLimitError';
  }
}

/** A membership counts as a billable seat unless it's a pure viewer: REGULAR_USER with
 *  permissions 'read_only'. Everything else (an edit-permission REGULAR_USER, ORG_EDITOR,
 *  WORKSPACE_ADMIN, ORGANIZATION_ADMIN, SYSTEM_ADMIN) is billable. A public view-link visitor
 *  never has a membership row at all, so it's never counted — free by construction. */
export function isMembershipBillable(role: UserRole, permissions?: 'edit' | 'read_only'): boolean {
  if (role === UserRole.REGULAR_USER) return permissions !== 'read_only';
  return true;
}

/** Counts unique users in the org holding at least one billable membership — a person with
 *  edit access to two workspaces still occupies exactly one seat. */
export async function countBillableSeats(orgId: string): Promise<number> {
  const snap = await membershipsCollection.where('orgId', '==', orgId).get();
  const memberships = querySnapshotToArray<DBMembership>(snap);
  const billableUserIds = new Set(
    memberships.filter((m) => isMembershipBillable(m.role, m.permissions)).map((m) => m.userId),
  );
  return billableUserIds.size;
}

/** Whether this user already occupies a billable seat in the org via any existing membership —
 *  used so an upgrade that only touches one of several memberships doesn't get double-counted
 *  as consuming a brand-new seat when the user was already billable through another one. */
export async function isUserAlreadyBillable(orgId: string, userId: string): Promise<boolean> {
  const snap = await membershipsCollection.where('orgId', '==', orgId).where('userId', '==', userId).get();
  const memberships = querySnapshotToArray<DBMembership>(snap);
  return memberships.some((m) => isMembershipBillable(m.role, m.permissions));
}

/**
 * Call before any write that would make `userId` newly billable (a REGULAR_USER membership
 * moving to 'edit', or a role upgrade to ORG_EDITOR/WORKSPACE_ADMIN/etc). No-ops when the org
 * has no seatLimit (unlimited — the default for every org until a system admin sets one), or
 * when the user already occupies a seat through some other membership. Throws SeatLimitError
 * when the org is already at capacity.
 */
export async function assertSeatAvailable(orgId: string, userId: string): Promise<void> {
  const orgDoc = await organizationsCollection.doc(orgId).get();
  const org = orgDoc.exists ? snapshotToData<DBOrganization>(orgDoc) : null;
  const seatLimit = org?.seatLimit;
  if (!seatLimit) return;

  if (await isUserAlreadyBillable(orgId, userId)) return;

  const current = await countBillableSeats(orgId);
  if (current >= seatLimit) {
    throw new SeatLimitError(seatLimit, current);
  }
}

/**
 * For inviting someone who has no membership yet at all (a not-yet-registered email invite) —
 * there's no existing user to check "already billable" against, so this just checks raw
 * capacity. Pass `willBeBillable=false` for a read-only invite, which always no-ops.
 */
export async function assertSeatCapacityForNewInvite(orgId: string, willBeBillable: boolean): Promise<void> {
  if (!willBeBillable) return;
  const orgDoc = await organizationsCollection.doc(orgId).get();
  const org = orgDoc.exists ? snapshotToData<DBOrganization>(orgDoc) : null;
  const seatLimit = org?.seatLimit;
  if (!seatLimit) return;

  const current = await countBillableSeats(orgId);
  if (current >= seatLimit) {
    throw new SeatLimitError(seatLimit, current);
  }
}

/**
 * Fire-and-forget: after a membership write that could have changed the org's seat usage,
 * check whether usage just crossed the 90% or 100% mark and email the org's admins once per
 * crossing. Never throws — a notification failure must never fail the request that triggered
 * it. The sent level resets once usage drops back under 90%, so climbing past it again re-fires.
 */
export async function checkSeatWarningThreshold(orgId: string): Promise<void> {
  try {
    const orgRef = organizationsCollection.doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) return;
    const org = snapshotToData<DBOrganization>(orgDoc);
    const seatLimit = org.seatLimit;
    if (!seatLimit) return;

    const current = await countBillableSeats(orgId);
    const pct = (current / seatLimit) * 100;
    const level = pct >= 100 ? 100 : pct >= 90 ? 90 : 0;
    const alreadySentLevel = org.seatWarningLevelSent ?? 0;

    if (level === 0) {
      if (alreadySentLevel !== 0) await orgRef.update({ seatWarningLevelSent: 0 });
      return;
    }
    if (level <= alreadySentLevel) return;

    const adminSnap = await membershipsCollection
      .where('orgId', '==', orgId)
      .where('role', '==', UserRole.ORGANIZATION_ADMIN)
      .get();
    const adminEmails = [...new Set(
      querySnapshotToArray<DBMembership>(adminSnap)
        .map((m) => m.userEmail)
        .filter((email): email is string => !!email),
    )];
    if (adminEmails.length === 0) return;

    const organizationName = await getOrganizationName(orgId);
    await sendSeatLimitWarningEmail(adminEmails, organizationName, current, seatLimit);
    await orgRef.update({ seatWarningLevelSent: level });
  } catch (err) {
    logger.error(`Failed to check/send seat warning for org ${orgId}:`, err);
  }
}
