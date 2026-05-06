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

// ---------------------------------------------------------------------------
// GET /items/:itemId/chat
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

    res.json(querySnapshotToArray<DBChatMessage>(snap));
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error fetching chat for item ${req.params.itemId ?? req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch chat messages.' });
  }
};

// ---------------------------------------------------------------------------
// POST /items/:itemId/chat/upload-url
//
// Returns a short-lived signed PUT URL so the browser can upload a file
// directly to Firebase Storage without the bytes ever passing through this
// server.  Auth + size/type checks happen here; the actual upload is a plain
// HTTP PUT from the client to Google's storage endpoint.
//
// Prerequisites (one-time setup):
//   1. Grant the Cloud Run service account the "Service Account Token Creator"
//      role so it can sign URLs:
//        gcloud projects add-iam-policy-binding PROJECT_ID \
//          --member="serviceAccount:SA_EMAIL" \
//          --role="roles/iam.serviceAccountTokenCreator"
//   2. Configure CORS on the Storage bucket so browsers can PUT from your
//      domain (run once from any machine with gsutil):
//        gsutil cors set cors.json gs://YOUR_BUCKET
//      where cors.json contains:
//        [{"origin":["https://your-app.web.app","http://localhost:5173"],
//          "method":["PUT"],"responseHeader":["Content-Type","x-goog-acl"],
//          "maxAgeSeconds":3600}]
// ---------------------------------------------------------------------------
export const getChatUploadUrl = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const id = req.params.itemId ?? req.params.id;
  const { filename, mimeType, size } = req.body;

  if (typeof filename !== 'string' || !filename.trim()) {
    return res.status(400).json({ message: 'filename is required.' });
  }
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({ message: `File type not allowed: ${mimeType}` });
  }
  if (typeof size !== 'number' || size <= 0 || size > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({ message: 'File exceeds the 10 MB limit.' });
  }

  try {
    const doc = await itemsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Item not found.' });

    const item = snapshotToData<DBItem>(doc)!;
    const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
    assertItemAccess(user, item, 'update', memberData);

    const safeName = filename.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const storagePath = `chatFiles/${user.orgId}/${id}/${uniqueId}_${safeName}`;
    const file = storage.bucket().file(storagePath);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      contentType: mimeType,
      // x-goog-acl tells Storage to make the object publicly readable on upload
      extensionHeaders: { 'x-goog-acl': 'public-read' },
    });

    res.json({ uploadUrl, downloadUrl: file.publicUrl() });
  } catch (err: unknown) {
    if (isAuthError(err)) return res.status(err.status).json({ message: err.message });
    logger.error(`Error generating upload URL for item ${req.params.itemId ?? req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to generate upload URL.' });
  }
};

// ---------------------------------------------------------------------------
// POST /items/:itemId/chat
//
// JSON body: { text: string, attachments?: [{ url, name, mimeType, size }] }
// Files are already in Storage at this point — this endpoint only writes
// metadata to Firestore.
// ---------------------------------------------------------------------------
export const postChatMessage = async (req: Request, res: Response) => {
  const user = req.user as JwtUserPayload;
  const id = req.params.itemId ?? req.params.id;
  const text: string = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  const rawAttachments: DBChatAttachment[] = Array.isArray(req.body.attachments)
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

  try {
    const doc = await itemsCollection(user.orgId).doc(id).get();
    if (!doc.exists) return res.status(404).json({ message: 'Item not found.' });

    const item = snapshotToData<DBItem>(doc)!;
    const memberDoc = await boardMembersCollection(user.orgId, item.boardId).doc(user.id).get();
    const memberData = memberDoc.exists ? (memberDoc.data() as DBBoardMember) : null;
    assertItemAccess(user, item, 'update', memberData);

    const authorDoc = await usersCollection.doc(user.id).get();
    const authorData = authorDoc.exists ? (authorDoc.data() as DBUser) : null;

    const messageRef = itemChatMessagesCollection(user.orgId, id).doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const messageData: Record<string, unknown> = {
      id: messageRef.id,
      itemId: id,
      authorId: user.id,
      authorName: authorData?.name ?? user.id,
      authorProfileImageUrl: authorData?.profileImageUrl ?? '',
      text,
      attachments: rawAttachments,
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
