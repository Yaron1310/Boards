
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Buffer } from 'node:buffer';
import { db } from '../services/firestore.service.js';

import { 
    usersCollection, 
    organizationsCollection, 
    conversationsCollection, 
    userQuestionnaireResultsCollection, 
    preapprovedUsersCollection, 
    userCourseProgressCollection, 
    membershipsCollection, 
    plansCollection, 
    personalInsightsCollection, 
    tokenUsageCollection, 
    systemSettingsCollection, 
    academySettingsCollection,
    academiesCollection 
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBUser, DBOrganization, DBPreapprovedUser, UserRole, DBMembership, DBSystemSettings, DBPlan, DBAcademySettings, PaginatedResponse } from '../types/index.js';
import { formatUserForFrontend } from './auth.controller.js';
import { sanitizeText, sanitizeImageUrl } from '../utils/sanitizer.js';
import { sendUserInvitationEmail } from '../services/email.service.js';
import { env } from '../config/env.js';
import { parsePaginationParams, buildPaginatedResult } from '../utils/pagination.js';
import { validatePasswordComplexity } from '../utils/password.js';
import { encryptValue, decryptValue } from '../services/crypto.service.js';
import { logAudit, logAuditAndCheckAnomaly, getClientIp } from '../services/audit.service.js';

export const preApproveUsersInBulk = async (req: Request, res: Response) => {
    const { emails, organizationId } = req.body as { emails: string[], organizationId: string };
    const requestingUser = req.user as JwtUserPayload;

    if (!Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: 'A non-empty array of emails is required.' });
    }
    
    const targetOrgId = (requestingUser.role === UserRole.SYSTEM_ADMIN || requestingUser.role === UserRole.ACADEMY_ADMIN) ? organizationId : requestingUser.selectedOrganizationId;
    if (!targetOrgId) return res.status(400).json({ message: 'An organization ID is required.' });

    try {
        const orgDoc = await organizationsCollection.doc(targetOrgId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: 'Target organization not found.' });
        const orgData = orgDoc.data() as DBOrganization;
        if (requestingUser.role === UserRole.ACADEMY_ADMIN && orgData.academyId !== requestingUser.academyId) {
            return res.status(403).json({ message: 'You do not have permission to approve users for this organization.' });
        }
        
        const batch = db.batch();
        const lowercasedEmails = emails.map(e => sanitizeText(e).toLowerCase().trim()).filter(Boolean);
        const uniqueEmails = [...new Set(lowercasedEmails)];

        // --- NEW: Pre-flight check for user limits ---
        let maxUsers = Infinity;
        if (orgData.planId) {
            const planDoc = await plansCollection.doc(orgData.planId).get();
            if (planDoc.exists) {
                const plan = snapshotToData<DBPlan>(planDoc)!;
                if (plan.maxUsers && plan.maxUsers > 0) maxUsers = plan.maxUsers;
            }
        }

        if (maxUsers !== Infinity) {
            const emailChunks: string[][] = [];
            for (let i = 0; i < uniqueEmails.length; i += 30) {
                emailChunks.push(uniqueEmails.slice(i, i + 30));
            }

            let existingUsersToAddCount = 0;

            for (const chunk of emailChunks) {
                const existingUsersSnapshot = await usersCollection.where('email', 'in', chunk).get();
                if (existingUsersSnapshot.empty) continue;
                
                const existingUserIds = existingUsersSnapshot.docs.map(d => d.id);
                const membershipsSnapshot = await membershipsCollection.where('entityId', '==', targetOrgId).where('userId', 'in', existingUserIds).get();
                const userIdsAlreadyInOrg = new Set(membershipsSnapshot.docs.map(d => d.data().userId));
                
                existingUsersToAddCount += existingUserIds.filter(id => !userIdsAlreadyInOrg.has(id)).length;
            }

            if (existingUsersToAddCount > 0) {
                const currentUsersSnapshot = await membershipsCollection
                    .where('entityId', '==', targetOrgId)
                    .where('role', '==', UserRole.REGULAR_USER)
                    .get();
                
                const currentUsersCount = currentUsersSnapshot.size;

                if (currentUsersCount + existingUsersToAddCount > maxUsers) {
                    const availableSlots = maxUsers - currentUsersCount;
                    return res.status(403).json({ message: `Cannot add ${existingUsersToAddCount} existing user(s). The organization's plan limit of ${maxUsers} users will be exceeded. Only ${Math.max(0, availableSlots)} slot(s) are available.` });
                }
            }
        }
        // --- END: Pre-flight check ---
        
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
                    const defaultOrgSnapshot = await organizationsCollection
                        .where('academyId', '==', orgData.academyId)
                        .where('name', '==', 'Default Organization')
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
                                    logger.info(`User ${user.email} removed from Default Organization (${defaultOrgId}) because they are being added to a new one.`);
                                });
                            }
                        }
                    }
                    
                    const newMembershipRef = membershipsCollection.doc();
                    batch.set(newMembershipRef, {
                        id: newMembershipRef.id,
                        userId: user.id,
                        entityId: targetOrgId,
                        entityType: 'organization',
                        role: UserRole.REGULAR_USER,
                        academyId: orgData.academyId,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    updatedUserCount++;
                }
            } else {
                const docId = Buffer.from(`${email}_${targetOrgId}`).toString('base64');
                const docRef = preapprovedUsersCollection.doc(docId);
                const preapprovedUserEntry: Omit<DBPreapprovedUser, 'id'> = {
                    email: email,
                    organizationId: targetOrgId,
                    academyId: orgData.academyId,
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
            const academyDoc = await academiesCollection.doc(orgData.academyId).get();
            const academyName = academyDoc.exists ? (academyDoc.data()?.name || 'Gymind') : 'Gymind';
            const registrationLink = `${env.FRONTEND_URL}/register`;
            await Promise.allSettled(
                newlyPreApprovedEmails.map(email => sendUserInvitationEmail(email, orgData.name, academyName, registrationLink))
            );
        }

        let message = '';
        if (preApprovedCount > 0 && updatedUserCount > 0) {
            message = `${preApprovedCount} new email(s) have been pre-approved. ${updatedUserCount} existing user(s) have been added to the organization.`;
        } else if (preApprovedCount > 0) {
            message = `${preApprovedCount} new email(s) have been pre-approved.`;
        } else if (updatedUserCount > 0) {
            message = `${updatedUserCount} existing user(s) have been added to the organization.`;
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

    if (user.role === UserRole.ORGANIZATION_ADMIN && !user.selectedOrganizationId) {
        return res.status(400).json({ message: "Manager is not associated with an organization." });
    }

    try {
        const { limit, cursor, search } = parsePaginationParams(req);

        let query: admin.firestore.Query = preapprovedUsersCollection;

        if (user.role === UserRole.ORGANIZATION_ADMIN) {
            query = query.where('organizationId', '==', user.selectedOrganizationId);
        } else if (user.role === UserRole.ACADEMY_ADMIN) {
            query = query.where('academyId', '==', user.academyId);
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
      if (manager.role === UserRole.ORGANIZATION_ADMIN) {
        const entry = snapshotToData<DBPreapprovedUser>(doc)!;
        if (entry.organizationId !== manager.selectedOrganizationId) {
          return res.status(403).json({ message: "Forbidden: You can only manage pre-approvals for your own organization." });
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
        const organizationId = req.query.organizationId as string;
        const roleFilter = req.query.role as string;

        // Build membership query scoped by role
        let membershipQuery: admin.firestore.Query = membershipsCollection;

        if (user.role === UserRole.SYSTEM_ADMIN) {
            // System admin sees all
            if (organizationId) {
                membershipQuery = membershipQuery.where('entityId', '==', organizationId);
            }
        } else if (user.role === UserRole.ACADEMY_ADMIN) {
            membershipQuery = membershipQuery.where('academyId', '==', user.academyId);
            if (organizationId) {
                membershipQuery = membershipQuery.where('entityId', '==', organizationId);
            }
        } else if (user.role === UserRole.ORGANIZATION_ADMIN && user.selectedOrganizationId) {
            membershipQuery = membershipQuery.where('entityId', '==', user.selectedOrganizationId);
        } else {
            return res.json({ data: [], cursor: null, hasMore: false });
        }

        if (roleFilter) {
            membershipQuery = membershipQuery.where('role', '==', roleFilter);
        }

        // For search, filter memberships by denormalized userName/userEmail
        // Firestore doesn't support LIKE queries, so we use range queries for prefix search
        // For contains search, we must fetch and filter in-memory (but scoped to the membership set)
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
            academyId: user.role === UserRole.ACADEMY_ADMIN ? user.academyId : undefined,
            organizationId: user.role === UserRole.ORGANIZATION_ADMIN ? user.selectedOrganizationId : undefined,
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
        
        // If the token is partial (e.g., just for context selection or checkout flow), 
        // we might not have a selectedOrganizationId. In this case, return user info without org details.
        // This is crucial for the checkout page flow after email verification.
        if (!userPayload.selectedOrganizationId) {
             return res.json({ user: formattedUser, selectedOrganization: null });
        }

        let orgData: DBOrganization | null = null;
        const orgDoc = await organizationsCollection.doc(userPayload.selectedOrganizationId).get();
        if (orgDoc.exists) {
            orgData = snapshotToData<DBOrganization>(orgDoc)!;
        } else {
            // Fallback: try to find any organization for the user if the token's org ID is stale
            const membershipsSnapshot = await membershipsCollection.where('userId', '==', dbUser.id).where('entityType', '==', 'organization').limit(1).get();
            if (membershipsSnapshot.empty) {
                // Return basic user info if no orgs found (e.g. system admin without orgs, or new user in flux)
                 return res.json({ user: formattedUser, selectedOrganization: null });
            }
            const fallbackOrgId = membershipsSnapshot.docs[0].data().entityId;
            const fallbackOrgDoc = await organizationsCollection.doc(fallbackOrgId).get();
            if (!fallbackOrgDoc.exists) {
                return res.json({ user: formattedUser, selectedOrganization: null });
            }
            orgData = snapshotToData<DBOrganization>(fallbackOrgDoc)!;
        }
        
        // Add token usage for the current user
        let used = 0;
        let limit: number | null = null;
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

        const usageSnapshot = await tokenUsageCollection
            .where('userId', '==', dbUser.id)
            .where('createdAt', '>=', monthStart)
            .where('createdAt', '<=', monthEnd)
            .get();
        
        usageSnapshot.forEach(doc => { used += doc.data().totalTokens; });

        let planType: 'subscription' | 'one-time' | undefined;
        // Default to false for regular users unless they are admins or have a plan
        let hasChatAccess = false;
        let hasMindPatternsAccess = false;

        // Admins always have access
        if (userPayload.role === UserRole.ACADEMY_ADMIN || userPayload.role === UserRole.SYSTEM_ADMIN) {
             hasChatAccess = true;
             hasMindPatternsAccess = true;
        }

        if (orgData.planId) {
            const planDoc = await plansCollection.doc(orgData.planId).get();
            if (planDoc.exists) {
                const plan = snapshotToData<DBPlan>(planDoc)!;
                planType = plan.planType;

                // Only override from plan if not an admin (admins already set to true)
                if (userPayload.role !== UserRole.ACADEMY_ADMIN && userPayload.role !== UserRole.SYSTEM_ADMIN) {
                    hasChatAccess = plan.hasAllChatAccess ?? true;
                    hasMindPatternsAccess = plan.hasAllQuestionnairesAccess ?? true;
                }

                // Gate AI features on org subscription status for non-admin roles
                const orgSubStatus = orgData.subscriptionStatus || 'active';
                const isOrgActive = orgSubStatus === 'active' || orgSubStatus === 'trialing';
                if (!isOrgActive && userPayload.role !== UserRole.ACADEMY_ADMIN && userPayload.role !== UserRole.SYSTEM_ADMIN) {
                    hasChatAccess = false;
                    hasMindPatternsAccess = false;
                }

                if (plan.planType === 'subscription') {
                    const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
                    if (settingsDoc.exists) {
                        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;
                        limit = settings.subscriptionMonthlyLimit;
                    }
                }
            }
        }
        formattedUser.tokenUsage = { used, limit };

        const selectedOrganizationForFrontend: any = {
            id: orgData.id,
            name: orgData.name,
            academyId: orgData.academyId,
            planId: orgData.planId,
            planType,
            hasChatAccess,
            hasMindPatternsAccess,
            subscriptionProvider: orgData.subscriptionProvider,
            subscriptionStatus: orgData.subscriptionStatus,
            cancelAtPeriodEnd: orgData.cancelAtPeriodEnd,
            subscriptionEndDate: orgData.subscriptionEndDate,
            isPersonal: orgData.isPersonal
        };

        if (orgData.planId) {
            const planDoc = await plansCollection.doc(orgData.planId).get();
            if (planDoc.exists) {
                selectedOrganizationForFrontend.planName = planDoc.data()?.name || 'Unknown Plan';
            }
        }

        // Fetch academy name to include in the response
        const academyDoc = await academiesCollection.doc(orgData.academyId).get();
        if (academyDoc.exists) {
            selectedOrganizationForFrontend.academyName = academyDoc.data()?.name;
        }

        res.json({ user: formattedUser, selectedOrganization: selectedOrganizationForFrontend });
    } catch (error) {
        logger.error("Error fetching own user details for session validation:", error);
        res.status(500).json({ message: 'Failed to fetch user details' });
    }
};

const ALLOWED_LANGUAGE_CODES = ['en', 'es', 'he'];

export const updateMyUserDetails = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    const userId = userPayload.id;
    const { name, email, conversationSavingEnabled, preferredLanguage } = req.body;
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
        if (conversationSavingEnabled !== undefined) {
            updates.conversationSavingEnabled = !!conversationSavingEnabled;
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
        // Pass current role to preserve session state
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

export const updateMyProfileImage = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    const userId = userPayload.id;
    const { imageUrl } = req.body;
    try {
        const sanitizedImageUrl = sanitizeImageUrl(imageUrl);
        await usersCollection.doc(userId).update({ profileImageUrl: sanitizedImageUrl || admin.firestore.FieldValue.delete() });

        // Fan-out: update denormalized profile image on all membership documents
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        if (!membershipsSnapshot.empty) {
            const batch = db.batch();
            membershipsSnapshot.forEach(doc => batch.update(doc.ref, {
                userProfileImageUrl: sanitizedImageUrl || admin.firestore.FieldValue.delete()
            }));
            await batch.commit();
        }

        const updatedUserDoc = await usersCollection.doc(userId).get();
        const dbUser = snapshotToData<DBUser>(updatedUserDoc)!;
        // Pass current role to preserve session state
        const formattedUser = await formatUserForFrontend(dbUser, { role: userPayload.role });
        res.json(formattedUser);
    } catch (error) {
        logger.error("Error updating profile image:", error);
        res.status(500).json({ message: "Failed to update profile image." });
    }
};

export const markChatNoticeAsSeen = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    try {
        const userRef = usersCollection.doc(userPayload.id);
        await userRef.update({ hasSeenChatPrivacyNotice: true });
        const updatedUserDoc = await userRef.get();
        if (!updatedUserDoc.exists) return res.status(404).json({ message: "User not found after update." });
        const user = snapshotToData<DBUser>(updatedUserDoc)!;
        // Pass current role to preserve session state
        const formattedUser = await formatUserForFrontend(user, { role: userPayload.role });
        res.json(formattedUser);
    } catch (error) {
        logger.error("Error marking chat notice as seen:", error);
        res.status(500).json({ message: "Failed to update privacy notice status." });
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
        } else if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
            const orgsSnapshot = await organizationsCollection.where('academyId', '==', requestingUser.academyId).get();
            const academyOrgIds = orgsSnapshot.docs.map(doc => doc.id);
            isAuthorized = targetMemberships.some(m => m.entityType === 'organization' && academyOrgIds.includes(m.entityId));
        } else if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
            isAuthorized = targetMemberships.some(m => m.entityId === requestingUser.selectedOrganizationId);
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
            const conversationsSnapshot = await conversationsCollection.where('userId', '==', targetUserId).get();
            const questionnaireResultsSnapshot = await userQuestionnaireResultsCollection.where('userId', '==', targetUserId).get();
            const courseProgressSnapshot = await userCourseProgressCollection.where('userId', '==', targetUserId).get();
            const membershipsSnapshot = await membershipsCollection.where('userId', '==', targetUserId).get();
            
            const batch = db.batch();
            conversationsSnapshot.forEach(doc => batch.delete(doc.ref));
            questionnaireResultsSnapshot.forEach(doc => batch.delete(doc.ref));
            courseProgressSnapshot.forEach(doc => batch.delete(doc.ref));
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

export const getMyPersonalInsights = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await personalInsightsCollection
            .where('userId', '==', user.id)
            .where('isArchived', '!=', true)
            .orderBy('updatedAt', 'desc')
            .get();
        const insights = querySnapshotToArray<Record<string, any>>(snapshot).map(insight => ({
            ...insight,
            value: typeof insight.value === 'string' ? decryptValue(insight.value) : insight.value,
        }));
        void logAuditAndCheckAnomaly({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'READ',
            resourceType: 'personalInsight',
            resourceId: user.id,
            organizationId: user.selectedOrganizationId,
            academyId: user.academyId,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'],
        });
        res.json(insights);
    } catch (error) {
        logger.error(`Error fetching personal insights for user ${user.id}:`, error);
        res.status(500).json({ message: "Failed to fetch personal insights." });
    }
};

export const archivePersonalInsight = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { id } = req.params;
    try {
        const docRef = personalInsightsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists || doc.data()?.userId !== user.id) {
            return res.status(404).json({ message: "Insight not found." });
        }
        await docRef.update({ isArchived: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving personal insight ${id}:`, error);
        res.status(500).json({ message: "Failed to archive insight." });
    }
};

export const getArchivedPersonalInsights = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await personalInsightsCollection
            .where('userId', '==', user.id)
            .where('isArchived', '==', true)
            .orderBy('updatedAt', 'desc')
            .get();
        const insights = querySnapshotToArray<Record<string, any>>(snapshot).map(insight => ({
            ...insight,
            value: typeof insight.value === 'string' ? decryptValue(insight.value) : insight.value,
        }));
        void logAuditAndCheckAnomaly({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'READ',
            resourceType: 'personalInsight',
            resourceId: user.id,
            organizationId: user.selectedOrganizationId,
            academyId: user.academyId,
            ipAddress: getClientIp(req),
            userAgent: req.headers['user-agent'],
        });
        res.json(insights);
    } catch (error) {
        logger.error(`Error fetching archived insights for user ${user.id}:`, error);
        res.status(500).json({ message: "Failed to fetch archived insights." });
    }
};

export const restorePersonalInsight = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { id } = req.params;
    try {
        const docRef = personalInsightsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists || doc.data()?.userId !== user.id) {
            return res.status(404).json({ message: "Insight not found." });
        }
        await docRef.update({ isArchived: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring personal insight ${id}:`, error);
        res.status(500).json({ message: "Failed to restore insight." });
    }
};

export const savePersonalInsight = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { key, label, value } = req.body;

    if (!key || !label || value === undefined) {
        return res.status(400).json({ message: 'Key, label, and value are required.' });
    }

    try {
        const docId = `${user.id}_${key}`;
        const docRef = personalInsightsCollection.doc(docId);

        const sanitizedValue = typeof value === 'string' ? sanitizeText(value) : value;
        const insightData = {
            id: docId,
            userId: user.id,
            key: sanitizeText(key),
            label: sanitizeText(label),
            value: typeof sanitizedValue === 'string' ? encryptValue(sanitizedValue) : sanitizedValue,
            source: 'custom_lesson',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await docRef.set(insightData, { merge: true });

        const newDoc = await docRef.get();
        res.status(200).json(snapshotToData(newDoc));

    } catch (error) {
        logger.error(`Error saving personal insight for user ${user.id}:`, error);
        res.status(500).json({ message: "Failed to save personal insight." });
    }
};

export const cancelSubscription = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    
    try {
        const userDoc = await usersCollection.doc(user.id).get();
        if (!userDoc.exists) {
            return res.status(404).json({ message: "User not found." });
        }
        const dbUser = snapshotToData<DBUser>(userDoc)!;

        // 1. Fetch the organization to check its subscription provider
        const orgDocRef = organizationsCollection.doc(user.selectedOrganizationId);
        const orgDoc = await orgDocRef.get();
        if (!orgDoc.exists) return res.status(400).json({ message: "Organization not found." });
        const org = snapshotToData<DBOrganization>(orgDoc)!;

        // 2. Security check: ensure user has permission to cancel
        const isOrgAdmin = user.role === UserRole.ORGANIZATION_ADMIN || user.role === UserRole.ACADEMY_ADMIN || user.role === UserRole.SYSTEM_ADMIN;
        
        if (!org.isPersonal && !isOrgAdmin) {
            return res.status(403).json({ message: "This action is only available for personal subscriptions or organization administrators." });
        }

        const subscriptionProvider = org.subscriptionProvider || 'manual';

        if (subscriptionProvider === 'manual') {
            return res.status(400).json({ message: "This subscription is managed manually and cannot be cancelled from the app. Please contact your administrator." });
        }

        if (subscriptionProvider === 'gymind') {
            await orgDocRef.update({ cancelAtPeriodEnd: true });
            return res.status(200).json({ message: "Your subscription has been cancelled. Your access will continue until the end of your current billing period." });
        }

        if (subscriptionProvider === 'woocommerce') {
            const academySettingsDoc = await academySettingsCollection.doc(user.academyId).get();
            if (!academySettingsDoc.exists) {
                return res.status(400).json({ message: "Academy settings not found." });
            }
            const academySettings = snapshotToData<DBAcademySettings>(academySettingsDoc)!;
            const webhookUrl = academySettings.subscriptionCancellationWebhookUrl;
            
            if (!webhookUrl) {
                return res.status(400).json({ message: "Cancellation is not configured for this academy. Please contact support." });
            }
            
            logger.info(`Sending cancellation webhook for user ${dbUser.email} to ${webhookUrl}`);
            
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${academySettings.apiKey}`
                },
                body: JSON.stringify({
                    email: dbUser.email,
                    planId: org.id 
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Webhook failed: ${response.status} - ${errorText}`);
                throw new Error("Failed to communicate with the billing system. Please try again or contact support.");
            }

            await orgDocRef.update({ cancelAtPeriodEnd: true });

            logger.info(`Cancellation webhook successful for ${dbUser.email}`);
            return res.status(200).json({ message: "Your subscription cancellation request has been sent. Your access will continue until the end of your billing period." });
        }
        
        return res.status(400).json({ message: "This subscription cannot be cancelled through the app at this time." });

    } catch (error: any) {
        logger.error(`Error cancelling subscription for user ${user.id}:`, error);
        res.status(500).json({ message: error.message || "An internal server error occurred." });
    }
};

export const restoreSubscription = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    
    try {
        const orgDocRef = organizationsCollection.doc(user.selectedOrganizationId);
        const orgDoc = await orgDocRef.get();
        if (!orgDoc.exists) return res.status(400).json({ message: "Organization not found." });
        const org = snapshotToData<DBOrganization>(orgDoc)!;

        // Security check
        const isOrgAdmin = user.role === UserRole.ORGANIZATION_ADMIN || user.role === UserRole.ACADEMY_ADMIN || user.role === UserRole.SYSTEM_ADMIN;
        if (!org.isPersonal && !isOrgAdmin) {
            return res.status(403).json({ message: "This action is only available for personal subscriptions or organization administrators." });
        }

        if (!org.cancelAtPeriodEnd) {
            return res.status(400).json({ message: "This subscription is not pending cancellation." });
        }

        await orgDocRef.update({ cancelAtPeriodEnd: admin.firestore.FieldValue.delete() });
        
        return res.status(200).json({ message: "Your subscription has been restored successfully." });

    } catch (error: any) {
        logger.error(`Error restoring subscription for user ${user.id}:`, error);
        res.status(500).json({ message: error.message || "An internal server error occurred." });
    }
};


export const cancelUserSubscriptionByAdmin = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const adminUser = req.user as JwtUserPayload;

    try {
        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ message: "User not found." });
        }
        const userToCancel = snapshotToData<DBUser>(userDoc)!;

        // Find the user's PERSONAL organization
        const membershipSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const userOrgsIds = querySnapshotToArray<DBMembership>(membershipSnapshot).map(m => m.entityId);
        
        if (userOrgsIds.length === 0) {
            return res.status(404).json({ message: "User has no assigned organization." });
        }

        const orgsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', userOrgsIds).where('isPersonal', '==', true).limit(1).get();

        if (orgsSnapshot.empty) {
            return res.status(400).json({ message: "This user does not have a personal subscription to cancel." });
        }
        const orgDoc = orgsSnapshot.docs[0];
        const org = snapshotToData<DBOrganization>(orgDoc)!;

        // Authorization check: Admin must belong to the same academy
        if (adminUser.role === UserRole.ACADEMY_ADMIN && org.academyId !== adminUser.academyId) {
            return res.status(403).json({ message: "You do not have permission to manage this user's subscription." });
        }

        const subscriptionProvider = org.subscriptionProvider || 'manual';
        if (subscriptionProvider === 'manual') {
            return res.status(400).json({ message: "This subscription is managed manually and cannot be cancelled from the app." });
        }
        
        await orgDoc.ref.update({ subscriptionStatus: 'cancelled' });
        
        logger.info(`Admin ${adminUser.id} cancelled subscription for user ${userId} (org ${org.id})`);

        return res.status(200).json({ message: `Subscription for ${userToCancel.name} has been marked as cancelled.` });

    } catch (error: any) {
        logger.error(`Admin error cancelling subscription for user ${userId}:`, error);
        res.status(500).json({ message: error.message || "An internal server error occurred." });
    }
};
