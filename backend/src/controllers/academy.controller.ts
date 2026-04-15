import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import jwt from 'jsonwebtoken';
import admin from 'firebase-admin';

import {
    academiesCollection,
    organizationsCollection,
    usersCollection,
    academySettingsCollection,
    membershipsCollection,
} from '../db/collections.js';
import { db, querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { DBOrganization, DBUser, JwtVerificationPayload, UserRole, DBAcademySettings, DBMembership, JwtMultiOrgPayload, DBAcademy, JwtUserPayload } from '../types/index.js';
import { env } from '../config/env.js';
import { sendAccountVerificationEmail } from '../services/email.service.js';
import { sanitizeText, sanitizeUrl } from '../utils/sanitizer.js';
import { generateFullLoginResponse } from './auth.controller.js';


export const getAllAcademies = async (req: Request, res: Response) => {
    try {
        const snapshot = await academiesCollection.orderBy('name').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error: any) {
        logger.error("Error fetching academies:", error);
        res.status(500).json({ message: "Failed to fetch academies." });
    }
};

export const createAcademy = async (req: Request, res: Response) => {
    const name = sanitizeText(req.body.name);
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    try {
        const batch = db.batch();
        const newAcademyRef = academiesCollection.doc();
        const newAcademy = { id: newAcademyRef.id, name, createdAt: new Date() };
        batch.set(newAcademyRef, newAcademy);

        const defaultOrgRef = organizationsCollection.doc();
        const newDefaultOrg = {
            id: defaultOrgRef.id,
            name: 'Default Organization',
            academyId: newAcademyRef.id,
            isPersonal: true,
            createdAt: new Date(),
        };
        batch.set(defaultOrgRef, newDefaultOrg);

        const settingsRef = academySettingsCollection.doc(newAcademyRef.id);
        const defaultSettings: Omit<DBAcademySettings, 'updatedAt'> = {
            id: newAcademyRef.id,
            sidebarColor: '#004e89',
            appName: name,
            logoUrl: '/logo_gym.webp',
            displayNameColor: '#ffffff',
            sidebarLinkColor: '#e5e7eb',
        };
        batch.set(settingsRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await batch.commit();
        logger.info(`Created new academy '${name}' (${newAcademyRef.id}) with default organization and settings.`);
        res.status(201).json(snapshotToData(await newAcademyRef.get()));
    } catch (error) {
        logger.error("Error creating academy:", error);
        res.status(500).json({ message: "Failed to create academy." });
    }
};

export const addAcademyAdmin = async (req: Request, res: Response) => {
    const { academyId } = req.params;
    const email = sanitizeText(req.body.email);
    const requestingUser = req.user as JwtUserPayload;

    if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'A valid email is required.' });
    }

    try {
        // --- Authorization Check ---
        const academyDoc = await academiesCollection.doc(academyId).get();
        if (!academyDoc.exists) {
            return res.status(404).json({ message: "Academy not found." });
        }

        let isAuthorized = false;
        if (requestingUser.role === UserRole.SYSTEM_ADMIN) {
            isAuthorized = true;
        } else if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
            // An Academy Admin can only add other admins to their OWN academy.
            isAuthorized = requestingUser.academyId === academyId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to manage admins for this academy." });
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

            if (!memberships.some(m => m.entityId === academyId && m.role === UserRole.ACADEMY_ADMIN)) {
                const newMembershipRef = membershipsCollection.doc();
                batch.set(newMembershipRef, {
                    id: newMembershipRef.id,
                    userId: userId,
                    entityId: academyId,
                    entityType: 'academy',
                    role: UserRole.ACADEMY_ADMIN,
                    academyId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                return { alreadyAdmin: true };
            }

            // Ensure the admin has a Personal Workspace in this academy
            const orgsSnapshot = await organizationsCollection
                .where('academyId', '==', academyId)
                .where('isPersonal', '==', true)
                .get();

            const userOrgIds = memberships.filter(m => m.entityType === 'organization').map(m => m.entityId);
            const hasPersonalOrgInThisAcademy = querySnapshotToArray<DBOrganization>(orgsSnapshot)
                .some(org => userOrgIds.includes(org.id));

            if (!hasPersonalOrgInThisAcademy) {
                const personalOrgRef = organizationsCollection.doc();
                const personalOrgId = personalOrgRef.id;
                batch.set(personalOrgRef, {
                    id: personalOrgId,
                    name: `${userName}'s Personal Workspace`,
                    academyId: academyId,
                    isPersonal: true,
                    subscriptionProvider: 'gymind',
                    subscriptionStatus: 'active',
                    status: 'active',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const personalMembershipRef = membershipsCollection.doc();
                batch.set(personalMembershipRef, {
                    id: personalMembershipRef.id,
                    userId: userId,
                    entityId: personalOrgId,
                    entityType: 'organization',
                    role: UserRole.REGULAR_USER,
                    academyId,
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
            if(isHigherAdmin) return res.status(400).json({ message: 'This user is a System Admin and cannot be assigned to a specific academy.' });
            if(alreadyAdmin) return res.status(200).json({ message: `User ${email} is already an admin for this academy.` });
            return res.status(200).json({ message: `Successfully promoted existing user ${email} to Academy Admin and created a Personal Workspace.` });
        } else {
            const newUserRef = usersCollection.doc();
            const newAdminUser: Omit<DBUser, 'createdAt' | 'googleId' | 'passwordHash'> = {
                id: newUserRef.id,
                email: email.toLowerCase(),
                name: email.split('@')[0],
                status: 'pending',
                hasSeenChatPrivacyNotice: false,
            };
            await newUserRef.set({ ...newAdminUser, createdAt: new Date() });
            await addAdminRole(newAdminUser.id, newAdminUser.email, newAdminUser.name);

            const verificationTokenPayload: JwtVerificationPayload = { userId: newAdminUser.id, action: 'verify_email' };
            const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
            const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
            const academyName = academyDoc.exists ? (academyDoc.data()?.name || 'Gymind') : 'Gymind';
            await sendAccountVerificationEmail(email, newAdminUser.name, verificationLink, academyName, 'academy_admin');
            return res.status(201).json({ message: `Successfully created Academy Admin for ${email}. A verification email and a new Personal Workspace have been prepared.` });
        }
    } catch (error) {
        logger.error(`Error adding academy admin for academy ${academyId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};

export const removeAcademyAdmin = async (req: Request, res: Response) => {
    const { academyId, userId } = req.params;
    const requestingUser = req.user as JwtUserPayload;

    if (requestingUser.id === userId) {
        return res.status(403).json({ message: "You cannot remove your own admin privileges." });
    }

    try {
        // --- Authorization Check ---
        const academyDoc = await academiesCollection.doc(academyId).get();
        if (!academyDoc.exists) {
            return res.status(404).json({ message: "Academy not found." });
        }

        let isAuthorized = false;
        if (requestingUser.role === UserRole.SYSTEM_ADMIN) {
            isAuthorized = true;
        } else if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
            isAuthorized = requestingUser.academyId === academyId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to manage admins for this academy." });
        }
        // --- End Authorization ---

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;

        const membershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
        const adminMembership = memberships.find(m => m.entityId === academyId && m.role === UserRole.ACADEMY_ADMIN);

        if (!adminMembership) {
            return res.status(400).json({ message: "This user is not an Admin for this academy." });
        }

        // Remove the Admin membership
        await membershipsCollection.doc(adminMembership.id).delete();

        const remainingMemberships = memberships.filter(m => m.id !== adminMembership.id);

        if (remainingMemberships.length === 0) {
            logger.info(`User ${userId} only had this admin role. Reassigning to Default Organization instead of deleting.`);

            // Find the Default Organization for this Academy
            const defaultOrgSnapshot = await organizationsCollection
                .where('academyId', '==', academyId)
                .where('name', '==', 'Default Organization')
                .limit(1).get();

            if (!defaultOrgSnapshot.empty) {
                const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                const newMembershipRef = membershipsCollection.doc();

                await newMembershipRef.set({
                    id: newMembershipRef.id,
                    userId: userId,
                    entityId: defaultOrgId,
                    entityType: 'organization',
                    role: UserRole.REGULAR_USER,
                    academyId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return res.status(200).json({ message: `Admin privileges removed. The user has been reassigned to the Default Organization as a regular user.` });
            } else {
                // Should not happen if data integrity is maintained, but handling just in case
                logger.error(`Default Organization not found for academy ${academyId}. User ${userId} is left without roles.`);
                return res.status(200).json({ message: `Admin privileges removed. User has no remaining roles.` });
            }
        } else {
            logger.info(`Successfully removed Academy Admin privileges for user ${userId}. They have other roles.`);
            return res.status(200).json({ message: `Admin privileges removed. The user has been demoted.` });
        }
    } catch (error) {
        logger.error(`Error removing academy admin for user ${userId}:`, error);
        res.status(500).json({ message: 'An internal server error occurred while removing the admin.' });
    }
};

export const updateAcademy = async (req: Request, res: Response) => {
    try {
        const academyRef = academiesCollection.doc(req.params.id);
        const name = sanitizeText(req.body.name);
        await academyRef.update({ name });
        res.json(snapshotToData(await academyRef.get()));
    } catch (error) {
        logger.error("Error updating academy:", error);
        res.status(500).json({ message: "Failed to update academy." });
    }
};

export const deleteAcademy = async (req: Request, res: Response) => {
    try {
        const academyId = req.params.id;

        const batch = db.batch();
        batch.delete(academiesCollection.doc(academyId));
        // Delete academy settings to ensure public page is disabled
        batch.delete(academySettingsCollection.doc(academyId));
        await batch.commit();

        logger.info(`Successfully deleted academy ${academyId} and its settings.`);
        res.status(204).send();
    } catch (error) {
        logger.error("Error deleting academy:", error);
        res.status(500).json({ message: "Failed to delete academy." });
    }
};

export const checkNameUniqueness = async (req: Request, res: Response) => {
    const { name } = req.query;

    if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: 'Academy name is required.' });
    }

    try {
        const sanitizedName = sanitizeText(name);
        const academySnapshot = await academiesCollection.where('name', '==', sanitizedName).limit(1).get();

        if (academySnapshot.empty) {
            return res.json({ isUnique: true });
        } else {
            return res.json({ isUnique: false });
        }
    } catch (error) {
        logger.error(`Error checking academy name uniqueness for name: ${name}`, error);
        res.status(500).json({ message: 'Server error while checking name uniqueness.' });
    }
};

export const setupAcademy = async (req: Request, res: Response) => {
    const { academyName } = req.body;
    const partialToken = req.user as JwtMultiOrgPayload;

    if (!academyName) {
        return res.status(400).json({ message: 'Academy name is required.' });
    }
    if (!partialToken || partialToken.action !== 'academy-setup') {
        return res.status(401).json({ message: 'Invalid token for academy setup.' });
    }

    const sanitizedName = sanitizeText(academyName);

    try {
        const userId = partialToken.id;

        await db.runTransaction(async (transaction) => {
            const academySnapshot = await transaction.get(academiesCollection.where('name', '==', sanitizedName).limit(1));
            if (!academySnapshot.empty) {
                throw new Error('Academy name is already taken.');
            }

            const userDoc = await transaction.get(usersCollection.doc(userId));
            if (!userDoc.exists) {
                throw new Error('User not found.');
            }
            const user = userDoc.data() as DBUser;

            const existingAdminMemberships = await transaction.get(
                membershipsCollection.where('userId', '==', userId).where('role', '==', UserRole.ACADEMY_ADMIN)
            );
            if (!existingAdminMemberships.empty) {
                throw new Error('This user is already an administrator of an academy.');
            }

            const newAcademyRef = academiesCollection.doc();
            transaction.set(newAcademyRef, {
                id: newAcademyRef.id,
                name: sanitizedName,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const academyMembershipRef = membershipsCollection.doc();
            transaction.set(academyMembershipRef, {
                id: academyMembershipRef.id,
                userId: userId,
                entityId: newAcademyRef.id,
                entityType: 'academy',
                role: UserRole.ACADEMY_ADMIN,
                academyId: newAcademyRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const personalOrgRef = organizationsCollection.doc();
            transaction.set(personalOrgRef, {
                id: personalOrgRef.id,
                name: `${user.name}'s Personal Workspace`,
                academyId: newAcademyRef.id,
                isPersonal: true,
                subscriptionProvider: 'gymind',
                subscriptionStatus: 'incomplete',
                status: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const orgMembershipRef = membershipsCollection.doc();
            transaction.set(orgMembershipRef, {
                id: orgMembershipRef.id,
                userId: userId,
                entityId: personalOrgRef.id,
                entityType: 'organization',
                role: UserRole.REGULAR_USER,
                academyId: newAcademyRef.id,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const settingsRef = academySettingsCollection.doc(newAcademyRef.id);
            const defaultSettings: Omit<DBAcademySettings, 'updatedAt'> = {
                id: newAcademyRef.id,
                sidebarColor: '#004e89',
                appName: sanitizedName,
                logoUrl: '/logo_gym.webp',
                displayNameColor: '#ffffff',
                sidebarLinkColor: '#e5e7eb',
            };
            transaction.set(settingsRef, { ...defaultSettings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });

        res.status(201).json({ message: 'Academy created successfully. Proceed to payment.' });

    } catch (error: any) {
        if (error.message === 'Academy name is already taken.' || error.message.includes('already an administrator')) {
            return res.status(409).json({ message: error.message });
        }
        logger.error(`Error setting up academy for user ${partialToken.id}:`, error);
        res.status(500).json({ message: 'An internal server error occurred during academy setup.' });
    }
};

export const activateSubscription = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    if (!partialToken || partialToken.action !== 'academy-setup') {
        return res.status(401).json({ message: 'Invalid token for activation.' });
    }

    try {
        const userId = partialToken.id;
        const userRef = usersCollection.doc(userId);

        let academyId: string;
        let personalOrgId: string;

        await db.runTransaction(async (transaction) => {
            // --- READ PHASE ---
            const adminMembershipSnapshot = await transaction.get(
                membershipsCollection.where('userId', '==', userId).where('role', '==', UserRole.ACADEMY_ADMIN).limit(1)
            );
            if (adminMembershipSnapshot.empty) {
                throw new Error('User is not an academy admin.');
            }
            academyId = adminMembershipSnapshot.docs[0].data().entityId;

            const personalOrgSnapshot = await transaction.get(
                organizationsCollection.where('academyId', '==', academyId).where('isPersonal', '==', true)
            );
            if (personalOrgSnapshot.empty) {
                throw new Error('Personal organization for admin not found.');
            }
            const orgRef = personalOrgSnapshot.docs[0].ref;
            personalOrgId = orgRef.id;

            // --- WRITE PHASE ---
            const academyRef = academiesCollection.doc(academyId);
            transaction.update(academyRef, { subscriptionStatus: 'active' });
            transaction.update(orgRef, { subscriptionStatus: 'active' });
            transaction.update(userRef, { status: 'active' });
        });

        const finalUserDoc = await usersCollection.doc(userId).get();
        const finalUser = snapshotToData<DBUser>(finalUserDoc)!;

        const allMembershipsSnapshot = await membershipsCollection.where('userId', '==', userId).get();
        const allMemberships = querySnapshotToArray<DBMembership>(allMembershipsSnapshot);

        const loginResponse = await generateFullLoginResponse(finalUser, personalOrgId!, allMemberships, UserRole.ACADEMY_ADMIN);

        res.status(200).json(loginResponse);

    } catch (error: any) {
        logger.error(`Error activating academy for user ${partialToken.id}:`, error);
        res.status(500).json({ message: error.message || 'An internal server error occurred during activation.' });
    }
};
