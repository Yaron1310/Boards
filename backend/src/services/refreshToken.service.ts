import crypto from 'crypto';
import admin from 'firebase-admin';
import { refreshTokensCollection } from '../db/collections.js';
import { snapshotToData } from './firestore.service.js';
import { DBRefreshToken, UserRole } from '../types/index.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rotated on every use

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// Issues a new opaque refresh token for a session and stores its hash.
// The plaintext token is returned once and never persisted.
export const issueRefreshToken = async (
  userId: string,
  workspaceId: string,
  role: UserRole
): Promise<string> => {
  const plainToken = crypto.randomBytes(48).toString('hex');
  const now = Date.now();
  const doc: DBRefreshToken = {
    userId,
    workspaceId,
    role,
    createdAt: admin.firestore.Timestamp.fromMillis(now),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + REFRESH_TOKEN_TTL_MS),
    revokedAt: null,
  };
  await refreshTokensCollection.doc(hashToken(plainToken)).set(doc);
  return plainToken;
};

export class RefreshTokenError extends Error {
  constructor(message: string, public reused = false) {
    super(message);
  }
}

// Validates a presented refresh token, rotates it (revokes the old one and
// issues a new one), and returns the claims needed to mint a fresh access
// token. Throws RefreshTokenError on any invalid/expired/reused token.
// A token hash that has already been revoked but is still within the old
// TTL indicates the same token was replayed after rotation — treat that as
// a compromise signal and revoke every outstanding session for the user.
export const rotateRefreshToken = async (
  plainToken: string
): Promise<{ userId: string; workspaceId: string; role: UserRole; newToken: string }> => {
  const tokenHash = hashToken(plainToken);
  const docRef = refreshTokensCollection.doc(tokenHash);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new RefreshTokenError('Invalid refresh token.');
  }

  const data = snapshotToData<DBRefreshToken>(doc)!;

  const getMillis = (ts: any) => (typeof ts?.toMillis === 'function' ? ts.toMillis() : new Date(ts).getTime());

  if (data.revokedAt) {
    await revokeAllForUser(data.userId);
    throw new RefreshTokenError('Refresh token reuse detected. All sessions revoked.', true);
  }

  if (getMillis(data.expiresAt) < Date.now()) {
    throw new RefreshTokenError('Refresh token expired.');
  }

  await docRef.update({ revokedAt: admin.firestore.FieldValue.serverTimestamp() });
  const newToken = await issueRefreshToken(data.userId, data.workspaceId, data.role);

  return { userId: data.userId, workspaceId: data.workspaceId, role: data.role, newToken };
};

export const revokeRefreshToken = async (plainToken: string): Promise<void> => {
  const tokenHash = hashToken(plainToken);
  await refreshTokensCollection.doc(tokenHash).update({ revokedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
};

export const revokeAllForUser = async (userId: string): Promise<void> => {
  const snapshot = await refreshTokensCollection.where('userId', '==', userId).where('revokedAt', '==', null).get();
  if (snapshot.empty) return;
  const batch = refreshTokensCollection.firestore.batch();
  snapshot.docs.forEach(d => batch.update(d.ref, { revokedAt: admin.firestore.FieldValue.serverTimestamp() }));
  await batch.commit();
};
