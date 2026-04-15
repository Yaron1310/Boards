import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import {
    conversationsCollection,
    usersCollection,
    membershipsCollection
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, UserRole, DBConversation, DBMessage, PaginatedResponse } from '../types/index.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { encryptValue, decryptValue } from '../services/crypto.service.js';
import { logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';

export const getUserConversations = async (req: Request, res: Response) => {
    try {
        const user = req.user as JwtUserPayload;
        const { limit, cursor, search } = parsePaginationParams(req);
        const personaId = req.query.personaId as string;

        let query: admin.firestore.Query = conversationsCollection;

        if (user.role === UserRole.REGULAR_USER) {
            query = query.where('userId', '==', user.id);
        } else if (user.role === UserRole.ORGANIZATION_ADMIN && user.selectedOrganizationId) {
            query = query.where('organizationId', '==', user.selectedOrganizationId);
        } else if (user.role === UserRole.ACADEMY_ADMIN) {
            query = query.where('academyId', '==', user.academyId);
        } else if (user.role === UserRole.SYSTEM_ADMIN) {
            // System admin sees all conversations — no filter needed
        }

        if (personaId) {
            query = query.where('personaId', '==', personaId);
        }

        // For admin-level privacy filter, use Firestore query when not own data
        if (user.role !== UserRole.REGULAR_USER) {
            query = query.where('isPrivate', '==', false); // Note: Simplified to == false for easier indexing if needed, but original used != true
        }

        query = query.orderBy('date', 'desc');

        if (cursor) {
            const startDoc = await conversationsCollection.doc(cursor).get();
            if (startDoc.exists) {
                query = query.startAfter(startDoc);
            }
        }

        query = query.limit(limit + 1);

        const snapshot = await query.get();
        let conversations = querySnapshotToArray<DBConversation>(snapshot);

        // Apply search filter (search in personaName)
        if (search) {
            conversations = conversations.filter(conv =>
                conv.personaName?.toLowerCase().includes(search)
            );
        }

        // Strip the messages array from list responses — messages are now in a subcollection
        const processed = conversations.map(conv => {
            const { messages, ...rest } = conv;
            return rest as DBConversation;
        });

        const hasMore = processed.length > limit;
        const data = hasMore ? processed.slice(0, limit) : processed;
        const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

        res.json({
            data,
            cursor: nextCursor,
            hasMore,
        } as PaginatedResponse<any>);

    } catch (error: any) {
        logger.error("Error fetching conversations:", error);
        if (error.code === 9) { // FAILED_PRECONDITION
             return res.status(500).json({ message: "Database query failed. A composite index is likely required. Check backend logs for a creation link."});
        }
        res.status(500).json({ message: "Failed to fetch conversations." });
    }
};

export const saveUserConversation = async (req: Request, res: Response) => {
    const { messages, extractedFactors, personaId, personaName, isPrivate } = req.body;
    const userPayload = req.user as JwtUserPayload;
    const userId = userPayload.id;
    try {
        const newConvRef = conversationsCollection.doc();
        const parsedMessages: DBMessage[] = (messages || []).map((m: any) => ({
            ...m,
            text: typeof m.text === 'string' ? encryptValue(m.text) : m.text,
            timestamp: new Date(m.timestamp)
        }));

        const lastMessage = parsedMessages.length > 0 ? parsedMessages[parsedMessages.length - 1] : null;

        const newConv = {
            id: newConvRef.id,
            userId,
            academyId: userPayload.academyId,
            organizationId: userPayload.selectedOrganizationId,
            personaId,
            personaName,
            date: new Date(),
            messageCount: parsedMessages.length,
            lastMessageAt: lastMessage ? lastMessage.timestamp : new Date(),
            extractedFactors,
            isPrivate: isPrivate ?? true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Write conversation document (without messages array)
        const batch = admin.firestore().batch();
        batch.set(newConvRef, newConv);

        // Increment counts on User and Membership documents
        const userRef = usersCollection.doc(userId);
        batch.update(userRef, {
            conversationCount: admin.firestore.FieldValue.increment(1)
        });

        const membershipId = `${userId}_${userPayload.selectedOrganizationId || userPayload.academyId}`;
        const membershipRef = membershipsCollection.doc(membershipId);
        batch.update(membershipRef, {
            conversationCount: admin.firestore.FieldValue.increment(1)
        });

        await batch.commit();

        // Write messages to subcollection in batches
        const messagesRef = newConvRef.collection('messages');
        const batchSize = 500; // Firestore batch limit
        for (let i = 0; i < parsedMessages.length; i += batchSize) {
            const batch = admin.firestore().batch();
            const chunk = parsedMessages.slice(i, i + batchSize);
            chunk.forEach((msg, index) => {
                const msgDoc = messagesRef.doc();
                batch.set(msgDoc, {
                    ...msg,
                    order: i + index, // Preserve message ordering
                });
            });
            await batch.commit();
        }

        res.status(201).json({ ...newConv, createdAt: new Date() });
    } catch (error) {
        logger.error("Error saving conversation:", error);
        res.status(500).json({ message: "Failed to save conversation." });
    }
};

export const archiveConversationInsight = async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const user = req.user as JwtUserPayload;
    try {
        const convRef = conversationsCollection.doc(conversationId);
        const convDoc = await convRef.get();
        if (!convDoc.exists) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        const conversation = snapshotToData<DBConversation>(convDoc)!;
        if (conversation.userId !== user.id) {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        await convRef.update({ isInsightArchivedByUser: true });
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving conversation insight ${conversationId}:`, error);
        res.status(500).json({ message: 'Failed to archive conversation insight.' });
    }
};

export const restoreConversationInsight = async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const user = req.user as JwtUserPayload;
    try {
        const convRef = conversationsCollection.doc(conversationId);
        const convDoc = await convRef.get();
        if (!convDoc.exists) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }
        const conversation = snapshotToData<DBConversation>(convDoc)!;
        if (conversation.userId !== user.id) {
            return res.status(403).json({ message: 'Forbidden.' });
        }
        await convRef.update({ isInsightArchivedByUser: false });
        res.json(snapshotToData(await convRef.get()));
    } catch (error) {
        logger.error(`Error restoring conversation insight ${conversationId}:`, error);
        res.status(500).json({ message: 'Failed to restore conversation insight.' });
    }
};

export const getConversationMessages = async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const user = req.user as JwtUserPayload;
    const { limit, cursor } = parsePaginationParams(req);

    try {
        const convRef = conversationsCollection.doc(conversationId);
        const convDoc = await convRef.get();

        if (!convDoc.exists) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const conversation = snapshotToData<DBConversation>(convDoc)!;

        // Authorization: owner can always see their messages; admins can see non-private
        const isOwner = conversation.userId === user.id;
        const isAdmin = user.role === UserRole.ACADEMY_ADMIN || user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.ORGANIZATION_ADMIN;
        if (!isOwner && (!isAdmin || conversation.isPrivate)) {
            return res.status(403).json({ message: 'You do not have permission to view these messages.' });
        }

        const messagesRef = convRef.collection('messages');
        let query: admin.firestore.Query = messagesRef.orderBy('order', 'asc');

        if (cursor) {
            const startDoc = await messagesRef.doc(cursor).get();
            if (startDoc.exists) {
                query = query.startAfter(startDoc);
            }
        }

        query = query.limit(limit + 1);

        const snapshot = await query.get();
        const allMessages = snapshot.docs.map(doc => {
            const d = { id: doc.id, ...doc.data() } as DBMessage & { order: number };
            return { ...d, text: typeof d.text === 'string' ? decryptValue(d.text) : d.text };
        });

        const hasMore = allMessages.length > limit;
        const data = hasMore ? allMessages.slice(0, limit) : allMessages;
        const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

        void logAuditAndCheckAnomaly({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'READ',
            resourceType: 'conversation',
            resourceId: conversationId,
            organizationId: user.selectedOrganizationId,
            academyId: user.academyId,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'],
            details: isOwner ? undefined : `admin access to conversation owned by ${conversation.userId}`,
        });

        res.json({
            data,
            cursor: nextCursor,
            hasMore,
        } as PaginatedResponse<any>);

    } catch (error) {
        logger.error(`Error fetching messages for conversation ${conversationId}:`, error);
        res.status(500).json({ message: 'Failed to fetch conversation messages.' });
    }
};

export const deleteConversationMessages = async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const user = req.user as JwtUserPayload;

    try {
        const convRef = conversationsCollection.doc(conversationId);
        const convDoc = await convRef.get();

        if (!convDoc.exists) {
            return res.status(404).json({ message: 'Conversation not found.' });
        }

        const conversation = snapshotToData<DBConversation>(convDoc)!;

        // Authorization check: Only the owner of the conversation or an admin can delete it.
        const canDelete = user.role === UserRole.ACADEMY_ADMIN ||
                          user.role === UserRole.SYSTEM_ADMIN ||
                          conversation.userId === user.id;

        if (!canDelete) {
            return res.status(403).json({ message: 'You do not have permission to delete this conversation.' });
        }

        // Delete all message documents from the subcollection in batches
        const messagesRef = convRef.collection('messages');
        const batchSize = 500;
        let deleted = 0;
        do {
            const snapshot = await messagesRef.limit(batchSize).get();
            deleted = snapshot.size;
            if (deleted === 0) break;

            const batch = admin.firestore().batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } while (deleted >= batchSize);

        // Update conversation document to reflect no messages
        await convRef.update({
            messageCount: 0,
            lastMessageAt: admin.firestore.FieldValue.delete(),
        });

        logger.info(`Messages for conversation ${conversationId} deleted by user ${user.id}.`);

        const updatedConvDoc = await convRef.get();
        res.status(200).json(snapshotToData(updatedConvDoc));

    } catch (error) {
        logger.error(`Error deleting messages for conversation ${conversationId}:`, error);
        res.status(500).json({ message: 'Failed to delete conversation messages.' });
    }
};