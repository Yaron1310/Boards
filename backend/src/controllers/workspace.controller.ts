import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import {
    workspacesCollection,
    usersCollection,
    membershipsCollection,
    organizationsCollection,
    boardsCollection,
} from '../db/collections.js';
import { JwtUserPayload, DBWorkspace, DBUser, UserRole, DBMembership, JwtVerificationPayload, DBOrganization } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { sendAccountVerificationEmail } from '../services/email.service.js';
import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';

export const getAllWorkspaces = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;

    try {
        let orgs: DBWorkspace[];

        if (user.role === UserRole.REGULAR_USER) {
            // Fetch only workspaces the user is explicitly a member of
            const memberSnap = await membershipsCollection
                .where('userId', '==', user.id)
                .where('entityType', '==', 'workspace')
                .get();
            const wsIds = [...new Set(querySnapshotToArray<DBMembership>(memberSnap).map(m => m.entityId))];
            if (wsIds.length === 0) {
                return res.json([]);
            }
            const chunks: DBWorkspace[] = [];
            for (let i = 0; i < wsIds.length; i += 30) {
                const snap = await workspacesCollection
                    .where(admin.firestore.FieldPath.documentId(), 'in', wsIds.slice(i, i + 30))
                    .get();
                chunks.push(...querySnapshotToArray<DBWorkspace>(snap).filter(w => w.status !== 'archived'));
            }
            orgs = chunks.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            let query: admin.firestore.Query = workspacesCollection;
            if (user.role === UserRole.ORGANIZATION_ADMIN) {
                query = query.where('orgId', '==', user.orgId).where('status', '!=', 'archived');
                const snapshot = await query.orderBy('status').orderBy('name').get();
                orgs = querySnapshotToArray<DBWorkspace>(snapshot);
            } else if (user.role === UserRole.WORKSPACE_ADMIN && user.selectedWorkspaceId) {
                // Can't combine documentId equality with inequality — fetch by doc ref directly
                const wsDoc = await workspacesCollection.doc(user.selectedWorkspaceId).get();
                const ws = snapshotToData<DBWorkspace>(wsDoc);
                orgs = ws && ws.status !== 'archived' ? [ws] : [];
            } else {
                query = query.where('status', '!=', 'archived');
                const snapshot = await query.orderBy('status').orderBy('name').get();
                orgs = querySnapshotToArray<DBWorkspace>(snapshot);
            }
        }

        res.json(orgs);
    } catch (error) {
        logger.error("Error fetching workspaces:", error);
        res.status(500).json({ message: "Failed to fetch workspaces." });
    }
};

export const createWorkspace = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { name, orgId, color } = req.body;

    if (!name) return res.status(400).json({ message: 'Workspace name is required.' });

    const targetOrganizationId = user.role === UserRole.SYSTEM_ADMIN ? orgId : user.orgId;
    if (!targetOrganizationId) return res.status(400).json({ message: 'Workspace ID is required.' });

    try {
        const newDocRef = workspacesCollection.doc();
        const newOrg: Omit<DBWorkspace, 'createdAt' | 'updatedAt'> = {
            id: newDocRef.id,
            name: sanitizeText(name),
            orgId: targetOrganizationId,
            status: 'active',
            ...(color ? { color: sanitizeText(color) } : {}),
        };
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        await newDocRef.set({ ...newOrg, createdAt: timestamp, updatedAt: timestamp });

        const createdOrg = snapshotToData<DBWorkspace>(await newDocRef.get());
        res.status(201).json(createdOrg);
    } catch (error) {
        logger.error("Error creating workspace:", error);
        res.status(500).json({ message: 'Failed to create workspace.' });
    }
};

export const updateWorkspace = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, color } = req.body;
    const user = req.user as JwtUserPayload;

    try {
        const docRef = workspacesCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: "Workspace not found." });
        if (user.role === UserRole.ORGANIZATION_ADMIN && doc.data()?.orgId !== user.orgId) {
            return res.status(403).json({ message: "Forbidden." });
        }

        const updateData: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (name) updateData.name = sanitizeText(name);
        if (color !== undefined) updateData.color = sanitizeText(color);

        await docRef.update(updateData);

        const updatedOrg = snapshotToData<DBWorkspace>(await docRef.get());
        res.json(updatedOrg);
    } catch (error) {
        logger.error(`Error updating workspace ${id}:`, error);
        res.status(500).json({ message: 'Failed to update workspace.' });
    }
};

export const deleteWorkspace = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { force } = req.query;
    const user = req.user as JwtUserPayload;

    try {
        const docRef = workspacesCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(204).send();
        if (user.role === UserRole.ORGANIZATION_ADMIN && doc.data()?.orgId !== user.orgId) {
            return res.status(403).json({ message: "Forbidden." });
        }

        const membershipsSnapshot = await membershipsCollection.where('entityId', '==', id).get();

        if (!membershipsSnapshot.empty) {
            if (force !== 'true') {
                const userIds = [...new Set(membershipsSnapshot.docs.map(d => d.data().userId))];
                const userFetchPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
                for (let i = 0; i < userIds.length; i += 30) {
                    userFetchPromises.push(usersCollection.where(admin.firestore.FieldPath.documentId(), 'in', userIds.slice(i, i + 30)).get());
                }
                const userFetchSnapshots = await Promise.all(userFetchPromises);
                const memberUsers = userFetchSnapshots.flatMap(snap => querySnapshotToArray<DBUser>(snap));

                return res.status(409).json({
                    message: `This workspace has ${memberUsers.length} assigned user(s).`,
                    dependencies: { users: memberUsers.map(u => ({ id: u.id, name: u.name })) }
                });
            }
        }

        // If force is true or no dependencies, archive it + cascade-archive all boards
        const orgId = doc.data()!.orgId;
        const boardsSnap = await boardsCollection(orgId).where('workspaceId', '==', id).get();
        const batch = db.batch();
        batch.update(docRef, { status: 'archived', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        boardsSnap.forEach(b => batch.update(b.ref, { isArchived: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        await batch.commit();
        logger.info(`Successfully archived workspace ${id} and ${boardsSnap.size} boards.`);

        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving workspace ${id}:`, error);
        res.status(500).json({ message: 'Failed to archive workspace.' });
    }
};

export const getArchivedWorkspaces = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await workspacesCollection
            .where('orgId', '==', user.orgId)
            .where('status', '==', 'archived')
            .orderBy('updatedAt', 'desc')
            .get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching archived workspaces:", error);
        res.status(500).json({ message: "Failed to fetch archived workspaces." });
    }
};

export const restoreWorkspace = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as JwtUserPayload;
    try {
        const docRef = workspacesCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: "Workspace not found." });
        if (user.role === UserRole.ORGANIZATION_ADMIN && doc.data()?.orgId !== user.orgId) {
            return res.status(403).json({ message: "Forbidden." });
        }

        await docRef.update({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring workspace ${id}:`, error);
        res.status(500).json({ message: 'Failed to restore workspace.' });
    }
};

export const addWorkspaceManager = async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const { email } = req.body;
    const requestingUser = req.user as JwtUserPayload;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'A valid email is required.' });
    }

    try {
        const orgDoc = await workspacesCollection.doc(workspaceId).get();
        if (!orgDoc.exists || (requestingUser.role === UserRole.ORGANIZATION_ADMIN && orgDoc.data()?.orgId !== requestingUser.orgId)) {
            return res.status(403).json({ message: "Forbidden: You cannot manage this workspace." });
        }
        const orgData = orgDoc.data() as DBWorkspace;

        const userSnapshot = await usersCollection.where('email', '==', email.toLowerCase()).limit(1).get();

        const addManagerRole = async (userId: string, userName: string, userEmail: string) => {
            const membershipSnapshot = await membershipsCollection.where('userId', '==', userId).get();
            const memberships = querySnapshotToArray<DBMembership>(membershipSnapshot);

            if (memberships.some(m => m.role === UserRole.SYSTEM_ADMIN || m.role === UserRole.ORGANIZATION_ADMIN)) {
                return { isHigherAdmin: true };
            }
            if (memberships.some(m => m.entityId === workspaceId && m.role === UserRole.WORKSPACE_ADMIN)) {
                return { alreadyAdmin: true };
            }

            const newMembershipRef = membershipsCollection.doc();
            await newMembershipRef.set({
                id: newMembershipRef.id,
                userId: userId,
                userName,
                userEmail,
                entityId: workspaceId,
                entityType: 'workspace',
                role: UserRole.WORKSPACE_ADMIN,
                orgId: orgData.orgId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { isHigherAdmin: false, alreadyAdmin: false };
        };

        if (!userSnapshot.empty) {
            const user = snapshotToData<DBUser>(userSnapshot.docs[0])!;
            const { isHigherAdmin, alreadyAdmin } = await addManagerRole(user.id, user.name, user.email);
            if(isHigherAdmin) return res.status(400).json({ message: 'This user is a System or Workspace Admin and cannot be assigned as an Workspace Manager.' });
            if(alreadyAdmin) return res.status(200).json({ message: `User ${email} is already a manager of this workspace.` });
            return res.status(200).json({ message: `Successfully promoted existing user ${email} to Workspace Manager.` });
        } else {
            const newUserRef = usersCollection.doc();
            const newAdminUser: Omit<DBUser, 'createdAt' | 'googleId' | 'passwordHash'> = {
                id: newUserRef.id,
                email: email.toLowerCase(),
                name: email.split('@')[0],
                status: 'pending',
            };
            await newUserRef.set({ ...newAdminUser, createdAt: new Date() });
            await addManagerRole(newAdminUser.id, newAdminUser.name, newAdminUser.email);

            const verificationTokenPayload: any = { userId: newAdminUser.id, action: 'verify_email' };
            const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
            const organizationDoc = await organizationsCollection.doc(orgDoc.data()!.orgId).get();
            const organizationName = organizationDoc.exists ? (organizationDoc.data() as DBOrganization).name : 'Logyx';
            await sendAccountVerificationEmail(email, newAdminUser.name, verificationLink, organizationName, 'org_manager', orgData.name);
            return res.status(201).json({ message: `Successfully created Workspace Manager for ${email}. A verification email has been sent to them.` });
        }
    } catch (error) {
        logger.error(`Error adding manager to org ${workspaceId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeWorkspaceManager = async (req: Request, res: Response) => {
    const { workspaceId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;

    try {
        const orgDoc = await workspacesCollection.doc(workspaceId).get();
        if (!orgDoc.exists || (requestingUser.role === UserRole.ORGANIZATION_ADMIN && orgDoc.data()?.orgId !== requestingUser.orgId)) {
            return res.status(403).json({ message: "Forbidden: You cannot manage this workspace." });
        }

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;

        const membershipSnapshot = await membershipsCollection
            .where('userId', '==', userId)
            .where('entityId', '==', workspaceId)
            .where('role', '==', UserRole.WORKSPACE_ADMIN)
            .limit(1).get();

        if(membershipSnapshot.empty) {
            return res.status(400).json({ message: "User is not a manager of this workspace." });
        }

        const membershipRef = membershipSnapshot.docs[0].ref;
        await membershipRef.delete();

        res.status(200).json({ message: `Manager role for ${user.email} has been revoked.` });
    } catch (error) {
        logger.error(`Error removing manager ${userId} from org ${workspaceId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeUserFromWorkspace = async (req: Request, res: Response) => {
    const { workspaceId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;
    try {
        // Authorization
        if (requestingUser.role === UserRole.WORKSPACE_ADMIN && requestingUser.selectedWorkspaceId !== workspaceId) {
             return res.status(403).json({ message: "You can only remove users from your own workspace." });
        }
        const orgDoc = await workspacesCollection.doc(workspaceId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Workspace not found." });
        const workspaceData = snapshotToData<DBWorkspace>(orgDoc)!;
        if (requestingUser.role === UserRole.ORGANIZATION_ADMIN && workspaceData.orgId !== requestingUser.orgId) {
            return res.status(403).json({ message: "You cannot remove users from an workspace outside your workspace." });
        }

        const membershipsSnapshot = await membershipsCollection
            .where('userId', '==', userId)
            .where('entityId', '==', workspaceId)
            .get();

        if(membershipsSnapshot.empty) {
            return res.status(404).json({ message: 'User is not a member of this workspace.' });
        }

        const batch = db.batch();
        membershipsSnapshot.forEach(doc => batch.delete(doc.ref));

        // If user has no other memberships, move them to the Default Workspace for the workspace
        const allMembershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const remainingMemberships = allMembershipsSnapshot.docs.filter(doc => !membershipsSnapshot.docs.some(d => d.id === doc.id));

        if (remainingMemberships.length === 0) {
            const defaultOrgSnapshot = await workspacesCollection.where('orgId', '==', workspaceData.orgId).where('name', '==', 'Default Workspace').limit(1).get();
            if (!defaultOrgSnapshot.empty) {
                const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                
                // Fetch user details for denormalization
                const userDoc = await usersCollection.doc(userId).get();
                const userData = userDoc.exists ? userDoc.data() as DBUser : null;

                const newMembershipRef = membershipsCollection.doc();
                batch.set(newMembershipRef, {
                    id: newMembershipRef.id,
                    userId,
                    userName: userData?.name,
                    userEmail: userData?.email,
                    entityId: defaultOrgId,
                    entityType: 'workspace',
                    role: UserRole.REGULAR_USER,
                    orgId: workspaceData.orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`User ${userId} was reassigned to Default Workspace after removal from ${workspaceId}.`);
            } else {
                 logger.warn(`Could not find Default Workspace for workspace ${workspaceData.orgId} to reassign user ${userId}.`);
            }
        }

        await batch.commit();
        res.status(204).send();
    } catch (error) {
        logger.error(`Error removing user ${userId} from org ${workspaceId}:`, error);
        res.status(500).json({ message: 'Failed to remove user from workspace.' });
    }
};
