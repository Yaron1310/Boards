import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { db, snapshotToData } from '../services/firestore.service.js';
import {
  activeTimersCollection,
  itemsCollection,
  columnsCollection,
  groupsCollection,
  boardMembersCollection,
  personalColumnsCollection,
  personalItemValuesCollection,
} from '../db/collections.js';
import {
  JwtUserPayload,
  DBItem,
  DBColumn,
  DBBoardMember,
  DBPersonalColumn,
  DBActiveTimer,
  ActiveTimerKind,
  ColumnType,
  HoursLogEntry,
} from '../types/index.js';
import { assertItemAccess } from '../utils/workManagementAuth.js';
import { touchBoardVersion } from '../services/boardVersion.service.js';
import { signalTemplateItemTotalsChanged } from '../services/templateTotalsSignal.service.js';

// ---------------------------------------------------------------------------
// Hours Log stop-clock.
//
// A running timer is one doc per user (activeTimers/{userId}) holding where it was started and
// the server time it started at. Nothing ticks on the server or the client: elapsed time is
// always `now - startedAt`, so a sleeping/closed tab loses nothing. Stopping appends one entry
// (exact minutes, source 'timer') to the cell and deletes the timer doc in a single transaction,
// so a double stop (two tabs) can never log twice.
// ---------------------------------------------------------------------------

/** Same per-entry ceiling the manual picker has (199 hours), to the minute. */
const MAX_ENTRY_MINUTES = 199 * 60 + 59;

type HttpError = { status: number; message: string };
const httpError = (status: number, message: string): HttpError => ({ status, message });
function isHttpError(err: unknown): err is HttpError {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

const toIso = (v: unknown): string => {
  const ts = v as { toDate?: () => Date } | null | undefined;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

function serializeTimer(id: string, t: DBActiveTimer & { id?: string }) {
  return {
    id: t.id ?? id,
    kind: t.kind,
    itemId: t.itemId,
    columnId: t.columnId,
    boardId: t.boardId,
    itemName: t.itemName,
    startedAt: toIso(t.startedAt),
  };
}

const personalValueDocId = (userId: string, itemId: string) => `${userId}_${itemId}`;

/** Loads a board item + HOURS_LOG column and checks the user may log hours on it. */
async function loadBoardTarget(user: JwtUserPayload, itemId: string, columnId: string) {
  const itemDoc = await itemsCollection(user.orgId).doc(itemId).get();
  if (!itemDoc.exists) throw httpError(404, 'Item not found.');
  const item = snapshotToData<DBItem>(itemDoc)!;
  if (item.isArchived) throw httpError(410, 'This item has been archived.');

  const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
  const member = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
  assertItemAccess(user, item, 'update', member);

  const columnDoc = await columnsCollection(user.orgId, item.boardId).doc(columnId).get();
  if (!columnDoc.exists) throw httpError(410, 'This column no longer exists.');
  const column = snapshotToData<DBColumn>(columnDoc)!;
  if (column.type !== ColumnType.HOURS_LOG) throw httpError(400, 'Timers can only run on an Hours Log column.');

  return { item, column };
}

/** Loads the user's own Personal Hub HOURS_LOG column (and the item it is logged against). */
async function loadPersonalTarget(user: JwtUserPayload, itemId: string, columnId: string) {
  const columnDoc = await personalColumnsCollection(user.orgId).doc(columnId).get();
  if (!columnDoc.exists) throw httpError(410, 'This column no longer exists.');
  const column = snapshotToData<DBPersonalColumn>(columnDoc)!;
  if (column.userId !== user.id) throw httpError(403, 'Forbidden: this is not your personal column.');
  if (column.type !== ColumnType.HOURS_LOG) throw httpError(400, 'Timers can only run on an Hours Log column.');

  const itemDoc = await itemsCollection(user.orgId).doc(itemId).get();
  if (!itemDoc.exists) throw httpError(404, 'Item not found.');
  const item = snapshotToData<DBItem>(itemDoc)!;
  if (item.isArchived) throw httpError(410, 'This item has been archived.');

  return { item, column };
}

/** A "Subitems only" parent with live subitems is read-only — its hours come from the subitems. */
async function hasLiveSubitems(orgId: string, item: DBItem): Promise<boolean> {
  const subGroups = await groupsCollection(orgId, item.boardId).where('parentItemId', '==', item.id).get();
  for (const g of subGroups.docs) {
    if (g.data().isArchived) continue;
    const subitems = await itemsCollection(orgId).where('groupId', '==', g.id).where('isArchived', '==', false).limit(1).get();
    if (!subitems.empty) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /timers/active
// ---------------------------------------------------------------------------
export const getActiveTimer = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  try {
    const doc = await activeTimersCollection(user.orgId).doc(user.id).get();
    const timer = doc.exists ? serializeTimer(doc.id, doc.data() as DBActiveTimer) : null;
    res.json({ timer, serverNow: new Date().toISOString() });
  } catch (err: unknown) {
    logger.error('Error fetching active timer:', err);
    res.status(500).json({ message: 'Failed to fetch the running timer.' });
  }
};

// ---------------------------------------------------------------------------
// POST /timers/start   body: { kind: 'board' | 'personal', itemId, columnId }
// ---------------------------------------------------------------------------
export const startTimer = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { kind, itemId, columnId } = req.body ?? {};

  if (kind !== 'board' && kind !== 'personal') return res.status(400).json({ message: 'kind must be "board" or "personal".' });
  if (typeof itemId !== 'string' || !itemId) return res.status(400).json({ message: 'itemId is required.' });
  if (typeof columnId !== 'string' || !columnId) return res.status(400).json({ message: 'columnId is required.' });

  try {
    let item: DBItem;
    if (kind === 'board') {
      const target = await loadBoardTarget(user, itemId, columnId);
      item = target.item;
      const settings = (target.column.settings ?? {}) as { subitemsOnly?: boolean };
      if (!target.column.parentGroupId && settings.subitemsOnly === true && await hasLiveSubitems(user.orgId, item)) {
        return res.status(400).json({ message: "This item's hours are logged on its subitems." });
      }
    } else {
      item = (await loadPersonalTarget(user, itemId, columnId)).item;
    }

    const timerRef = activeTimersCollection(user.orgId).doc(user.id);
    const timer: DBActiveTimer & { id: string } = {
      id: randomUUID(),
      userId: user.id,
      kind: kind as ActiveTimerKind,
      itemId,
      columnId,
      boardId: item.boardId,
      itemName: item.name ?? '',
      startedAt: admin.firestore.Timestamp.now(),
    };

    const existing = await db.runTransaction(async (tx) => {
      const snap = await tx.get(timerRef);
      if (snap.exists) return snap;
      tx.set(timerRef, timer);
      return null;
    });
    if (existing) {
      return res.status(409).json({
        message: 'Another timer is already running. Stop it first.',
        timer: serializeTimer(existing.id, existing.data() as DBActiveTimer),
        serverNow: new Date().toISOString(),
      });
    }

    res.status(201).json({ timer: serializeTimer(timerRef.id, timer), serverNow: new Date().toISOString() });
  } catch (err: unknown) {
    if (isHttpError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error starting timer:', err);
    res.status(500).json({ message: 'Failed to start the timer.' });
  }
};

// ---------------------------------------------------------------------------
// POST /timers/stop   body: { timerId, minutes }
// `minutes` is what the user confirmed in the stop popover (prefilled with the elapsed time,
// editable). `timerId` guards against a stale tab stopping a timer started elsewhere since.
// ---------------------------------------------------------------------------
export const stopTimer = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { timerId } = req.body ?? {};
  const minutes = Number(req.body?.minutes);

  if (typeof timerId !== 'string' || !timerId) return res.status(400).json({ message: 'timerId is required.' });
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_ENTRY_MINUTES) {
    return res.status(400).json({ message: `minutes must be a whole number between 1 and ${MAX_ENTRY_MINUTES}.` });
  }

  const timerRef = activeTimersCollection(user.orgId).doc(user.id);

  try {
    const timerSnap = await timerRef.get();
    const timer = timerSnap.exists ? (timerSnap.data() as DBActiveTimer & { id?: string }) : null;
    if (!timer || timer.id !== timerId) return res.status(409).json({ message: 'This timer is no longer running.' });

    // Access/existence checks up front (they read several docs); the transaction below re-reads
    // the timer and the cell so the append itself is atomic.
    let templateColumnId: string | undefined;
    if (timer.kind === 'board') {
      await loadBoardTarget(user, timer.itemId, timer.columnId);
    } else {
      templateColumnId = (await loadPersonalTarget(user, timer.itemId, timer.columnId)).column.templateColumnId;
    }

    const endedAt = new Date();
    const entry: HoursLogEntry = {
      id: randomUUID(),
      minutes,
      loggedAt: endedAt.toISOString(),
      source: 'timer',
      startedAt: toIso(timer.startedAt),
      endedAt: endedAt.toISOString(),
    };

    const value = await db.runTransaction(async (tx) => {
      const current = await tx.get(timerRef);
      if (!current.exists || (current.data() as { id?: string }).id !== timerId) {
        throw httpError(409, 'This timer is no longer running.');
      }

      if (timer.kind === 'board') {
        const itemRef = itemsCollection(user.orgId).doc(timer.itemId);
        const itemSnap = await tx.get(itemRef);
        if (!itemSnap.exists) throw httpError(404, 'Item not found.');
        const existing = (itemSnap.data() as DBItem).values?.[timer.columnId];
        const next = [...(Array.isArray(existing) ? (existing as HoursLogEntry[]) : []), entry];
        tx.update(itemRef, {
          [`values.${timer.columnId}`]: next,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.delete(timerRef);
        return next;
      }

      const docId = personalValueDocId(user.id, timer.itemId);
      const valueRef = personalItemValuesCollection(user.orgId).doc(docId);
      const valueSnap = await tx.get(valueRef);
      const existing = valueSnap.exists ? (valueSnap.data()?.values as Record<string, unknown> | undefined)?.[timer.columnId] : undefined;
      const next = [...(Array.isArray(existing) ? (existing as HoursLogEntry[]) : []), entry];
      tx.set(
        valueRef,
        {
          id: docId,
          orgId: user.orgId,
          userId: user.id,
          itemId: timer.itemId,
          values: { [timer.columnId]: next },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.delete(timerRef);
      return next;
    });

    if (timer.kind === 'board') touchBoardVersion(user.orgId, timer.boardId);
    else if (templateColumnId) await signalTemplateItemTotalsChanged(user.orgId, [templateColumnId]);

    res.json({ kind: timer.kind, itemId: timer.itemId, columnId: timer.columnId, entry, value });
  } catch (err: unknown) {
    if (isHttpError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error stopping timer:', err);
    res.status(500).json({ message: 'Failed to stop the timer.' });
  }
};

// ---------------------------------------------------------------------------
// POST /timers/discard   body: { timerId }
// Deletes the running timer without logging anything. Always allowed for the owner — it is also
// the way out when the timer's item or column has since been deleted.
// ---------------------------------------------------------------------------
export const discardTimer = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { timerId } = req.body ?? {};
  if (typeof timerId !== 'string' || !timerId) return res.status(400).json({ message: 'timerId is required.' });

  const timerRef = activeTimersCollection(user.orgId).doc(user.id);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(timerRef);
      if (snap.exists && (snap.data() as { id?: string }).id === timerId) tx.delete(timerRef);
    });
    res.json({ message: 'Timer discarded.' });
  } catch (err: unknown) {
    logger.error('Error discarding timer:', err);
    res.status(500).json({ message: 'Failed to discard the timer.' });
  }
};
