
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Buffer } from 'node:buffer';
import { db, storage } from '../services/firestore.service.js';

import {
    usersCollection,
    workspacesCollection,
    preapprovedUsersCollection,
    membershipsCollection,
    organizationsCollection
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBUser, DBWorkspace, DBPreapprovedUser, UserRole, DBMembership, PaginatedResponse } from '../types/index.js';
import { formatUserForFrontend } from './auth.controller.js';
import { sanitizeText, sanitizeImageUrl } from '../utils/sanitizer.js';
import { sendUserInvitationEmail } from '../services/email.service.js';
import { env } from '../config/env.js';
import { parsePaginationParams, buildPaginatedResult } from '../utils/pagination.js';
import { validatePasswordComplexity } from '../utils/password.js';
import { logAudit } from '../services/audit.service.js';

export const preApproveUsersInBulk = async (req: Request, res: Response) => {
    const { emails, workspaceId } = req.body as { emails: string[], workspaceId: string };
    const requestingUser = req.user as JwtUserPayload;

    if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: 'A non-empty array of emails is required.' });
    }

    const targetOrgId = (requestingUser.role === UserRole.SYSTEM_ADMIN || requestingUser.role === UserRole.ORGANIZATION_ADMIN) ? workspaceId : requestingUser.selectedWorkspaceId;
    if (!targetOrgId) return res.status(400).json({ message: 'An workspace ID is required.' });

    try {
        const orgDoc = await workspacesCollection.doc(targetOrgId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: 'Target workspace not found.' });
        const orgData = orgDoc.data() as DBWorkspace;
        if (requestingUser.role === UserRole.ORGANIZATION_ADMIN && orgData.orgId !== requestingUser.orgId) {
            return res.status(403).json({ message: 'You do not have permission to approve users for this workspace.' });
        }

        const batch = db.batch();
        const lowercasedEmails = emails.map(e => sanitizeText(e).toLowerCase().trim()).filter(Boolean);
        const uniqueEmails = [...new Set(lowercasedEmails)];

        let preApprovedCount = 0;
        let updatedUserCount = 0;
        const newlyPreApprovedEmails: string[] = [];

        const existingUsersMap = new Map<string, DBUser>();
        const emailChunksForProcessing: string[][] = [];
        for (let i = 0; i < uniqueEmails.length; i += 30) {
            emailChunksForProcessing.push(uniqueEmails.slice(i, i + 30));
        }

        for (const chunk of emailChunksForProcessing) {
            if (chunk.length > 0) {
                const existingUsersSnapshot = await usersCollection.where('email', 'in', chunk).get();
                existingUsersSnapshot.forEach(doc => {
                    const user = snapshotToData<DBUser>(doc)!;
                    existingUsersMap.set(user.email, user);
                });
            }
        }

        for (const email of uniqueEmails) {
            if (existingUsersMap.has(email)) {
                const user = existingUsersMap.get(email)!;
                const membershipSnapshot = await membershipsCollection
                    .where('userId', '==', user.id)
                    .where('entityId', '==', targetOrgId)
                    .limit(1).get();

                if (membershipSnapshot.empty) {
                    const defaultOrgSnapshot = await workspacesCollection
                        .where('orgId', '==', orgData.orgId)
                        .where('name', '==', 'Default Workspace')
                        .limit(1)
                        .get();

                    if (!defaultOrgSnapshot.empty) {
                        const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                        if (targetOrgId !== defaultOrgId) {
                            const defaultOrgMembershipSnapshot = await membershipsCollection
                                .where('userId', '==', user.id)
                                .where('entityId', '==', defaultOrgId)
                                .get();

                            if (!defaultOrgMembershipSnapshot.empty) {
                                defaultOrgMembershipSnapshot.forEach(doc => {
                                    batch.delete(doc.ref);
                                    logger.info(`User ${user.email} removed from Default Workspace (${defaultOrgId}) because they are being added to a new one.`);
                                });
                            }
                        }
                    }

                    const newMembershipRef = membershipsCollection.doc();
                    batch.set(newMembershipRef, {
                        id: newMembershipRef.id,
                        userId: user.id,
                        entityId: targetOrgId,
                        entityType: 'workspace',
                        role: UserRole.REGULAR_USER,
                        orgId: orgData.orgId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    updatedUserCount++;
                }
            } else {
                const docId = Buffer.from(`${email}_${targetOrgId}`).toString('base64');
                const docRef = preapprovedUsersCollection.doc(docId);
                const preapprovedUserEntry: Omit<DBPreapprovedUser, 'id'> = {
                    email: email,
                    workspaceId: targetOrgId,
                    orgId: orgData.orgId,
                    addedBy: requestingUser.id,
                    createdAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
                };
                batch.set(docRef, preapprovedUserEntry);
                newlyPreApprovedEmails.push(email);
                preApprovedCount++;
            }
        }

        if (preApprovedCount > 0 || updatedUserCount > 0) {
            await batch.commit();
        }

        if (newlyPreApprovedEmails.length > 0) {
            const organizationDoc = await organizationsCollection.doc(orgData.orgId).get();
            const organizationName = organizationDoc.exists ? (organizationDoc.data()?.name || 'Logyx') : 'Logyx';
            const registrationLink = `${env.FRONTEND_URL}/register`;
            await Promise.allSettled(
                newlyPreApprovedEmails.map(email => sendUserInvitationEmail(email, orgData.name, organizationName, registrationLink))
            );
        }

        let message = '';
        if (preApprovedCount > 0 && updatedUserCount > 0) {
            message = `${preApprovedCount} new email(s) have been pre-approved. ${updatedUserCount} existing user(s) have been added to the workspace.`;
        } else if (preApprovedCount > 0) {
            message = `${preApprovedCount} new email(s) have been pre-approved.`;
        } else if (updatedUserCount > 0) {
            message = `${updatedUserCount} existing user(s) have been added to the workspace.`;
        } else {
            message = 'No new users were pre-approved or added. They may already have access.';
        }

        res.status(200).json({ message, successCount: preApprovedCount + updatedUserCount });
    } catch (error) {
        logger.error("Error pre-approving users in bulk:", error);
        res.status(500).json({ message: "Failed to pre-approve users." });
    }
};

export const getPreApprovedUsers = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;

    if (user.role === UserRole.WORKSPACE_ADMIN && !user.selectedWorkspaceId) {
        return res.status(400).json({ message: "Manager is not associated with an workspace." });
    }

    try {
        const { limit, cursor, search } = parsePaginationParams(req);

        let query: admin.firestore.Query = preapprovedUsersCollection;

        if (user.role === UserRole.WORKSPACE_ADMIN) {
            query = query.where('workspaceId', '==', user.selectedWorkspaceId);
        } else if (user.role === UserRole.ORGANIZATION_ADMIN) {
            query = query.where('orgId', '==', user.orgId);
        }

        query = query.orderBy('email');

        if (cursor) {
            const startDoc = await preapprovedUsersCollection.doc(cursor).get();
            if (startDoc.exists) {
                query = query.startAfter(startDoc);
            }
        }

        query = query.limit(limit + 1);

        const snapshot = await query.get();
        let items = querySnapshotToArray<DBPreapprovedUser>(snapshot);

        // Apply search filter if provided
        if (search) {
            items = items.filter(item => item.email.toLowerCase().includes(search));
        }

        const result = buildPaginatedResult(items, limit);
        res.json(result);
    } catch (error: any) {
        logger.error("Error fetching pre-approved users:", error);
        res.status(500).json({ message: "Failed to fetch pre-approved users." });
    }
};


export const deletePreApprovedUser = async (req: Request, res: Response) => {
    const manager = req.user as JwtUserPayload;
    const preApprovedId = req.params.id;
    try {
      const docRef = preapprovedUsersCollection.doc(preApprovedId);
      const doc = await docRef.get();
      if (!doc.exists) return res.status(404).json({ message: "Pre-approved entry not found." });
      if (manager.role === UserRole.WORKSPACE_ADMIN) {
        const entry = snapshotToData<DBPreapprovedUser>(doc)!;
        if (entry.workspaceId !== manager.selectedWorkspaceId) {
          return res.status(403).json({ message: "Forbidden: You can only manage pre-approvals for your own workspace." });
        }
      }
      await docRef.delete();
      res.status(204).send();
    } catch (error) {
      logger.error("Error deleting pre-approved user:", error);
      res.status(500).json({ message: "Failed to delete pre-approved entry." });
    }
};

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const user = req.user as JwtUserPayload;
        const { limit, cursor, search } = parsePaginationParams(req);
        const workspaceId = req.query.workspaceId as string;
        const roleFilter = req.query.role as string;

        // Build membership query scoped by role
        let membershipQuery: admin.firestore.Query = membershipsCollection;

        if (user.role === UserRole.SYSTEM_ADMIN) {
            // System admin sees all
            if (workspaceId) {
                membershipQuery = membershipQuery.where('entityId', '==', workspaceId);
            }
        } else if (user.role === UserRole.ORGANIZATION_ADMIN) {
            membershipQuery = membershipQuery.where('orgId', '==', user.orgId);
            if (workspaceId) {
                membershipQuery = membershipQuery.where('entityId', '==', workspaceId);
            }
        } else if (user.role === UserRole.WORKSPACE_ADMIN && user.selectedWorkspaceId) {
            membershipQuery = membershipQuery.where('entityId', '==', user.selectedWorkspaceId);
        } else {
            return res.json({ data: [], cursor: null, hasMore: false });
        }

        if (roleFilter) {
            membershipQuery = membershipQuery.where('role', '==', roleFilter);
        }

        const snapshot = await membershipQuery.orderBy('userName').get();
        const memberships = querySnapshotToArray<DBMembership>(snapshot);

        // Deduplicate by userId (a user can have multiple memberships)
        const seenUserIds = new Set<string>();
        let uniqueMemberships = memberships.filter(m => {
            if (seenUserIds.has(m.userId)) return false;
            seenUserIds.add(m.userId);
            return true;
        });

        // Apply search filter on denormalized fields
        if (search) {
            uniqueMemberships = uniqueMemberships.filter(m =>
                (m.userName?.toLowerCase().includes(search)) ||
                (m.userEmail?.toLowerCase().includes(search))
            );
        }

        // Apply cursor-based pagination
        let startIndex = 0;
        if (cursor) {
            const cursorIdx = uniqueMemberships.findIndex(m => m.userId === cursor);
            if (cursorIdx !== -1) {
                startIndex = cursorIdx + 1;
            }
        }

        const pageSlice = uniqueMemberships.slice(startIndex, startIndex + limit + 1);
        const hasMore = pageSlice.length > limit;
        const pageData = hasMore ? pageSlice.slice(0, limit) : pageSlice;

        // Fetch full user data for this page only
        const userIdsForPage = pageData.map(m => m.userId);
        if (userIdsForPage.length === 0) {
            return res.json({ data: [], cursor: null, hasMore: false });
        }

        const userDocPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < userIdsForPage.length; i += 30) {
            const chunk = userIdsForPage.slice(i, i + 30);
            userDocPromises.push(usersCollection.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get());
        }
        const userDocSnapshots = await Promise.all(userDocPromises);
        const dbUsers = userDocSnapshots.flatMap(snap => querySnapshotToArray<DBUser>(snap));

        const formattedUsersPromises = dbUsers.map(u => formatUserForFrontend(u, {
            orgId: user.role === UserRole.ORGANIZATION_ADMIN ? user.orgId : undefined,
            workspaceId: user.role === UserRole.WORKSPACE_ADMIN ? user.selectedWorkspaceId : undefined,
        }));

        const formattedUsers = await Promise.all(formattedUsersPromises);

        // Filter out system admins for non-system-admin requesters
        const finalUsers = user.role === UserRole.SYSTEM_ADMIN
            ? formattedUsers
            : formattedUsers.filter(u => !u.dbRoles.systemAdmin);

        // Maintain the same order as the membership query
        const userMap = new Map(finalUsers.map(u => [u.id, u]));
        const orderedUsers = userIdsForPage.map(id => userMap.get(id)).filter(Boolean);

        const nextCursor = hasMore && orderedUsers.length > 0 ? orderedUsers[orderedUsers.length - 1]!.id : null;

        res.json({
            data: orderedUsers,
            cursor: nextCursor,
            hasMore,
            total: uniqueMemberships.length,
        } as PaginatedResponse<any>);
    } catch (error: any) {
        logger.error("Error fetching users:", error);
        res.status(500).json({ message: "Failed to fetch users." });
    }
};

export const getMyUserDetails = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    if (!userPayload?.id) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const userDoc = await usersCollection.doc(userPayload.id).get();
        if (!userDoc.exists) return res.status(404).json({ message: 'User not found' });

        const dbUser = snapshotToData<DBUser>(userDoc)!;
        const formattedUser = await formatUserForFrontend(dbUser, { role: userPayload.role });

        if (!userPayload.selectedWorkspaceId) {
             return res.json({ user: formattedUser, selectedWorkspace: null });
        }

        let orgData: DBWorkspace | null = null;
        const orgDoc = await workspacesCollection.doc(userPayload.selectedWorkspaceId).get();
        if (orgDoc.exists) {
            orgData = snapshotToData<DBWorkspace>(orgDoc)!;
        } else {
            const membershipsSnapshot = await membershipsCollection.where('userId', '==', dbUser.id).where('entityType', '==', 'workspace').limit(1).get();
            if (membershipsSnapshot.empty) {
                 return res.json({ user: formattedUser, selectedWorkspace: null });
            }
            const fallbackOrgId = membershipsSnapshot.docs[0].data().entityId;
            const fallbackOrgDoc = await workspacesCollection.doc(fallbackOrgId).get();
            if (!fallbackOrgDoc.exists) {
                return res.json({ user: formattedUser, selectedWorkspace: null });
            }
            orgData = snapshotToData<DBWorkspace>(fallbackOrgDoc)!;
        }

        const selectedWorkspaceForFrontend: any = {
            id: orgData.id,
            name: orgData.name,
            orgId: orgData.orgId,
            isPersonal: orgData.isPersonal
        };

        // Fetch workspace name to include in the response
        const organizationDoc = await organizationsCollection.doc(orgData.orgId).get();
        if (organizationDoc.exists) {
            selectedWorkspaceForFrontend.organizationName = organizationDoc.data()?.name;
        }

        res.json({ user: formattedUser, selectedWorkspace: selectedWorkspaceForFrontend });
    } catch (error) {
        logger.error("Error fetching own user details for session validation:", error);
        res.status(500).json({ message: 'Failed to fetch user details' });
    }
};

const ALLOWED_LANGUAGE_CODES = ['en', 'es', 'he'];

export const updateMyUserDetails = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    const userId = userPayload.id;
    const { name, email, preferredLanguage } = req.body;
    try {
        const userRef = usersCollection.doc(userId);
        const updates: any = {};
        if (name) updates.name = sanitizeText(name);
        if (email) {
            const sanitizedEmail = sanitizeText(email);
            const emailExists = await usersCollection.where('email', '==', sanitizedEmail).limit(1).get();
            if (!emailExists.empty && emailExists.docs[0].id !== userId) {
                return res.status(400).json({ message: 'Email already in use.' });
            }
            updates.email = sanitizedEmail;
        }
        if (preferredLanguage !== undefined) {
            if (!ALLOWED_LANGUAGE_CODES.includes(preferredLanguage)) {
                return res.status(400).json({ message: 'Invalid language code.' });
            }
            updates.preferredLanguage = preferredLanguage;
        }

        await userRef.update(updates);

        // Fan-out: update denormalized user fields on all membership documents
        const membershipUpdates: Record<string, any> = {};
        if (updates.name) membershipUpdates.userName = updates.name;
        if (updates.email) membershipUpdates.userEmail = updates.email;
        if (Object.keys(membershipUpdates).length > 0) {
            const membershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
            const batch = db.batch();
            membershipsSnapshot.forEach(doc => batch.update(doc.ref, membershipUpdates));
            await batch.commit();
        }

        const updatedUserDoc = await userRef.get();
        const dbUser = snapshotToData<DBUser>(updatedUserDoc)!;
        const formattedUser = await formatUserForFrontend(dbUser, { role: userPayload.role });
        res.json(formattedUser);
    } catch (error) {
        logger.error("Error updating user details:", error);
        res.status(500).json({ message: 'Failed to update details.' });
    }
};

export const updateMyPassword = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    const { currentPassword, newPassword } = req.body;
    const passwordError = validatePasswordComplexity(newPassword);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }
    try {
        const userRef = usersCollection.doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;
        if (user.passwordHash) {
            if (!currentPassword) return res.status(400).json({ message: "Current password is required to change it." });
            const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
            if (!isPasswordValid) return res.status(400).json({ message: "Incorrect current password." });
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await userRef.update({ passwordHash: newPasswordHash });
        res.json({ message: "Password updated successfully." });
    } catch (error) {
        logger.error("Error updating password:", error);
        res.status(500).json({ message: "Failed to update password." });
    }
};

async function uploadImageFileToStorage(buffer: Buffer, storagePath: string, contentType: string = 'image/webp', cacheControl: string = 'public, max-age=86400'): Promise<string> {
    const file = storage.bucket().file(storagePath);
    await file.save(buffer, {
        metadata: { contentType, cacheControl },
        public: true,
    });
    return `${file.publicUrl()}?v=${Date.now()}`;
}

async function uploadProfileImageToStorage(buffer: Buffer, userId: string): Promise<string> {
    return uploadImageFileToStorage(buffer, `userProfileImages/${userId}/profile.webp`);
}

export const updateMyProfileImage = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    const userId = userPayload.id;
    const { imageUrl } = req.body;
    try {
        let resolvedUrl = '';

        // Handle file upload via multipart/form-data
        if ((req as any).file) {
            try {
                resolvedUrl = await uploadProfileImageToStorage((req as any).file.buffer, userId);
            } catch (uploadErr) {
                logger.error('Failed to upload profile image to Storage:', uploadErr);
                return res.status(500).json({ message: 'Failed to upload profile image.' });
            }
        } else if (imageUrl) {
            // Handle direct HTTPS URL (no upload needed)
            resolvedUrl = sanitizeImageUrl(imageUrl);
        }

        await usersCollection.doc(userId).update({ profileImageUrl: resolvedUrl || admin.firestore.FieldValue.delete() });

        // Fan-out: update denormalized profile image on all membership documents
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        if (!membershipsSnapshot.empty) {
            const batch = db.batch();
            membershipsSnapshot.forEach(doc => batch.update(doc.ref, {
                userProfileImageUrl: resolvedUrl || admin.firestore.FieldValue.delete()
            }));
            await batch.commit();
        }

        const updatedUserDoc = await usersCollection.doc(userId).get();
        const dbUser = snapshotToData<DBUser>(updatedUserDoc)!;
        const formattedUser = await formatUserForFrontend(dbUser, { role: userPayload.role });
        res.json(formattedUser);
    } catch (error) {
        logger.error("Error updating profile image:", error);
        res.status(500).json({ message: "Failed to update profile image." });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const userDoc = await usersCollection.doc(req.params.userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: 'User not found.' });
        const targetDbUser = snapshotToData<DBUser>(userDoc)!;
        const requestingUser = req.user as JwtUserPayload;
        const targetMembershipsSnapshot = await membershipsCollection.where('userId', '==', targetDbUser.id).get();
        const targetMemberships = querySnapshotToArray<DBMembership>(targetMembershipsSnapshot);
        let isAuthorized = false;
        if (requestingUser.role === UserRole.SYSTEM_ADMIN) {
            isAuthorized = true;
        } else if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
            const orgsSnapshot = await workspacesCollection.where('orgId', '==', requestingUser.orgId).get();
            const organizationOrgIds = orgsSnapshot.docs.map(doc => doc.id);
            isAuthorized = targetMemberships.some(m => m.entityType === 'workspace' && organizationOrgIds.includes(m.entityId));
        } else if (requestingUser.role === UserRole.WORKSPACE_ADMIN) {
            isAuthorized = targetMemberships.some(m => m.entityId === requestingUser.selectedWorkspaceId);
        }
        if (!isAuthorized) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to view this user.' });
        }
        const formattedUser = await formatUserForFrontend(targetDbUser);
        res.json(formattedUser);
    } catch (error) {
        logger.error("Error fetching user by ID:", error);
        res.status(500).json({ message: "Failed to fetch user." });
    }
};

export const deleteUser = async (req: Request, res: Response) => {
    try {
        const targetUserId = req.params.userId;
        const requestingUser = req.user as JwtUserPayload;
        const { deletionType } = req.body as { deletionType: 'soft' | 'hard' };

        if (!requestingUser || requestingUser.id !== targetUserId) {
            return res.status(403).json({ message: "Forbidden: You can only delete your own account." });
        }
        const targetUserRef = usersCollection.doc(targetUserId);
        const targetUserDoc = await targetUserRef.get();
        if (!targetUserDoc.exists) return res.status(204).send();

        if (deletionType === 'soft') {
            await targetUserRef.update({ status: 'disabled' });
            logger.info(`Successfully soft-deleted (disabled) user ${targetUserId}.`);
            res.status(204).send();
        } else { // 'hard' delete
            const membershipsSnapshot = await membershipsCollection.where('userId', '==', targetUserId).get();

            const batch = db.batch();
            membershipsSnapshot.forEach(doc => batch.delete(doc.ref));
            batch.delete(targetUserRef);

            await batch.commit();

            logger.info(`Successfully hard-deleted user ${targetUserId} and their data.`);
            res.status(204).send();
        }
    } catch (error) {
        logger.error("Error deleting user and their data:", error);
        res.status(500).json({ message: "Failed to delete user and associated data." });
    }
};

// Suppress unused import warning — logAudit is available for future use
void logAudit;
