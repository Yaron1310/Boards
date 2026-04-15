import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import {
    usersCollection,
    organizationsCollection,
    academiesCollection,
    membershipsCollection,
    academySettingsCollection,
    plansCollection
} from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { db } from '../services/firestore.service.js';
import { UserRole, DBAcademy, DBPlan } from '../types/index.js';
import { sendWoocommerceWelcomeEmail } from '../services/email.service.js';
import { sanitizeText, sanitizeUrl } from '../utils/sanitizer.js';
import admin from 'firebase-admin';

export const getAcademyPlans = async (req: Request, res: Response) => {
    const academyId = req.academyId!;
    try {
        const plansSnapshot = await plansCollection
            .where('academyId', '==', academyId)
            .where('status', '==', 'active')
            .orderBy('name')
            .get();

        if (plansSnapshot.empty) {
            return res.json([]);
        }

        const plans = querySnapshotToArray<DBPlan>(plansSnapshot).map(plan => ({
            id: plan.id,
            name: plan.name
        }));

        res.status(200).json(plans);
    } catch (error) {
        logger.error(`Error fetching plans for academy ${academyId}:`, error);
        return res.status(500).json({ success: false, message: 'An internal server error occurred while fetching plans.' });
    }
};

export const checkOrganizationName = async (req: Request, res: Response) => {
    const academyId = req.academyId!;
    const name = req.query.name as string;

    if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Query parameter "name" is required.' });
    }

    try {
        const orgSnapshot = await organizationsCollection
            .where('academyId', '==', academyId)
            .where('name', '==', name.trim())
            .limit(1)
            .get();

        return res.status(200).json({ available: orgSnapshot.empty });
    } catch (error) {
        logger.error(`Error checking organization name for academy ${academyId}:`, error);
        return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

export const connectWordPress = async (req: Request, res: Response) => {
    const { webhookUrl } = req.body;
    const academyId = req.academyId!;

    if (!webhookUrl) {
        return res.status(400).json({ success: false, message: 'webhookUrl is required.' });
    }

    try {
        await academySettingsCollection.doc(academyId).set({
            subscriptionCancellationWebhookUrl: sanitizeUrl(webhookUrl),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        logger.info(`Successfully registered cancellation webhook for academy ${academyId}: ${webhookUrl}`);
        return res.status(200).json({ success: true, message: 'Connection successful. Webhook URL registered.' });
    } catch (error) {
        logger.error(`Error connecting WordPress for academy ${academyId}:`, error);
        return res.status(500).json({ success: false, message: 'Failed to register webhook URL.' });
    }
};

export const handleWoocommerceProvision = async (req: Request, res: Response) => {
    const { email, name, planId, organizationName } = req.body;
    const academyId = req.academyId!;

    if (!email || !name || !planId || !organizationName) {
        return res.status(400).json({ success: false, message: 'Missing required fields: email, name, planId, organizationName.' });
    }

    try {
        // 1. Validate plan exists and belongs to academy
        const planDoc = await plansCollection.doc(planId).get();
        if (!planDoc.exists || planDoc.data()?.academyId !== academyId) {
            logger.warn(`Provisioning attempt with invalid planId '${planId}' for academy '${academyId}'.`);
            return res.status(403).json({ success: false, message: 'Invalid planId for this API key.' });
        }
        const plan = snapshotToData<DBPlan>(planDoc)!;

        // 2. Find or create organization
        const sanitizedOrgName = sanitizeText(organizationName).trim();
        const existingOrgSnapshot = await organizationsCollection
            .where('academyId', '==', academyId)
            .where('name', '==', sanitizedOrgName)
            .limit(1)
            .get();

        let orgId: string;
        const batch = db.batch();

        if (!existingOrgSnapshot.empty) {
            // Organization exists — update its plan
            orgId = existingOrgSnapshot.docs[0].id;
            const orgRef = organizationsCollection.doc(orgId);
            batch.update(orgRef, {
                planId,
                subscriptionProvider: 'woocommerce',
                subscriptionStatus: 'active',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`Existing organization '${sanitizedOrgName}' (${orgId}) updated with plan '${planId}'.`);
        } else {
            // Create new organization
            const orgRef = organizationsCollection.doc();
            orgId = orgRef.id;

            let subscriptionEndDate: Date | null = null;
            const now = new Date();
            if (plan.planType === 'subscription') {
                subscriptionEndDate = new Date(new Date(now).setMonth(now.getMonth() + 1));
            } else if (plan.planType === 'one-time') {
                subscriptionEndDate = new Date(new Date(now).setFullYear(now.getFullYear() + 100));
            }

            batch.set(orgRef, {
                id: orgId,
                name: sanitizedOrgName,
                academyId,
                planId,
                subscriptionProvider: 'woocommerce',
                subscriptionStatus: 'active',
                subscriptionEndDate,
                status: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`New organization '${sanitizedOrgName}' (${orgId}) created with plan '${planId}'.`);
        }

        // 3. Find or create user and add as org admin
        const userQuery = await usersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
        let userId: string;
        let isNewUser = false;

        if (!userQuery.empty) {
            userId = userQuery.docs[0].id;
            const existingUser = userQuery.docs[0].data();
            if (existingUser.status === 'pending') {
                batch.update(userQuery.docs[0].ref, { status: 'active', emailVerified: true });
            }
        } else {
            // Create new user
            const newUserRef = usersCollection.doc();
            userId = newUserRef.id;
            isNewUser = true;
            batch.set(newUserRef, {
                id: userId,
                email: email.toLowerCase(),
                name: sanitizeText(name),
                status: 'active',
                hasSeenChatPrivacyNotice: false,
                createdAt: new Date()
            });
        }

        // 4. Check if user already has membership in this org
        const existingMembership = await membershipsCollection
            .where('userId', '==', userId)
            .where('entityId', '==', orgId)
            .limit(1)
            .get();

        if (existingMembership.empty) {
            // Remove from Default Organization if needed
            const defaultOrgSnapshot = await organizationsCollection
                .where('academyId', '==', academyId)
                .where('name', '==', 'Default Organization')
                .limit(1)
                .get();

            if (!defaultOrgSnapshot.empty) {
                const defaultOrgId = defaultOrgSnapshot.docs[0].id;
                if (orgId !== defaultOrgId) {
                    const defaultMemberships = await membershipsCollection
                        .where('userId', '==', userId)
                        .where('entityId', '==', defaultOrgId)
                        .get();
                    defaultMemberships.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                }
            }

            // Add org admin membership
            const membershipRef = membershipsCollection.doc();
            batch.set(membershipRef, {
                id: membershipRef.id,
                userId,
                entityId: orgId,
                entityType: 'organization',
                role: UserRole.ORGANIZATION_ADMIN,
                academyId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();

        // 5. Send welcome email with registration or login link (after batch commit)
        const academyDoc = await academiesCollection.doc(academyId).get();
        const academyName = academyDoc.exists ? (academyDoc.data() as DBAcademy).name : 'Gymind';

        await sendWoocommerceWelcomeEmail(email, sanitizeText(name), academyName, isNewUser);

        if (isNewUser) {
            logger.info(`New user '${email}' created as org admin for '${sanitizedOrgName}'. Welcome email with registration link sent.`);
            return res.status(201).json({ success: true, message: 'Organization created, new user provisioned, and welcome email sent.', organizationId: orgId });
        }

        logger.info(`Existing user '${email}' added as org admin to '${sanitizedOrgName}' via WooCommerce provisioning. Welcome email with login link sent.`);
        return res.status(200).json({ success: true, message: 'Organization provisioned and user assigned as admin.', organizationId: orgId });

    } catch (error) {
        logger.error("Error during WooCommerce provisioning:", error);
        return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};

export const updateSubscriptionStatus = async (req: Request, res: Response) => {
    const { planId, status } = req.body;
    const academyId = req.academyId!;

    const validStatuses = ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'];
    if (!planId || !status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Missing or invalid fields: planId and status are required.' });
    }

    try {
        const orgRef = organizationsCollection.doc(planId);
        const orgDoc = await orgRef.get();

        if (!orgDoc.exists || orgDoc.data()?.academyId !== academyId) {
            logger.warn(`Subscription status update attempt with invalid planId '${planId}' for academy '${academyId}'.`);
            return res.status(403).json({ success: false, message: 'Invalid planId for this API key.' });
        }

        await orgRef.update({
            subscriptionStatus: status,
            subscriptionProvider: 'woocommerce'
        });

        logger.info(`Updated subscription status for organization '${planId}' to '${status}' via WooCommerce webhook.`);
        return res.status(200).json({ success: true, message: 'Subscription status updated successfully.' });

    } catch (error) {
        logger.error(`Error updating subscription status for organization ${planId}:`, error);
        return res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
};