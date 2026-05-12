import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import crypto from 'crypto';
import { db, snapshotToData } from '../services/firestore.service.js';
import {
  webhooksCollection,
  boardsCollection,
  groupsCollection,
  itemsCollection,
  boardMembersCollection,
} from '../db/collections.js';
import { JwtUserPayload, DBWebhook, DBBoard, DBGroup, DBBoardMember } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { logAudit, getClientIp } from '../services/audit.service.js';
import { touchBoardVersion } from '../services/boardVersion.service.js';
import {
  assertGroupAccess,
} from '../utils/workManagementAuth.js';

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return false;
  if (allowedOrigins.includes('*')) return true;
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

// ---------------------------------------------------------------------------
// POST /boards/:boardId/groups/:groupId/webhook  (authenticated)
// ---------------------------------------------------------------------------
export const createWebhook = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;
  const { insertPosition, allowedOrigins } = req.body;

  const position: 'top' | 'bottom' =
    insertPosition === 'top' ? 'top' : 'bottom';

  const origins: string[] = Array.isArray(allowedOrigins)
    ? allowedOrigins.filter((o) => typeof o === 'string' && o.length > 0).slice(0, 20)
    : [];

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;
    if (group.isArchived) return res.status(409).json({ message: 'Cannot create a webhook for an archived group.' });

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'update', board.createdBy, memberData);

    // Enforce one active webhook per group
    const existing = await webhooksCollection
      .where('orgId', '==', user.orgId)
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ message: 'An active webhook already exists for this group. Revoke it before creating a new one.' });
    }

    const secret = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(secret);

    const docRef = webhooksCollection.doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      orgId: user.orgId,
      workspaceId: group.workspaceId,
      boardId,
      groupId,
      tokenHash,
      insertPosition: position,
      allowedOrigins: origins,
      status: 'active',
      createdBy: user.id,
      useCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'CREATE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      details: `Webhook created: ${docRef.id}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    const webhook = snapshotToData<DBWebhook>(await docRef.get())!;
    const { tokenHash: _omit, ...safeWebhook } = webhook;
    res.status(201).json({ ...safeWebhook, secret });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error creating webhook:', err);
    res.status(500).json({ message: 'Failed to create webhook.' });
  }
};

// ---------------------------------------------------------------------------
// GET /boards/:boardId/groups/:groupId/webhook  (authenticated)
// ---------------------------------------------------------------------------
export const getWebhook = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'read', board.createdBy, memberData);

    const snap = await webhooksCollection
      .where('orgId', '==', user.orgId)
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ message: 'No active webhook found.' });

    const webhook = snap.docs[0].data() as DBWebhook;
    const { tokenHash: _omit, ...safeWebhook } = webhook;
    res.json(safeWebhook);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error fetching webhook:', err);
    res.status(500).json({ message: 'Failed to fetch webhook.' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /boards/:boardId/groups/:groupId/webhook  (authenticated)
// ---------------------------------------------------------------------------
export const revokeWebhook = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const { boardId, groupId } = req.params;

  try {
    const boardDoc = await boardsCollection(user.orgId).doc(boardId).get();
    if (!boardDoc.exists) return res.status(404).json({ message: 'Board not found.' });
    const board = snapshotToData<DBBoard>(boardDoc)!;

    const groupDoc = await groupsCollection(user.orgId, boardId).doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ message: 'Group not found.' });
    const group = snapshotToData<DBGroup>(groupDoc)!;

    const memberDoc = await boardMembersCollection(user.orgId, boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? memberDoc.data() as DBBoardMember : null;
    assertGroupAccess(user, group, 'update', board.createdBy, memberData);

    const snap = await webhooksCollection
      .where('orgId', '==', user.orgId)
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snap.empty) return res.status(404).json({ message: 'No active webhook found.' });

    await snap.docs[0].ref.update({
      status: 'revoked',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    void logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'DELETE',
      resourceType: 'group',
      resourceId: groupId,
      workspaceId: user.orgId,
      orgId: user.orgId,
      details: `Webhook revoked: ${snap.docs[0].id}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] as string | undefined,
    });

    res.json({ message: 'Webhook revoked.' });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error('Error revoking webhook:', err);
    res.status(500).json({ message: 'Failed to revoke webhook.' });
  }
};

// ---------------------------------------------------------------------------
// POST /webhook/:webhookId  (public — no JWT)
// ---------------------------------------------------------------------------

/**
 * Parses incoming webhook body across three formats:
 *   1. Nested:   { name, values: { colId: val } }        — standard API callers, Zapier
 *   2. Flat:     { name, colId: val, ... }               — simple form senders
 *   3. Elementor:{ fields: [{id, value}] }               — Elementor Pro Webhook action
 */
function parseWebhookBody(body: Record<string, unknown>): {
  name: string | undefined;
  values: Record<string, unknown>;
} {
  // Elementor Pro format
  if (Array.isArray(body.fields)) {
    const fields = body.fields as Array<{ id?: unknown; value?: unknown }>;
    const nameField = fields.find((f) => f.id === 'name' || f.id === '_name');
    const name = typeof nameField?.value === 'string' ? nameField.value : undefined;
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (typeof f.id === 'string' && f.id !== 'name' && f.id !== '_name') {
        values[f.id] = f.value;
      }
    }
    return { name, values };
  }

  // Nested format
  if (body.values && typeof body.values === 'object' && !Array.isArray(body.values)) {
    return {
      name: typeof body.name === 'string' ? body.name : undefined,
      values: body.values as Record<string, unknown>,
    };
  }

  // Flat format — skip well-known non-column form meta fields
  const skip = new Set(['name', '_name', 'form_id', 'form_name', 'form_post_id', 'action', 'referrer']);
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!skip.has(k)) values[k] = v;
  }
  return { name: typeof body.name === 'string' ? body.name : undefined, values };
}

export const receiveWebhook = async (req: Request, res: Response) => {
  const { webhookId } = req.params;

  // 1. Accept token from Authorization: Bearer header OR ?token= query param
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim() || undefined;
  } else if (typeof req.query.token === 'string' && req.query.token) {
    token = req.query.token.trim();
  }
  if (!token) {
    return res.status(401).json({
      message: 'Token required. Use Authorization: Bearer <token> header or ?token=<token> URL param.',
    });
  }

  try {
    // 2. Look up webhook
    const webhookDoc = await webhooksCollection.doc(webhookId).get();
    if (!webhookDoc.exists) return res.status(404).json({ message: 'Webhook not found.' });

    const webhook = webhookDoc.data() as DBWebhook;

    if (webhook.status !== 'active') {
      return res.status(410).json({ message: 'This webhook has been revoked.' });
    }

    // 3. Validate token (timing-safe)
    const incomingHash = hashToken(token);
    if (!crypto.timingSafeEqual(Buffer.from(incomingHash, 'hex'), Buffer.from(webhook.tokenHash, 'hex'))) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    // 4. Validate origin (only checked when Origin header is present; ?token= URL flow skips this)
    const origin = req.headers.origin as string | undefined;
    if (origin && !isOriginAllowed(origin, webhook.allowedOrigins)) {
      return res.status(403).json({ message: 'Origin not allowed.' });
    }

    // 5. Validate group and board still exist and are not archived
    const groupDoc = await groupsCollection(webhook.orgId, webhook.boardId).doc(webhook.groupId).get();
    if (!groupDoc.exists) return res.status(410).json({ message: 'Target group no longer exists.' });
    const group = groupDoc.data() as DBGroup;
    if (group.isArchived) return res.status(410).json({ message: 'Target group is archived.' });

    const boardDoc = await boardsCollection(webhook.orgId).doc(webhook.boardId).get();
    if (!boardDoc.exists) return res.status(410).json({ message: 'Target board no longer exists.' });
    const board = boardDoc.data() as DBBoard;
    if (board.isArchived) return res.status(410).json({ message: 'Target board is archived.' });

    // 6. Parse body (supports nested, flat, and Elementor formats)
    const { name, values: parsedValues } = parseWebhookBody(
      (req.body ?? {}) as Record<string, unknown>,
    );
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Item name is required (field: "name").' });
    }
    const sanitizedName = sanitizeText(name.trim());
    const normalizedValues = parsedValues;

    // 7. Calculate order based on insertPosition
    let itemOrder: number;
    if (webhook.insertPosition === 'top') {
      const firstSnap = await itemsCollection(webhook.orgId)
        .where('boardId', '==', webhook.boardId)
        .where('groupId', '==', webhook.groupId)
        .where('isArchived', '==', false)
        .orderBy('order', 'asc')
        .limit(1)
        .get();
      itemOrder = firstSnap.empty ? 0 : (firstSnap.docs[0].data().order as number) - 1;
    } else {
      const countSnap = await itemsCollection(webhook.orgId)
        .where('boardId', '==', webhook.boardId)
        .where('groupId', '==', webhook.groupId)
        .count()
        .get();
      itemOrder = countSnap.data().count;
    }

    // 8. Create item
    const docRef = itemsCollection(webhook.orgId).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set({
      id: docRef.id,
      workspaceId: webhook.workspaceId,
      boardId: webhook.boardId,
      groupId: webhook.groupId,
      name: sanitizedName,
      order: itemOrder,
      createdBy: `webhook:${webhookId}`,
      isArchived: false,
      values: normalizedValues,
      status: null,
      assignees: [],
      dueDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    touchBoardVersion(webhook.orgId, webhook.boardId);

    // 9. Update webhook stats (fire-and-forget)
    void webhooksCollection.doc(webhookId).update({
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      useCount: admin.firestore.FieldValue.increment(1),
    }).catch(() => undefined);

    const created = (await docRef.get()).data();
    res.status(201).json(created);
  } catch (err: unknown) {
    logger.error(`Error receiving webhook ${webhookId}:`, err);
    res.status(500).json({ message: 'Failed to process webhook.' });
  }
};
