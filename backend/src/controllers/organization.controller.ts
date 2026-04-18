import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import {
    organizationsCollection,
    usersCollection,
    membershipsCollection,
    academiesCollection,
} from '../db/collections.js';
import { JwtUserPayload, DBOrganization, DBUser, UserRole, DBMembership, JwtVerificationPayload, DBAcademy } from '../types/index.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { sendAccountVerificationEmail } from '../services/email.service.js';
import { env } from '../config/env.js';
import jwt from 'jsonwebtoken';

export const getAllOrganizations = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;

    try {
        let query: admin.firestore.Query = organizationsCollection;
        if (user.role === UserRole.ACADEMY_ADMIN) {
            query = query.where('orgId', '==', user.orgId);
        } else if (user.role === UserRole.ORGANIZATION_ADMIN) {
            query = query.where(admin.firestore.FieldPath.documentId(), '==', user.selectedOrganizationId);
        }

        // Filter out archived workspaces from the main list
        query = query.where('status', '!=', 'archived');

        const snapshot = await query.orderBy('name').get();
        const orgs = querySnapshotToArray<DBOrganization>(snapshot);

        res.json(orgs);
    } catch (error) {
        logger.error("Error fetching workspaces:", error);
        res.status(500).json({ message: "Failed to fetch workspaces." });
    }
};

export const createOrganization = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { name, orgId } = req.body;

    if (!name) return res.status(400).json({ message: 'Workspace name is required.' });

    const targetAcademyId = user.role === UserRole.SYSTEM_ADMIN ? orgId : user.orgId;
    if (!targetAcademyId) return res.status(400).json({ message: 'Workspace ID is required.' });

    try {
        const newDocRef = organizationsCollection.doc();
        const newOrg: Omit<DBOrganization, 'createdAt' | 'updatedAt'> = {
            id: newDocRef.id,
            name: sanitizeText(name),
            orgId: targetAcademyId,
            status: 'active',
        };
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        await newDocRef.set({ ...newOrg, createdAt: timestamp, updatedAt: timestamp });

        const createdOrg = snapshotToData<DBOrganization>(await newDocRef.get());
        res.status(201).json(createdOrg);
    } catch (error) {
        logger.error("Error creating workspace:", error);
        res.status(500).json({ message: 'Failed to create workspace.' });
    }
};

export const updateOrganization = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, subscriptionProvider, subscriptionStatus } = req.body;
    const user = req.user as JwtUserPayload;

    try {
        const docRef = organizationsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: "Workspace not found." });
        if (user.role === UserRole.ACADEMY_ADMIN && doc.data()?.orgId !== user.orgId) {
            return res.status(403).json({ message: "Forbidden." });
        }

        const updateData: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (name) updateData.name = sanitizeText(name);
        if (subscriptionProvider) updateData.subscriptionProvider = subscriptionProvider;
        if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;

        await docRef.update(updateData);

        const updatedOrg = snapshotToData<DBOrganization>(await docRef.get());
        res.json(updatedOrg);
    } catch (error) {
        logger.error(`Error updating workspace ${id}:`, error);
        res.status(500).json({ message: 'Failed to update workspace.' });
    }
};

export const deleteOrganization = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { force } = req.query;
    const user = req.user as JwtUserPayload;

    try {
        const docRef = organizationsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(204).send();
        if (user.role === UserRole.ACADEMY_ADMIN && doc.data()?.orgId !== user.orgId) {
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

        // If force is true or no dependencies, archive it
        await docRef.update({
            status: 'archived',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        logger.info(`Successfully archived workspace ${id}.`);

        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving workspace ${id}:`, error);
        res.status(500).json({ message: 'Failed to archive workspace.' });
    }
};

export const getArchivedOrganizations = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await organizationsCollection
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

export const restoreOrganization = async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = req.user as JwtUserPayload;
    try {
        const docRef = organizationsCollection.doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ message: "Workspace not found." });
        if (user.role === UserRole.ACADEMY_ADMIN && doc.data()?.orgId !== user.orgId) {
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

export const addOrganizationManager = async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const { email } = req.body;
    const requestingUser = req.user as JwtUserPayload;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'A valid email is required.' });
    }

    try {
        const orgDoc = await organizationsCollection.doc(organizationId).get();
        if (!orgDoc.exists || (requestingUser.role === UserRole.ACADEMY_ADMIN && orgDoc.data()?.orgId !== requestingUser.orgId)) {
            return res.status(403).json({ message: "Forbidden: You cannot manage this workspace." });
        }
        const orgData = orgDoc.data() as DBOrganization;

        const userSnapshot = await usersCollection.where('email', '==', email.toLowerCase()).limit(1).get();

        const addManagerRole = async (userId: string) => {
            const membershipSnapshot = await membershipsCollection.where('userId', '==', userId).get();
            const memberships = querySnapshotToArray<DBMembership>(membershipSnapshot);

            if (memberships.some(m => m.role === UserRole.SYSTEM_ADMIN || m.role === UserRole.ACADEMY_ADMIN)) {
                return { isHigherAdmin: true };
            }
            if (memberships.some(m => m.entityId === organizationId && m.role === UserRole.ORGANIZATION_ADMIN)) {
                return { alreadyAdmin: true };
            }

            const newMembershipRef = membershipsCollection.doc();
            await newMembershipRef.set({
                id: newMembershipRef.id,
                userId: userId,
                entityId: organizationId,
                entityType: 'workspace',
                role: UserRole.ORGANIZATION_ADMIN,
                orgId: orgData.orgId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { isHigherAdmin: false, alreadyAdmin: false };
        };

        if (!userSnapshot.empty) {
            const user = snapshotToData<DBUser>(userSnapshot.docs[0])!;
            const { isHigherAdmin, alreadyAdmin } = await addManagerRole(user.id);
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
            await addManagerRole(newAdminUser.id);

            const verificationTokenPayload: any = { userId: newAdminUser.id, action: 'verify_email' };
            const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
            const academyDoc = await academiesCollection.doc(orgDoc.data()!.orgId).get();
            const academyName = academyDoc.exists ? (academyDoc.data() as DBAcademy).name : 'Gymind';
            await sendAccountVerificationEmail(email, newAdminUser.name, verificationLink, academyName, 'org_manager', orgData.name);
            return res.status(201).json({ message: `Successfully created Workspace Manager for ${email}. A verification email has been sent to them.` });
        }
    } catch (error) {
        logger.error(`Error adding manager to org ${organizationId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeOrganizationManager = async (req: Request, res: Response) => {
    const { organizationId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;

    try {
        const orgDoc = await organizationsCollection.doc(organizationId).get();
        if (!orgDoc.exists || (requestingUser.role === UserRole.ACADEMY_ADMIN && orgDoc.data()?.orgId !== requestingUser.orgId)) {
            return res.status(403).json({ message: "Forbidden: You cannot manage this workspace." });
        }

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;

        const membershipSnapshot = await membershipsCollection
            .where('userId', '==', userId)
            .where('entityId', '==', organizationId)
            .where('role', '==', UserRole.ORGANIZATION_ADMIN)
            .limit(1).get();

        if(membershipSnapshot.empty) {
            return res.status(400).json({ message: "User is not a manager of this workspace." });
        }

        const membershipRef = membershipSnapshot.docs[0].ref;
        await membershipRef.delete();

        res.status(200).json({ message: `Manager role for ${user.email} has been revoked.` });
    } catch (error) {
        logger.error(`Error removing manager ${userId} from org ${organizationId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeUserFromOrganization = async (req: Request, res: Response) => {
    const { organizationId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;
    try {
        // Authorization
        if (requestingUser.role === UserRole.ORGANIZATION_ADMIN && requestingUser.selectedOrganizationId !== organizationId) {
             return res.status(403).json({ message: "You can only remove users from your own workspace." });
        }
        const orgDoc = await organizationsCollection.doc(organizationId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Workspace not found." });
        const organizationData = snapshotToData<DBOrganization>(orgDoc)!;
        if (requestingUser.role === UserRole.ACADEMY_ADMIN && organizationData.orgId !== requestingUser.orgId) {
            return res.status(403).json({ message: "You cannot remove users from an workspace outside your workspace." });
        }

        const membershipsSnapshot = await membershipsCollection
            .where('userId', '==', userId)
            .where('entityId', '==', organizationId)
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
            const defaultOrgSnapshot = await organizationsCollection.where('orgId', '==', organizationData.orgId).where('name', '==', 'Default Workspace').limit(1).get();
            if (!defaultOrgSnapshot.empty) {
                const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                const newMembershipRef = membershipsCollection.doc();
                batch.set(newMembershipRef, {
                    id: newMembershipRef.id,
                    userId,
                    entityId: defaultOrgId,
                    entityType: 'workspace',
                    role: UserRole.REGULAR_USER,
                    orgId: organizationData.orgId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                logger.info(`User ${userId} was reassigned to Default Workspace after removal from ${organizationId}.`);
            } else {
                 logger.warn(`Could not find Default Workspace for workspace ${organizationData.orgId} to reassign user ${userId}.`);
            }
        }

        await batch.commit();
        res.status(204).send();
    } catch (error) {
        logger.error(`Error removing user ${userId} from org ${organizationId}:`, error);
        res.status(500).json({ message: 'Failed to remove user from workspace.' });
    }
};
