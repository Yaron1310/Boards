
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
    organizationsCollection,
    boardsCollection,
    boardMembersCollection,
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBUser, DBWorkspace, DBPreapprovedUser, UserRole, DBMembership, DBBoard, DBBoardMember, BoardRole, PaginatedResponse } from '../types/index.js';
import { formatUserForFrontend } from './auth.controller.js';
import { sanitizeText, sanitizeImageUrl } from '../utils/sanitizer.js';
import { sendUserInvitationEmail } from '../services/email.service.js';
import { env } from '../config/env.js';
import { parsePaginationParams, buildPaginatedResult } from '../utils/pagination.js';
import { validatePasswordComplexity } from '../utils/password.js';
import { logAudit } from '../services/audit.service.js';

export const preApproveUsersInBulk = async (req: Request, res: Response) => {
    const { emails, workspaceId, permissions } = req.body as { emails: string[], workspaceId: string, permissions?: 'edit' | 'read_only' };
    const safePermissions: 'edit' | 'read_only' = permissions === 'read_only' ? 'read_only' : 'edit';
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
                        userName: user.name,
                        userEmail: user.email,
                        entityId: targetOrgId,
                        entityType: 'workspace',
                        role: UserRole.REGULAR_USER,
                        permissions: safePermissions,
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
                    permissions: safePermissions,
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

        logger.info('[DBG:getAllUsers] START', {
            requestingUserId: user.id,
            requestingUserRole: user.role,
            requestingUserOrgId: user.orgId,
            limit, cursor: cursor ?? null, search: search ?? null,
            workspaceId: workspaceId || null,
            roleFilter: roleFilter || null,
        });

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
            logger.info('[DBG:getAllUsers] No matching role — returning empty');
            return res.json({ data: [], cursor: null, hasMore: false });
        }

        if (roleFilter) {
            membershipQuery = membershipQuery.where('role', '==', roleFilter);
        }

        const snapshot = await membershipQuery.get();
        let memberships = querySnapshotToArray<DBMembership>(snapshot);

        logger.info('[DBG:getAllUsers] Main query returned memberships', {
            count: memberships.length,
            roles: memberships.map(m => `${m.userId}:${m.role}:entityId=${m.entityId}:orgId=${m.orgId}`),
        });

        // Supplement org_admin memberships when needed. Org admin memberships are stored
        // with entityId = orgId (not a workspace entityId), so they are excluded when a
        // workspace filter is applied. We fetch them via a single-field query on entityId
        // (avoids composite index requirements) since entityId == orgId is exclusive to
        // org_admin memberships — workspace memberships use entityId == workspaceId.
        if (user.role === UserRole.ORGANIZATION_ADMIN && (!roleFilter || roleFilter === UserRole.ORGANIZATION_ADMIN)) {
            logger.info('[DBG:getAllUsers] Running org admin supplement query for entityId ==', user.orgId);
            const orgAdminSnap = await membershipsCollection
                .where('entityId', '==', user.orgId)
                .get();
            const orgAdminMemberships = querySnapshotToArray<DBMembership>(orgAdminSnap)
                .filter(m => m.role === UserRole.ORGANIZATION_ADMIN);
            logger.info('[DBG:getAllUsers] Supplement query returned org admins', {
                rawCount: orgAdminSnap.size,
                afterRoleFilter: orgAdminMemberships.length,
                orgAdmins: orgAdminMemberships.map(m => `${m.userId}:${m.userName}:entityId=${m.entityId}:orgId=${m.orgId}`),
            });
            const existingUserIds = new Set(memberships.map(m => m.userId));
            for (const m of orgAdminMemberships) {
                if (!existingUserIds.has(m.userId)) {
                    memberships = [...memberships, m];
                    existingUserIds.add(m.userId);
                    logger.info('[DBG:getAllUsers] Added org admin to memberships:', m.userId, m.userName);
                } else {
                    logger.info('[DBG:getAllUsers] Org admin already in memberships (skipped):', m.userId, m.userName);
                }
            }
        }

        // Deduplicate by userId (a user can have multiple memberships)
        const seenUserIds = new Set<string>();
        let uniqueMemberships = memberships.filter(m => {
            if (seenUserIds.has(m.userId)) return false;
            seenUserIds.add(m.userId);
            return true;
        });

        logger.info('[DBG:getAllUsers] After dedup:', {
            uniqueCount: uniqueMemberships.length,
            users: uniqueMemberships.map(m => `${m.userId}:${m.userName}:${m.role}`),
        });

        // Sort in-memory to include users without userName field
        uniqueMemberships.sort((a, b) => {
            const nameA = (a.userName || '').toLowerCase();
            const nameB = (b.userName || '').toLowerCase();
            return nameA.localeCompare(nameB);
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
        logger.info('[DBG:getAllUsers] Page slice', {
            startIndex, limit, totalUnique: uniqueMemberships.length,
            hasMore, userIdsForPage,
        });

        if (userIdsForPage.length === 0) {
            logger.info('[DBG:getAllUsers] No users for page — returning empty');
            return res.json({ data: [], cursor: null, hasMore: false });
        }

        const userDocPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < userIdsForPage.length; i += 30) {
            const chunk = userIdsForPage.slice(i, i + 30);
            userDocPromises.push(usersCollection.where(admin.firestore.FieldPath.documentId(), 'in', chunk).get());
        }
        const userDocSnapshots = await Promise.all(userDocPromises);
        let dbUsers = userDocSnapshots.flatMap(snap => querySnapshotToArray<DBUser>(snap));

        const foundIds = new Set(dbUsers.map(u => u.id));
        const missingIds = userIdsForPage.filter(id => !foundIds.has(id));

        logger.info('[DBG:getAllUsers] Fetched user docs', {
            requested: userIdsForPage.length,
            found: dbUsers.length,
            foundIds: [...foundIds],
            missingIds,
        });

        // Fallback: for memberships whose userId no longer has a user document (e.g. the user
        // re-registered with a new auth ID), try to locate the user document by the denormalized
        // userEmail stored on the membership. This handles stale userId references transparently.
        if (missingIds.length > 0) {
            const missingMemberships = pageData.filter(m => missingIds.includes(m.userId) && m.userEmail);
            const emailsToLookup = [...new Set(missingMemberships.map(m => m.userEmail!))];
            if (emailsToLookup.length > 0) {
                const emailLookupPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
                for (let i = 0; i < emailsToLookup.length; i += 10) {
                    emailLookupPromises.push(
                        usersCollection.where('email', 'in', emailsToLookup.slice(i, i + 10)).get()
                    );
                }
                const emailSnapshots = await Promise.all(emailLookupPromises);
                const foundByEmail = emailSnapshots.flatMap(snap => querySnapshotToArray<DBUser>(snap))
                    .filter(u => !foundIds.has(u.id)); // avoid duplicates
                logger.info('[DBG:getAllUsers] Email fallback found', {
                    looked: emailsToLookup.length,
                    found: foundByEmail.length,
                    ids: foundByEmail.map(u => `${u.id}:${u.email}`),
                });
                dbUsers = [...dbUsers, ...foundByEmail];
            }
        }

        const formattedUsersPromises = dbUsers.map(u => formatUserForFrontend(u, {
            orgId: user.role === UserRole.ORGANIZATION_ADMIN ? user.orgId : undefined,
            workspaceId: user.role === UserRole.WORKSPACE_ADMIN ? user.selectedWorkspaceId : undefined,
        }));

        const formattedUsers = await Promise.all(formattedUsersPromises);

        // Filter out system admins for non-system-admin requesters
        const finalUsers = user.role === UserRole.SYSTEM_ADMIN
            ? formattedUsers
            : formattedUsers.filter(u => !u.dbRoles.systemAdmin);

        logger.info('[DBG:getAllUsers] After format+filter', {
            formattedCount: formattedUsers.length,
            finalCount: finalUsers.length,
            filtered: formattedUsers.filter(u => u.dbRoles.systemAdmin).map(u => u.id),
            finalUserIds: finalUsers.map(u => `${u.id}:${u.role}:${u.name}`),
        });

        // Maintain the same order as the membership query.
        // Also build an email→user map to resolve email-fallback users whose membership
        // userId differs from their current user document ID.
        const userMap = new Map(finalUsers.map(u => [u.id, u]));
        const emailToUser = new Map(finalUsers.filter(u => u.email).map(u => [u.email as string, u]));
        const membershipEmailMap = new Map(
            pageData.filter(m => m.userEmail).map(m => [m.userId, m.userEmail!])
        );
        // Build ordered list, then deduplicate by user id so that orphaned memberships
        // with different userId values that resolve to the same user doc don't produce
        // duplicate rows. The users collection is the source of truth — one row per user.
        const seenFinalIds = new Set<string>();
        const orderedUsers = userIdsForPage.map(id => {
            return userMap.get(id) ?? emailToUser.get(membershipEmailMap.get(id) ?? '');
        }).filter((u): u is NonNullable<typeof u> => {
            if (!u) return false;
            if (seenFinalIds.has(u.id)) return false;
            seenFinalIds.add(u.id);
            return true;
        });

        const nextCursor = hasMore && orderedUsers.length > 0 ? orderedUsers[orderedUsers.length - 1]!.id : null;

        logger.info('[DBG:getAllUsers] RESPONSE', {
            dataCount: orderedUsers.length,
            hasMore,
            nextCursor,
        });

        res.json({
            data: orderedUsers,
            cursor: nextCursor,
            hasMore,
            total: uniqueMemberships.length,
        } as PaginatedResponse<any>);
    } catch (error: any) {
        logger.error("[DBG:getAllUsers] ERROR caught:", error);
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

        // Derive workspacePermissions from the JWT (already validated on login)
        const workspacePermissions: 'edit' | 'read_only' = userPayload.workspacePermissions ?? 'edit';

        const selectedWorkspaceForFrontend: any = {
            id: orgData.id,
            name: orgData.name,
            orgId: orgData.orgId,
            isPersonal: orgData.isPersonal,
            workspacePermissions,
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
    const { name, email, preferredLanguage, preferences } = req.body;
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
        if (preferences !== undefined && typeof preferences === 'object') {
            updates.preferences = preferences;
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
    const { imageUrl, imageBase64 } = req.body;
    try {
        let resolvedUrl = '';

        if (imageBase64) {
            try {
                const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                resolvedUrl = await uploadProfileImageToStorage(buffer, userId);
            } catch (uploadErr) {
                logger.error('Failed to upload profile image to Storage:', uploadErr);
                return res.status(500).json({ message: 'Failed to upload profile image.' });
            }
        } else if (imageUrl) {
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

// ---------------------------------------------------------------------------
// GET /users/:userId/board-permissions
// Returns all workhubs and their boards for the org, with user's membership status.
// ---------------------------------------------------------------------------
export const getUserBoardPermissions = async (req: Request, res: Response) => {
    const requestingUser = req.user as JwtUserPayload;
    const { userId } = req.params;

    if (requestingUser.role !== UserRole.ORGANIZATION_ADMIN && requestingUser.role !== UserRole.SYSTEM_ADMIN) {
        return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
        // Get all non-personal workspaces for the org
        const workspacesSnap = await workspacesCollection
            .where('orgId', '==', requestingUser.orgId)
            .get();
        const workspaces = querySnapshotToArray<DBWorkspace>(workspacesSnap)
            .filter(w => !w.isPersonal && !w.isTemplates && w.status !== 'archived');

        // Get all boards for the org
        const boardsSnap = await boardsCollection(requestingUser.orgId)
            .where('isArchived', '==', false)
            .get();
        const allBoards = querySnapshotToArray<DBBoard>(boardsSnap);

        // Get all board memberships for the target user across all boards
        const boardMemberSnaps = await Promise.all(
            allBoards.map(b => boardMembersCollection(requestingUser.orgId, b.id).doc(userId).get())
        );
        const memberBoardIds = new Map<string, BoardRole>();
        allBoards.forEach((b, i) => {
            const snap = boardMemberSnaps[i];
            if (snap.exists) {
                memberBoardIds.set(b.id, (snap.data() as DBBoardMember).role);
            }
        });

        // Check which workspaces the user already has a membership in, and their permissions
        const wsMemberSnap = await membershipsCollection
            .where('userId', '==', userId)
            .where('orgId', '==', requestingUser.orgId)
            .get();
        const wsMembershipMap = new Map<string, 'edit' | 'read_only' | 'admin'>();
        querySnapshotToArray<DBMembership>(wsMemberSnap).forEach(m => {
            if (m.role === UserRole.WORKSPACE_ADMIN) {
                wsMembershipMap.set(m.entityId, 'admin');
            } else {
                wsMembershipMap.set(m.entityId, m.permissions ?? 'edit');
            }
        });

        // Build grouped structure — include ALL workspaces so admin can add membership
        const result = workspaces.map(ws => ({
            id: ws.id,
            name: ws.name,
            isMember: wsMembershipMap.has(ws.id),
            permissions: wsMembershipMap.get(ws.id) ?? 'edit',
            boards: allBoards
                .filter(b => b.workspaceId === ws.id)
                .map(b => ({
                    id: b.id,
                    name: b.name,
                    isMember: memberBoardIds.has(b.id),
                    role: memberBoardIds.get(b.id) ?? null,
                })),
        }));

        res.json({ workspaces: result });
    } catch (error) {
        logger.error('Error fetching user board permissions:', error);
        res.status(500).json({ message: 'Failed to fetch board permissions.' });
    }
};

// ---------------------------------------------------------------------------
// PUT /users/:userId/board-permissions
// Replaces the user's board memberships with the provided list.
// Body: { boards: Array<{ boardId: string; role: 'viewer' | 'editor' | 'admin' }> }
// ---------------------------------------------------------------------------
export const updateUserBoardPermissions = async (req: Request, res: Response) => {
    const requestingUser = req.user as JwtUserPayload;
    const { userId } = req.params;
    const { boards: newBoards, workspaceIds: newWorkspaceIds, workspacePermissions: newWsPermissions } = req.body as {
        boards: Array<{ boardId: string; role: BoardRole }>;
        workspaceIds?: string[];
        workspacePermissions?: Record<string, 'edit' | 'read_only' | 'admin'>;
    };

    if (requestingUser.role !== UserRole.ORGANIZATION_ADMIN && requestingUser.role !== UserRole.SYSTEM_ADMIN) {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    if (!Array.isArray(newBoards)) {
        return res.status(400).json({ message: 'boards array is required.' });
    }

    try {
        // Load target user
        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: 'User not found.' });
        const userData = userDoc.data() as DBUser;

        // Current workspace memberships for this user in this org
        const currentWsMemberSnap = await membershipsCollection
            .where('userId', '==', userId)
            .where('orgId', '==', requestingUser.orgId)
            .get();
        const currentWsMemberships = querySnapshotToArray<DBMembership>(currentWsMemberSnap);
        const currentWsIds = new Set(currentWsMemberships.map(m => m.entityId));

        // Get all boards for the org
        const boardsSnap = await boardsCollection(requestingUser.orgId)
            .where('isArchived', '==', false)
            .get();
        const allBoards = querySnapshotToArray<DBBoard>(boardsSnap);
        const allBoardIds = new Set(allBoards.map(b => b.id));
        const boardMap = new Map(allBoards.map(b => [b.id, b]));

        // Get current board memberships for this user
        const currentMemberSnaps = await Promise.all(
            allBoards.map(b => boardMembersCollection(requestingUser.orgId, b.id).doc(userId).get())
        );
        const currentMemberBoardIds = new Set<string>();
        allBoards.forEach((b, i) => {
            if (currentMemberSnaps[i].exists) currentMemberBoardIds.add(b.id);
        });

        const newBoardIdSet = new Set(newBoards.map(b => b.boardId).filter(id => allBoardIds.has(id)));
        const desiredWsIds = new Set(Array.isArray(newWorkspaceIds) ? newWorkspaceIds : []);

        const batch = db.batch();

        // --- Workspace membership changes ---
        if (Array.isArray(newWorkspaceIds)) {
            // Add or update workspace memberships
            for (const wsId of desiredWsIds) {
                const rawPerm = newWsPermissions?.[wsId];
                const isAdmin = rawPerm === 'admin';
                const wsPerms: 'edit' | 'read_only' = rawPerm === 'read_only' ? 'read_only' : 'edit';
                const memberRole = isAdmin ? UserRole.WORKSPACE_ADMIN : UserRole.REGULAR_USER;
                if (!currentWsIds.has(wsId)) {
                    const wsDoc = await workspacesCollection.doc(wsId).get();
                    if (!wsDoc.exists || (wsDoc.data() as DBWorkspace).orgId !== requestingUser.orgId) continue;
                    const newRef = membershipsCollection.doc();
                    batch.set(newRef, {
                        id: newRef.id,
                        userId,
                        userName: userData.name,
                        userEmail: userData.email,
                        entityId: wsId,
                        entityType: 'workspace',
                        role: memberRole,
                        orgId: requestingUser.orgId,
                        permissions: wsPerms,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                } else {
                    // Update role and permissions on existing membership
                    const existingDoc = currentWsMemberSnap.docs.find(d => (d.data() as DBMembership).entityId === wsId);
                    if (existingDoc) batch.update(existingDoc.ref, { role: memberRole, permissions: wsPerms });
                }
            }
            // Remove workspace memberships no longer desired
            for (const m of currentWsMemberships) {
                if (!desiredWsIds.has(m.entityId)) {
                    const docSnap = currentWsMemberSnap.docs.find(d => d.id === m.id);
                    if (docSnap) batch.delete(docSnap.ref);
                }
            }
        }

        // --- Board membership changes ---
        for (const { boardId, role } of newBoards) {
            if (!allBoardIds.has(boardId)) continue;
            const board = boardMap.get(boardId)!;
            if (!currentMemberBoardIds.has(boardId)) {
                batch.set(boardMembersCollection(requestingUser.orgId, boardId).doc(userId), {
                    userId,
                    boardId,
                    workspaceId: board.workspaceId,
                    role: role || BoardRole.VIEWER,
                    addedBy: requestingUser.id,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    userName: userData.name ?? null,
                    userEmail: userData.email ?? null,
                    userProfileImageUrl: userData.profileImageUrl ?? null,
                });
            }
        }
        for (const boardId of currentMemberBoardIds) {
            if (!newBoardIdSet.has(boardId)) {
                batch.delete(boardMembersCollection(requestingUser.orgId, boardId).doc(userId));
            }
        }

        // Update boardIds on workspace memberships that use boardOnlyAccess
        const newBoardIdArray = [...newBoardIdSet];
        currentWsMemberSnap.docs.forEach(doc => {
            if ((doc.data() as DBMembership).boardOnlyAccess) {
                batch.update(doc.ref, { boardIds: newBoardIdArray });
            }
        });

        await batch.commit();
        res.json({ message: 'Permissions updated.' });
    } catch (error) {
        logger.error('Error updating user board permissions:', error);
        res.status(500).json({ message: 'Failed to update board permissions.' });
    }
};
