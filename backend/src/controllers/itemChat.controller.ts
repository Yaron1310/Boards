import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, storage, snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { itemsCollection, itemChatMessagesCollection, boardMembersCollection, usersCollection } from '../db/collections.js';
import { JwtUserPayload, DBItem, DBUser, DBBoardMember, DBChatMessage, DBChatAttachment } from '../types/index.js';
import { assertItemAccess } from '../utils/workManagementAuth.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

function isAuthError(err: unknown): err is { status: number; message: string } {
  return typeof err === 'object' && err !== null && 'status' in err && 'message' in err;
}

async function uploadChatFileToStorage(
  buffer: Buffer,
  orgId: string,
  itemId: string,
  messageId: string,
  originalName: string,
  contentType: string,
): Promise<string> {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chatFiles/${orgId}/${itemId}/${messageId}_${safeName}`;
  const file = storage.bucket().file(path);
  await file.save(buffer, {
    metadata: { contentType, cacheControl: 'public, max-age=86400' },
    public: true,
  });
  return file.publicUrl();
}

// ---------------------------------------------------------------------------
// GET /items/:id/chat
// ---------------------------------------------------------------------------
export const getChatMessages = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const id = req.params.itemId ?? req.params.id;

  try {
    const doc = await itemsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Item not found.' });

    const item = snapshotToData<DBItem>(doc)!;
    const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
    assertItemAccess(user, item, 'read', memberData);

    const snap = await itemChatMessagesCollection(user.orgId, id)
      .orderBy('createdAt', 'asc')
      .get();

    const messages = querySnapshotToArray<DBChatMessage>(snap);
    res.json(messages);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching chat for item ${req.params.itemId ?? req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch chat messages.' });
  }
};

interface IncomingAttachment {
  name: string;
  mimeType: string;
  size: number;
  base64: string; // data:<mime>;base64,<data>  or raw base64
}

// ---------------------------------------------------------------------------
// POST /items/:id/chat   (JSON body: { text, attachments? })
// ---------------------------------------------------------------------------
export const postChatMessage = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const id = req.params.itemId ?? req.params.id;
  const text: string = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  const rawAttachments: IncomingAttachment[] = Array.isArray(req.body.attachments)
    ? req.body.attachments
    : [];

  if (!text && rawAttachments.length === 0) {
    return res.status(400).json({ message: 'Message must contain text or at least one attachment.' });
  }
  if (text.length > 4000) {
    return res.status(400).json({ message: 'Message text must be 4000 characters or fewer.' });
  }
  if (rawAttachments.length > 5) {
    return res.status(400).json({ message: 'Maximum 5 attachments per message.' });
  }

  // Validate each attachment before touching the DB
  for (const att of rawAttachments) {
    if (!ALLOWED_MIME_TYPES.has(att.mimeType)) {
      return res.status(400).json({ message: `File type not allowed: ${att.mimeType}` });
    }
    const base64Data = att.base64.replace(/^data:[^;]+;base64,/, '');
    const estimatedBytes = Math.ceil(base64Data.length * 0.75);
    if (estimatedBytes > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ message: `File "${att.name}" exceeds the 10 MB limit.` });
    }
  }

  try {
    const doc = await itemsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Item not found.' });

    const item = snapshotToData<DBItem>(doc)!;
    const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
    assertItemAccess(user, item, 'update', memberData);

    const authorDoc = await usersCollection.doc(user.id).get();
    const authorData = authorDoc.exists ? (authorDoc.data() as DBUser) : null;
    const authorName = authorData?.name ?? user.id;
    const authorProfileImageUrl = authorData?.profileImageUrl ?? '';

    const messageRef = itemChatMessagesCollection(user.orgId, id).doc();
    const messageId = messageRef.id;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Upload attachments to Firebase Storage
    const attachments: DBChatAttachment[] = [];
    for (const att of rawAttachments) {
      const base64Data = att.base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const url = await uploadChatFileToStorage(buffer, user.orgId, id, messageId, att.name, att.mimeType);
      attachments.push({ url, name: att.name, mimeType: att.mimeType, size: att.size });
    }

    const messageData: Record<string, unknown> = {
      id: messageId,
      itemId: id,
      authorId: user.id,
      authorName,
      authorProfileImageUrl,
      text,
      attachments,
      createdAt: timestamp,
    };

    const batch = db.batch();
    batch.set(messageRef, messageData);
    batch.update(itemsCollection(user.orgId).doc(id), {
      chatMessageCount: admin.firestore.FieldValue.increment(1),
      chatLastMessageAt: timestamp,
    });
    await batch.commit();

    const created = snapshotToData<DBChatMessage>(await messageRef.get())!;
    res.status(201).json(created);
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error posting chat message for item ${req.params.itemId ?? req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to post chat message.' });
  }
};
