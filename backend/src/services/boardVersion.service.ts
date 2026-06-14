import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { boardVersionsCollection } from '../db/collections.js';

/**
 * Fire-and-forget: writes the current server timestamp to the board's version
 * document. Called after every item/group mutation so the frontend can detect
 * that data changed without polling full datasets.
 *
 * Failures are logged but never propagate — version update failure must not
 * fail the primary operation.
 */
export const touchBoardVersion = (orgId: string, boardId: string): void => {
  boardVersionsCollection(orgId)
    .doc(boardId)
    .set(
      { lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    )
    .catch((err: unknown) =>
      logger.error(`Failed to touch board version [org=${orgId} board=${boardId}]:`, err),
    );
};
