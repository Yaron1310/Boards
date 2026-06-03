import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';

import {
    organizationsCollection,
    workspacesCollection,
    usersCollection,
    organizationSettingsCollection,
    membershipsCollection,
    preapprovedUsersCollection,
} from '../db/collections.js';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { DBWorkspace, DBUser, JwtVerificationPayload, UserRole, DBOrganizationSettings, DBMembership, JwtMultiOrgPayload, DBOrganization, JwtUserPayload } from '../types/index.js';
import { env } from '../config/env.js';
import { sendAccountVerificationEmail, sendUserInvitationEmail } from '../services/email.service.js';
import { sanitizeText, sanitizeUrl } from '../utils/sanitizer.js';
import { Buffer } from 'node:buffer';
import { generateFullLoginResponse } from './auth.controller.js';


export const getAllOrganizations = async (req: Request, res: Response) => {
    try {
        const snapshot = await organizationsCollection.orderBy('name').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error: any) {
        logger.error("Error fetching workspaces:", error);
        res.status(500).json({ message: "Failed to fetch workspaces." });
    }
};

export const createOrganization = async (req: Request, res: Response) => {
    const name = sanitizeText(req.body.name);
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const batch = db.batch();
        const newOrganizationRef = organizationsCollection.doc();
        const newOrganization = { id: newOrganizationRef.id, name, createdAt: new Date() };
        batch.set(newOrganizationRef, newOrganization);

        const defaultOrgRef = workspacesCollection.doc();
        const newDefaultOrg = {
            id: defaultOrgRef.id,
            name: 'Default Workspace',
            orgId: newOrganizationRef.id,
            isPersonal: true,
            createdAt: new Date(),
        };
        batch.set(defaultOrgRef, newDefaultOrg);

        const templatesWsRef = workspacesCollection.doc();
        batch.set(templatesWsRef, {
            id: templatesWsRef.id,
            name: 'Templates',
            orgId: newOrganizationRef.id,
            isTemplates: true,
            createdAt: new Date(),
            status: 'active',
        });

        const settingsRef = organizationSettingsCollection.doc(newOrganizationRef.id);
        const defaultSettings: Omit<DBOrganizationSettings, 'updatedAt'> = {
            id: newOrganizationRef.id,
            sidebarColor: '#004e89',
            appName: name,
            logoUrl: '/logo_gym.webp',
            displayNameColor: '#ffffff',
            sidebarLinkColor: '#e5e7eb',
        };
        batch.set(settingsRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        logger.info(`Created new workspace '${name}' (${newOrganizationRef.id}) with default workspace and settings.`);
        res.status(201).json(snapshotToData(await newOrganizationRef.get()));
    } catch (error) {
        logger.error("Error creating workspace:", error);
        res.status(500).json({ message: "Failed to create workspace." });
    }
};

export const addOrganizationAdmin = async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const email = sanitizeText(req.body.email);
    const requestingUser = req.user as JwtUserPayload;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'A valid email is required.' });
    }

    try {
        // --- Authorization Check ---
        const organizationDoc = await organizationsCollection.doc(orgId).get();
        if (!organizationDoc.exists) {
            return res.status(404).json({ message: "Workspace not found." });
        }

        let isAuthorized = false;
        if (requestingUser.role === UserRole.SYSTEM_ADMIN) {
            isAuthorized = true;
        } else if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
            // An Workspace Admin can only add other admins to their OWN workspace.
            isAuthorized = requestingUser.orgId === orgId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to manage admins for this workspace." });
        }
        // --- End Authorization ---

        const userSnapshot = await usersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
        const addAdminRole = async (userId: string, userEmail: string, userName: string) => {
            const membershipSnapshot = await membershipsCollection.where('userId', '==', userId).get();
            const memberships = querySnapshotToArray<DBMembership>(membershipSnapshot);

            if (memberships.some(m => m.role === UserRole.SYSTEM_ADMIN)) {
                return { isHigherAdmin: true };
            }

            const batch = db.batch();
            let createdPersonalOrg = false;

            if (!memberships.some(m => m.entityId === orgId && m.role === UserRole.ORGANIZATION_ADMIN)) {
                const newMembershipRef = membershipsCollection.doc();
                batch.set(newMembershipRef, {
                    id: newMembershipRef.id,
                    userId: userId,
                    userName,
                    userEmail,
                    entityId: orgId,
                    entityType: 'workspace',
                    role: UserRole.ORGANIZATION_ADMIN,
                    orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                return { alreadyAdmin: true };
            }

            // Ensure the admin has a Personal Workspace in this workspace
            const orgsSnapshot = await workspacesCollection
                .where('orgId', '==', orgId)
                .where('isPersonal', '==', true)
                .get();

            const userOrgIds = memberships.filter(m => m.entityType === 'workspace').map(m => m.entityId);
            const hasPersonalOrgInThisOrganization = querySnapshotToArray<DBWorkspace>(orgsSnapshot)
                .some(org => userOrgIds.includes(org.id));

            if (!hasPersonalOrgInThisOrganization) {
                const personalOrgRef = workspacesCollection.doc();
                const personalOrgId = personalOrgRef.id;
                batch.set(personalOrgRef, {
                    id: personalOrgId,
                    name: `${userName}'s Personal Workspace`,
                    orgId: orgId,
                    isPersonal: true,
                    status: 'active',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const personalMembershipRef = membershipsCollection.doc();
                batch.set(personalMembershipRef, {
                    id: personalMembershipRef.id,
                    userId: userId,
                    userName,
                    userEmail,
                    entityId: personalOrgId,
                    entityType: 'workspace',
                    role: UserRole.REGULAR_USER,
                    orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdPersonalOrg = true;
            }

            await batch.commit();
            return { isHigherAdmin: false, alreadyAdmin: false, createdPersonalOrg };
        };

        if (!userSnapshot.empty) {
            const user = snapshotToData<DBUser>(userSnapshot.docs[0])!;
            const { isHigherAdmin, alreadyAdmin } = await addAdminRole(user.id, user.email, user.name);
            if(isHigherAdmin) return res.status(400).json({ message: 'This user is a System Admin and cannot be assigned to a specific workspace.' });
            if(alreadyAdmin) return res.status(200).json({ message: `User ${email} is already an admin for this workspace.` });
            return res.status(200).json({ message: `Successfully promoted existing user ${email} to Workspace Admin and created a Personal Workspace.` });
        } else {
            const newUserRef = usersCollection.doc();
            const newAdminUser: Omit<DBUser, 'createdAt' | 'googleId' | 'passwordHash'> = {
                id: newUserRef.id,
                email: email.toLowerCase(),
                name: email.split('@')[0],
                status: 'pending',
            };
            await newUserRef.set({ ...newAdminUser, createdAt: new Date() });
            await addAdminRole(newAdminUser.id, newAdminUser.email, newAdminUser.name);

            const verificationTokenPayload: JwtVerificationPayload = { userId: newAdminUser.id, action: 'verify_email' };
            const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
            const organizationName = organizationDoc.exists ? (organizationDoc.data()?.name || 'Logyx') : 'Logyx';
            await sendAccountVerificationEmail(email, newAdminUser.name, verificationLink, organizationName, 'org_admin');
            return res.status(201).json({ message: `Successfully created Workspace Admin for ${email}. A verification email and a new Personal Workspace have been prepared.` });
        }
    } catch (error) {
        logger.error(`Error adding workspace admin for workspace ${orgId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeOrganizationAdmin = async (req: Request, res: Response) => {
    const { orgId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;

    if (requestingUser.id === userId) {
        return res.status(403).json({ message: "You cannot remove your own admin privileges." });
    }

    try {
        // --- Authorization Check ---
        const organizationDoc = await organizationsCollection.doc(orgId).get();
        if (!organizationDoc.exists) {
            return res.status(404).json({ message: "Workspace not found." });
        }

        let isAuthorized = false;
        if (requestingUser.role === UserRole.SYSTEM_ADMIN) {
            isAuthorized = true;
        } else if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
            isAuthorized = requestingUser.orgId === orgId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to manage admins for this workspace." });
        }
        // --- End Authorization ---

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;

        const membershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
        const adminMembership = memberships.find(m => m.entityId === orgId && m.role === UserRole.ORGANIZATION_ADMIN);

        if (!adminMembership) {
            return res.status(400).json({ message: "This user is not an Admin for this workspace." });
        }

        // Remove the Admin membership
        await membershipsCollection.doc(adminMembership.id).delete();

        const remainingMemberships = memberships.filter(m => m.id !== adminMembership.id);

        if (remainingMemberships.length === 0) {
            logger.info(`User ${userId} only had this admin role. Reassigning to Default Workspace instead of deleting.`);

            // Find the Default Workspace for this Workspace
            const defaultOrgSnapshot = await workspacesCollection
                .where('orgId', '==', orgId)
                .where('name', '==', 'Default Workspace')
                .limit(1).get();

            if (!defaultOrgSnapshot.empty) {
                const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                const newMembershipRef = membershipsCollection.doc();

                await newMembershipRef.set({
                    id: newMembershipRef.id,
                    userId: userId,
                    userName: user.name,
                    userEmail: user.email,
                    entityId: defaultOrgId,
                    entityType: 'workspace',
                    role: UserRole.REGULAR_USER,
                    orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).json({ message: `Admin privileges removed. The user has been reassigned to the Default Workspace as a regular user.` });
            } else {
                // Should not happen if data integrity is maintained, but handling just in case
                logger.error(`Default Workspace not found for workspace ${orgId}. User ${userId} is left without roles.`);
                return res.status(200).json({ message: `Admin privileges removed. User has no remaining roles.` });
            }
        } else {
            logger.info(`Successfully removed Workspace Admin privileges for user ${userId}. They have other roles.`);
            return res.status(200).json({ message: `Admin privileges removed. The user has been demoted.` });
        }
    } catch (error) {
        logger.error(`Error removing workspace admin for user ${userId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred while removing the admin.' });
    }
};

export const updateOrganization = async (req: Request, res: Response) => {
    try {
        const organizationRef = organizationsCollection.doc(req.params.id);
        const name = sanitizeText(req.body.name);
        await organizationRef.update({ name });
        res.json(snapshotToData(await organizationRef.get()));
    } catch (error) {
        logger.error("Error updating workspace:", error);
        res.status(500).json({ message: "Failed to update workspace." });
    }
};

export const deleteOrganization = async (req: Request, res: Response) => {
    try {
        const orgId = req.params.id;

        const batch = db.batch();
        batch.delete(organizationsCollection.doc(orgId));
        // Delete workspace settings to ensure public page is disabled
        batch.delete(organizationSettingsCollection.doc(orgId));
        await batch.commit();

        logger.info(`Successfully deleted workspace ${orgId} and its settings.`);
        res.status(204).send();
    } catch (error) {
        logger.error("Error deleting workspace:", error);
        res.status(500).json({ message: "Failed to delete workspace." });
    }
};

export const checkNameUniqueness = async (req: Request, res: Response) => {
    const { name } = req.query;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: 'Workspace name is required.' });
    }

    try {
        const sanitizedName = sanitizeText(name);
        const organizationSnapshot = await organizationsCollection.where('name', '==', sanitizedName).limit(1).get();

        if (organizationSnapshot.empty) {
            return res.json({ isUnique: true });
        } else {
            return res.json({ isUnique: false });
        }
    } catch (error) {
        logger.error(`Error checking workspace name uniqueness for name: ${name}`, error);
        res.status(500).json({ message: 'Server error while checking name uniqueness.' });
    }
};

export const setupOrganization = async (req: Request, res: Response) => {
    const { organizationName } = req.body;
    const partialToken = req.user as JwtMultiOrgPayload;

    if (!organizationName) {
        return res.status(400).json({ message: 'Workspace name is required.' });
    }
    if (!partialToken || partialToken.action !== 'workspace-setup') {
        return res.status(401).json({ message: 'Invalid token for workspace setup.' });
    }

    const sanitizedName = sanitizeText(organizationName);

    try {
        const userId = partialToken.id;

        await db.runTransaction(async (transaction) => {
            const organizationSnapshot = await transaction.get(organizationsCollection.where('name', '==', sanitizedName).limit(1));
            if (!organizationSnapshot.empty) {
                throw new Error('Workspace name is already taken.');
            }

            const userDoc = await transaction.get(usersCollection.doc(userId));
            if (!userDoc.exists) {
                throw new Error('User not found.');
            }
            const user = userDoc.data() as DBUser;

            const existingAdminMemberships = await transaction.get(
                membershipsCollection.where('userId', '==', userId).where('role', '==', UserRole.ORGANIZATION_ADMIN)
            );
            if (!existingAdminMemberships.empty) {
                throw new Error('This user is already an administrator of an workspace.');
            }

            const newOrganizationRef = organizationsCollection.doc();
            transaction.set(newOrganizationRef, {
                id: newOrganizationRef.id,
                name: sanitizedName,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const organizationMembershipRef = membershipsCollection.doc();
            transaction.set(organizationMembershipRef, {
                id: organizationMembershipRef.id,
                userId: userId,
                userName: user.name,
                userEmail: user.email,
                entityId: newOrganizationRef.id,
                entityType: 'workspace',
                role: UserRole.ORGANIZATION_ADMIN,
                orgId: newOrganizationRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const personalOrgRef = workspacesCollection.doc();
            transaction.set(personalOrgRef, {
                id: personalOrgRef.id,
                name: `${user.name}'s Personal Workspace`,
                orgId: newOrganizationRef.id,
                isPersonal: true,
                status: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const orgMembershipRef = membershipsCollection.doc();
            transaction.set(orgMembershipRef, {
                id: orgMembershipRef.id,
                userId: userId,
                userName: user.name,
                userEmail: user.email,
                entityId: personalOrgRef.id,
                entityType: 'workspace',
                role: UserRole.REGULAR_USER,
                orgId: newOrganizationRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const settingsRef = organizationSettingsCollection.doc(newOrganizationRef.id);
            const defaultSettings: Omit<DBOrganizationSettings, 'updatedAt'> = {
                id: newOrganizationRef.id,
                sidebarColor: '#004e89',
                appName: sanitizedName,
                logoUrl: '/logo_gym.webp',
                displayNameColor: '#ffffff',
                sidebarLinkColor: '#e5e7eb',
            };
            transaction.set(settingsRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });

        res.status(201).json({ message: 'Workspace created successfully.' });

    } catch (error: any) {
        if (error.message === 'Workspace name is already taken.' || error.message.includes('already an administrator')) {
            return res.status(409).json({ message: error.message });
        }
        logger.error(`Error setting up workspace for user ${partialToken.id}:`, error);
        res.status(500).json({ message: 'An internal server error occurred during workspace setup.' });
    }
};

export const activateSubscription = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    if (!partialToken || partialToken.action !== 'workspace-setup') {
        return res.status(401).json({ message: 'Invalid token for activation.' });
    }

    try {
        const userId = partialToken.id;
        const userRef = usersCollection.doc(userId);

        let orgId: string;
        let personalOrgId: string;

        await db.runTransaction(async (transaction) => {
            // --- READ PHASE ---
            const adminMembershipSnapshot = await transaction.get(
                membershipsCollection.where('userId', '==', userId).where('role', '==', UserRole.ORGANIZATION_ADMIN).limit(1)
            );
            if (adminMembershipSnapshot.empty) {
                throw new Error('User is not an workspace admin.');
            }
            orgId = adminMembershipSnapshot.docs[0].data().entityId;

            const personalOrgSnapshot = await transaction.get(
                workspacesCollection.where('orgId', '==', orgId).where('isPersonal', '==', true)
            );
            if (personalOrgSnapshot.empty) {
                throw new Error('Personal workspace for admin not found.');
            }
            const orgRef = personalOrgSnapshot.docs[0].ref;
            personalOrgId = orgRef.id;

            // --- WRITE PHASE ---
            const organizationRef = organizationsCollection.doc(orgId);
            transaction.update(organizationRef, { subscriptionStatus: 'active' });
            transaction.update(orgRef, { subscriptionStatus: 'active' });
            transaction.update(userRef, { status: 'active' });
        });

        const finalUserDoc = await usersCollection.doc(userId).get();
        const finalUser = snapshotToData<DBUser>(finalUserDoc)!;

        const allMembershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const allMemberships = querySnapshotToArray<DBMembership>(allMembershipsSnapshot);

        const loginResponse = await generateFullLoginResponse(finalUser, personalOrgId!, allMemberships, UserRole.ORGANIZATION_ADMIN);

        res.status(200).json(loginResponse);

    } catch (error: any) {
        logger.error(`Error activating workspace for user ${partialToken.id}:`, error);
        res.status(500).json({ message: error.message || 'An internal server error occurred during activation.' });
    }
};

export const inviteUsersToOrg = async (req: Request, res: Response) => {
    const { orgId } = req.params;
    const { email, emails, workspaceIds, permissions } = req.body as {
        email?: string;
        emails?: string[];
        workspaceIds: string[] | 'all';
        permissions?: 'edit' | 'read_only';
    };
    const requestingUser = req.user as JwtUserPayload;
    const safePermissions: 'edit' | 'read_only' = permissions === 'read_only' ? 'read_only' : 'edit';

    const rawEmails: string[] = Array.isArray(emails) && emails.length > 0
        ? emails
        : (email && typeof email === 'string' ? [email] : []);

    if (rawEmails.length === 0) {
        return res.status(400).json({ message: 'At least one valid email is required.' });
    }

    try {
        const organizationDoc = await organizationsCollection.doc(orgId).get();
        if (!organizationDoc.exists) return res.status(404).json({ message: 'Organization not found.' });
        if (requestingUser.role !== UserRole.SYSTEM_ADMIN && requestingUser.orgId !== orgId) {
            return res.status(403).json({ message: 'Forbidden.' });
        }

        const inviteAll = workspaceIds === 'all';
        let targetWorkspaceIds: string[];
        if (inviteAll) {
            const wsSnap = await workspacesCollection.where('orgId', '==', orgId).get();
            targetWorkspaceIds = wsSnap.docs
                .filter(d => !d.data().isPersonal && !d.data().isTemplates)
                .map(d => d.id);
        } else {
            if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
                return res.status(400).json({ message: 'At least one workspace must be selected.' });
            }
            targetWorkspaceIds = workspaceIds;
        }

        if (targetWorkspaceIds.length === 0) {
            return res.status(400).json({ message: 'No valid workhubs found for this organization.' });
        }

        // Pre-fetch workspace docs once to avoid per-email lookups
        const wsDocs = await Promise.all(targetWorkspaceIds.map(wsId => workspacesCollection.doc(wsId).get()));
        const validWsDocs = wsDocs.filter(d => d.exists && (d.data() as DBWorkspace).orgId === orgId);

        const orgName = organizationDoc.data()?.name || 'Logyx';
        const registrationLink = `${env.FRONTEND_URL}/register`;

        let totalAdded = 0;
        let totalPreApproved = 0;
        let totalSkipped = 0;

        for (const rawEmailEntry of rawEmails) {
            const sanitizedEmail = sanitizeText(rawEmailEntry).toLowerCase().trim();
            if (!sanitizedEmail || !sanitizedEmail.includes('@')) { totalSkipped++; continue; }

            const userSnap = await usersCollection.where('email', '==', sanitizedEmail).limit(1).get();
            const batch = db.batch();
            let addedToExisting = 0;
            let preApprovedCount = 0;

            if (!userSnap.empty) {
                // User exists — create one membership per workspace they don't already have
                const existingUser = snapshotToData<DBUser>(userSnap.docs[0])!;
                for (const wsDoc of validWsDocs) {
                    const wsId = wsDoc.id;
                    const memberSnap = await membershipsCollection
                        .where('userId', '==', existingUser.id)
                        .where('entityId', '==', wsId)
                        .limit(1).get();
                    if (memberSnap.empty) {
                        const newMemberRef = membershipsCollection.doc();
                        batch.set(newMemberRef, {
                            id: newMemberRef.id,
                            userId: existingUser.id,
                            userName: existingUser.name,
                            userEmail: existingUser.email,
                            entityId: wsId,
                            entityType: 'workspace',
                            role: UserRole.REGULAR_USER,
                            permissions: safePermissions,
                            orgId,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        addedToExisting++;
                    }
                }
            } else if (inviteAll) {
                // Not yet registered + all-workhubs: one preapproved doc representing org-wide access
                const docId = Buffer.from(`${sanitizedEmail}_${orgId}_all`).toString('base64');
                batch.set(preapprovedUsersCollection.doc(docId), {
                    email: sanitizedEmail,
                    workspaceId: orgId,
                    orgId,
                    allWorkspaces: true,
                    addedBy: requestingUser.id,
                    permissions: safePermissions,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                preApprovedCount++;
            } else {
                // Not yet registered + specific workspaces: one doc per workspace
                for (const wsDoc of validWsDocs) {
                    const wsId = wsDoc.id;
                    const docId = Buffer.from(`${sanitizedEmail}_${wsId}`).toString('base64');
                    batch.set(preapprovedUsersCollection.doc(docId), {
                        email: sanitizedEmail,
                        workspaceId: wsId,
                        orgId,
                        addedBy: requestingUser.id,
                        permissions: safePermissions,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    preApprovedCount++;
                }
            }

            await batch.commit();

            if (userSnap.empty && preApprovedCount > 0) {
                await sendUserInvitationEmail(sanitizedEmail, orgName, orgName, registrationLink).catch(() => {});
            }

            totalAdded += addedToExisting;
            totalPreApproved += preApprovedCount;
            if (addedToExisting === 0 && preApprovedCount === 0) totalSkipped++;
        }

        const processedCount = rawEmails.length - totalSkipped;
        const message = processedCount > 0
            ? `${processedCount} user(s) invited with ${safePermissions === 'read_only' ? 'read-only' : 'edit'} access.${totalSkipped > 0 ? ` ${totalSkipped} skipped (already have access or invalid).` : ''}`
            : 'All users already have access to the selected workhubs.';
        return res.status(200).json({ message, successCount: processedCount });
    } catch (error) {
        logger.error(`Error inviting users to org ${orgId}:`, error);
        return res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeUserFromOrg = async (req: Request, res: Response) => {
    const { orgId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;

    if (requestingUser.id === userId) {
        return res.status(403).json({ message: "You cannot remove yourself from the organization." });
    }

    try {
        // Authorization: org admin of this org or system admin only
        if (requestingUser.role !== UserRole.SYSTEM_ADMIN) {
            if (requestingUser.role !== UserRole.ORGANIZATION_ADMIN || requestingUser.orgId !== orgId) {
                return res.status(403).json({ message: "Forbidden: You do not have permission to remove users from this organization." });
            }
        }

        const orgDoc = await organizationsCollection.doc(orgId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Organization not found." });

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const userEmail = (userDoc.data() as DBUser).email;

        // Remove ALL memberships for this user within the org — by userId and also by
        // userEmail to catch orphaned memberships with stale userId values.
        const [byIdSnap, byEmailSnap] = await Promise.all([
            membershipsCollection.where('userId', '==', userId).where('orgId', '==', orgId).get(),
            userEmail
                ? membershipsCollection.where('userEmail', '==', userEmail).where('orgId', '==', orgId).get()
                : Promise.resolve(null),
        ]);

        const batch = db.batch();
        const deletedDocIds = new Set<string>();
        byIdSnap.forEach(doc => { batch.delete(doc.ref); deletedDocIds.add(doc.id); });
        byEmailSnap?.forEach(doc => { if (!deletedDocIds.has(doc.id)) batch.delete(doc.ref); });

        // Stamp forceLogoutAt so the user's current JWT is invalidated on next request
        batch.update(usersCollection.doc(userId), {
            forceLogoutAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();

        logger.info(`User ${userId} removed from org ${orgId} by ${requestingUser.id}`);
        return res.status(204).send();
    } catch (error) {
        logger.error(`Error removing user ${userId} from org ${orgId}:`, error);
        return res.status(500).json({ message: "An internal server error occurred." });
    }
};
