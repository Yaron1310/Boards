
import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import crypto from 'crypto';

import { 
    plansCollection,
    usersCollection,
    membershipsCollection,
    pendingCheckoutsCollection,
    paymentSessionsCollection,
    paymentInitiationSessionsCollection,
    organizationsCollection,
    systemSettingsCollection, 
    academiesCollection,
    tokenUsageCollection
} from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { db } from '../services/firestore.service.js';
import { 
    DBUser, 
    DBPlan, 
    DBMembership, 
    UserRole, 
    DBPendingCheckout, 
    DBPaymentInitiationSession,
    DBSystemSettings,      
    DBAcademy,             
    DBOrganization,        
    DBTokenUsage           
} from '../types/index.js';
import { env } from '../config/env.js';
import { generateFullLoginResponse } from './auth.controller.js';
import { sendWelcomeEmail } from '../services/email.service.js';


/**
 * Helper Function: Creates User, Organization, and Membership from a payment session.
 * Uses a transaction to ensure idempotency and prevent race conditions.
 */
async function activateSubscriptionFromSession(sessionId: string): Promise<{ user: DBUser, orgId: string, memberships: DBMembership[] }> {
    const sessionRef = paymentInitiationSessionsCollection.doc(sessionId);

    return db.runTransaction(async (transaction) => {
        const sessionDoc = await transaction.get(sessionRef);

        if (!sessionDoc.exists) {
            throw new Error(`Payment session not found or already processed: ${sessionId}`);
        }
        const sessionData = sessionDoc.data() as DBPaymentInitiationSession;

        // --- PRE-FETCH ALL NECESSARY DOCUMENTS (READS MUST COME FIRST) ---
        const userId = sessionData.userId;
        let orgId = sessionData.organizationId;

        const readPromises: any[] = [];
        
        // 1. User doc
        if (userId) {
            readPromises.push(transaction.get(usersCollection.doc(userId)));
        } else {
            readPromises.push(Promise.resolve(null));
        }

        // 2. Org doc
        if (orgId) {
            readPromises.push(transaction.get(organizationsCollection.doc(orgId)));
        } else {
            readPromises.push(Promise.resolve(null));
        }

        // 3. Memberships (for existing user/org combination)
        if (userId && orgId) {
            readPromises.push(transaction.get(membershipsCollection.where('userId', '==', userId).where('entityId', '==', orgId)));
        } else {
            readPromises.push(Promise.resolve(null));
        }

        // 4. Plan doc (for duration/type check)
        readPromises.push(transaction.get(plansCollection.doc(sessionData.planId)));

        // 5. If session already completed, pre-fetch resources for idempotency check
        if (sessionData.status === 'completed' && sessionData.createdUserId && sessionData.createdOrgId) {
            readPromises.push(transaction.get(usersCollection.doc(sessionData.createdUserId)));
            readPromises.push(transaction.get(membershipsCollection.where('userId', '==', sessionData.createdUserId).where('entityId', '==', sessionData.createdOrgId)));
        } else {
            readPromises.push(Promise.resolve(null));
            readPromises.push(Promise.resolve(null));
        }

        const [userDoc, orgDoc, membershipsSnapshot, planDocForActivation, completedUserDoc, completedMembershipsSnapshot] = await Promise.all(readPromises);

        // --- IDEMPOTENCY CHECK ---
        if (sessionData.status === 'completed' && sessionData.createdUserId && sessionData.createdOrgId) {
            logger.info(`Activation Helper: Session ${sessionId} was already processed. Returning existing resources.`);
            
            if (!completedUserDoc || !completedUserDoc.exists) throw new Error("Created user not found.");
            const existingUser = snapshotToData<DBUser>(completedUserDoc)!;
            const memberships = querySnapshotToArray<DBMembership>(completedMembershipsSnapshot);
            
            return { user: existingUser, orgId: sessionData.createdOrgId!, memberships };
        }

        // --- PROCESSING NEW ACTIVATION (WRITES START HERE) ---
        let user: DBUser;

        if (!userId) {
            // Create new user
            const userRef = usersCollection.doc();
            const newUserId = userRef.id;
            const newUser: Omit<DBUser, 'createdAt'> = {
                id: newUserId,
                name: sessionData.name,
                email: sessionData.email,
                passwordHash: sessionData.passwordHash,
                status: 'active',
                profileImageUrl: '/default_user.webp',
                registrationType: 'payment'
            };
            transaction.set(userRef, { ...newUser, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            
            // Construct returned user object manually since we can't read-after-write
            user = { ...newUser, createdAt: new Date() } as DBUser; 
            logger.info(`Activation Helper: Queueing creation of new user ${newUserId}`);
        } else {
            // Activate existing user
            const userRef = usersCollection.doc(userId);
            if (!userDoc || !userDoc.exists) throw new Error("User not found during activation");
            const existingUser = snapshotToData<DBUser>(userDoc)!;

            transaction.update(userRef, { status: 'active', registrationType: 'payment' });
            user = { ...existingUser, status: 'active', registrationType: 'payment' };
        }

        // Create or Update organization and membership
        let memberships: DBMembership[] = [];

        const planForActivation = snapshotToData<DBPlan>(planDocForActivation);
        
        let subscriptionEndDate: Date | null = null;
        if (planForActivation) {
            const now = new Date();
            if (planForActivation.planType === 'subscription') {
                subscriptionEndDate = new Date(now.setMonth(now.getMonth() + 1));
            } else if (planForActivation.planType === 'one-time') {
                subscriptionEndDate = new Date(now.setFullYear(now.getFullYear() + 100));
            }
        }

        if (orgId && orgDoc && orgDoc.exists) {
            // UPGRADE EXISTING ORG
            const orgRef = organizationsCollection.doc(orgId);
            transaction.update(orgRef, {
                planId: sessionData.planId,
                subscriptionProvider: 'gymind',
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate || admin.firestore.FieldValue.delete(),
                cancelAtPeriodEnd: admin.firestore.FieldValue.delete(), // Reset cancellation if upgraded
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`Activation Helper: Upgraded existing Org ${orgId} to plan ${sessionData.planId}`);
            
            // Use the memberships we pre-fetched
            if (membershipsSnapshot) {
                memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
            }

            // If for some reason the user is not a member (shouldn't happen for upgrade flow), create membership
            if (memberships.length === 0) {
                const memberRef = membershipsCollection.doc();
                const newMembership: Omit<DBMembership, 'createdAt'> = {
                    id: memberRef.id,
                    userId: userId!,
                    entityId: orgId,
                    entityType: 'organization',
                    role: sessionData.isForSingleUser ? UserRole.REGULAR_USER : UserRole.ORGANIZATION_ADMIN,
                    academyId: sessionData.academyId
                };
                transaction.set(memberRef, { ...newMembership, createdAt: admin.firestore.FieldValue.serverTimestamp() });
                memberships = [newMembership as DBMembership];
            }
        } else {
            // CREATE NEW ORG (either orgId didn't exist or doc wasn't found)
            if (orgId) logger.warn(`Activation Helper: Org ${orgId} not found for upgrade. Creating new instead.`);
            
            const orgRef = organizationsCollection.doc();
            orgId = orgRef.id;
            const memberRef = membershipsCollection.doc();

            const newOrg = {
                id: orgId,
                name: sessionData.company || `${sessionData.name}'s Workspace`,
                academyId: sessionData.academyId,
                planId: sessionData.planId,
                subscriptionProvider: 'gymind',
                subscriptionStatus: 'active',
                subscriptionEndDate: subscriptionEndDate || null,
                status: 'active',
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            transaction.set(orgRef, newOrg);
            
            const newMembership: Omit<DBMembership, 'createdAt'> = {
                id: memberRef.id,
                userId: user.id, // Use actual ID (might be new or existing)
                entityId: orgId,
                entityType: 'organization',
                role: sessionData.isForSingleUser ? UserRole.REGULAR_USER : UserRole.ORGANIZATION_ADMIN,
                academyId: sessionData.academyId
            };
            transaction.set(memberRef, { ...newMembership, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            memberships = [newMembership as DBMembership];
            
            logger.info(`Activation Helper: Queuing creation of New Org ${orgId} and Membership ${memberRef.id}.`);
        }

        // Update session status instead of deleting to allow the second caller (Callback) to succeed
        transaction.update(sessionRef, {
            status: 'completed',
            createdUserId: user.id,
            createdOrgId: orgId
        });

        // Send Welcome Email (Fire and forget)
        sendWelcomeEmail(user.email, user.name).catch(err => logger.error("Failed to send welcome email:", err));
        
        return { user, orgId, memberships };
    });
}


// --- PAYMENT SIMULATOR CONTROLLER ---

/**
 * Step 1: Frontend calls this to create a temporary session and get the Iframe URL.
 * NO organization or membership is created at this stage.
 */
export const initiatePaymentSimulator = async (req: Request, res: Response) => {
    const { planId, name, email, password, company, address, city, zip, country, checkoutSessionId, organizationId } = req.body;

    if (!planId || !name || !email || !company || !address || !city || !zip || !country) {
        return res.status(400).json({ message: "Missing required fields. Please ensure all details are provided." });
    }

    try {
        const planDoc = await plansCollection.doc(planId).get();
        if (!planDoc.exists) {
            return res.status(404).json({ message: "Plan not found." });
        }
        const plan = snapshotToData<DBPlan>(planDoc)!;
        
        let userId: string | undefined;
        let passwordHash: string | undefined;

        const existingUserSnap = await usersCollection.where('email', '==', email).limit(1).get();
        if (existingUserSnap.empty) {
            if (!password) {
                // This case is handled by the initial registration flow which sends a verification email.
                return res.status(400).json({ message: "User not found and no password provided for creation." });
            }
            // Prepare hash but don't create user yet.
            const bcrypt = await import('bcryptjs');
            passwordHash = await bcrypt.hash(password, 10);
        } else {
            const existingUser = snapshotToData<DBUser>(existingUserSnap.docs[0])!;
            userId = existingUser.id;
        }

        // Create a temporary session document to hold all data
        const sessionRef = paymentInitiationSessionsCollection.doc();
        const sessionId = sessionRef.id;

        const sessionData: Partial<DBPaymentInitiationSession> = {
            id: sessionId,
            userId: userId,
            organizationId, // Store organizationId if provided (for upgrades)
            planId: plan.id,
            academyId: plan.academyId,
            isForSingleUser: plan.isForSingleUser ?? false,
            name, email,
            company, address, city, zip, country,
            status: 'pending', // Initialize as pending
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // Conditionally add passwordHash only if it exists (for new users)
        if (passwordHash) {
            sessionData.passwordHash = passwordHash;
        }
        
        await sessionRef.set(sessionData as DBPaymentInitiationSession);
        logger.info(`Created payment initiation session ${sessionId} for user ${email}`);

        // Build URL for the payment simulator iframe
        const terminal = env.PAYMENT_SIMULATOR_TERMINAL;
        const baseUrl = `${env.PAYMENT_SIMULATOR_URL}/${terminal}/iframenew.php`;
        const appBaseUrl = env.FRONTEND_URL;

        const params = new URLSearchParams({
            sum: (plan.priceMonthly || 0).toFixed(2),
            currency: plan.currency === 'ILS' ? '1' : plan.currency === 'EUR' ? '978' : '2',
            company: company, email: email, address: address, city: city, zip: zip, country: country,
            contact: `${name} (Ref:${sessionId})`, // Pass session ID as reference
            success_url_address: `${appBaseUrl}/api/payments/callback/success`,
            fail_url_address: `${appBaseUrl}/checkout?error=payment_failed`,
            notify_url_address: `${appBaseUrl}/api/payments/notify`,
            recur_transaction: '4', recur_payments: '', lang: 'us',
        });

        const iframeUrl = `${baseUrl}?${params.toString()}`;
        
        if (checkoutSessionId) {
            await pendingCheckoutsCollection.doc(checkoutSessionId).delete();
            logger.info(`Cleared pending checkout session ${checkoutSessionId}.`);
        }

        res.json({ iframeUrl });

    } catch (error: any) {
        logger.error("Error initiating payment simulator:", error);
        res.status(500).json({ message: "Failed to initiate payment." });
    }
};

/**
 * Step 2: Server-to-Server Webhook (IPN)
 * The Simulator calls this to notify us of payment success. This creates the user/org.
 */
export const handlePaymentNotify = async (req: Request, res: Response) => {
    const body = req.body; 
    logger.info("Received Payment Notification (Webhook):", JSON.stringify(body));

    let payload = body;
    if (body.data && body.data.object) payload = body.data.object;
    const { Response: responseCode, contact } = payload;

    if (responseCode !== '000') {
        logger.warn(`Webhook: Payment failed or pending. Code: ${responseCode}`);
        return res.status(200).send('OK');
    }

    try {
        const parts = contact?.split('(Ref:');
        const sessionId = (parts && parts.length > 1) ? parts[1].replace(')', '').trim() : contact?.split('OID:')[1];
        
        if (!sessionId) {
            logger.error("Webhook: Could not parse Session ID from contact field.", { contact });
            return res.status(200).send('OK');
        }

        await activateSubscriptionFromSession(sessionId);
        logger.info(`Webhook: Processed activation for session ${sessionId}.`);
        res.status(200).send('OK');

    } catch (error: any) {
        if (error.message.includes('not found')) {
            logger.warn(`Webhook: Received notification for non-existent session.`, { message: error.message });
            return res.status(200).send('OK');
        }
        logger.error("Webhook: Error processing payment notification:", error);
        res.status(500).send('Error');
    }
};

/**
 * Step 3: Browser Callback (Redirect)
 * The Simulator iframe redirects the user here after success.
 */
export const handlePaymentCallback = async (req: Request, res: Response) => {
    const body = req.body;
    logger.info("Received Payment Callback (Browser Redirect):", JSON.stringify(body));

    let payload = body;
    if (body.data && body.data.object) payload = body.data.object;
    const { Response: responseCode, contact } = payload;

    const isSuccess = responseCode === '000';
    const frontendUrl = env.FRONTEND_URL;

    if (!isSuccess) {
        return res.redirect(`${frontendUrl}/checkout?error=payment_failed_code_${responseCode}`);
    }

    try {
        const parts = contact?.split('(Ref:');
        const sessionId = (parts && parts.length > 1) ? parts[1].replace(')', '').trim() : contact?.split('OID:')[1];
        
        if (!sessionId) {
            logger.error("Callback: Missing Session ID.");
            return res.redirect(`${frontendUrl}/checkout?error=invalid_reference`);
        }

        // Activate or retrieve existing activation
        const { user, orgId, memberships } = await activateSubscriptionFromSession(sessionId);
        
        const loginData = await generateFullLoginResponse(user, orgId, memberships, memberships[0].role);
        
        const loginSessionId = crypto.randomUUID();
        await paymentSessionsCollection.doc(loginSessionId).set({
            ...loginData,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Clean up the initiation session now that we have successfully handed off to the frontend login session
        // This is the final step of the lifecycle.
        await paymentInitiationSessionsCollection.doc(sessionId).delete();
        logger.info(`Callback: Deleted completed session ${sessionId} after successful handoff.`);
        
        return res.redirect(`${frontendUrl}/checkout/success?session_id=${loginSessionId}&payment_status=success`);

    } catch (e: any) {
        if (e.message.includes('not found')) {
            // This is now less likely to happen due to idempotency, unless document was manually deleted
            logger.warn(`Callback: Session document not found. Redirecting user to login.`, { message: e.message });
            return res.redirect(`${frontendUrl}/login?message=Payment%20successful!%20Please%20log%20in.`);
        }
        logger.error("Error in payment callback:", e);
        return res.redirect(`${frontendUrl}/checkout?error=callback_processing_error`);
    }
};

/**
 * Self-Subscribe: Allows an existing logged-in user to subscribe to a single-user plan.
 * Creates a payment session using the user's existing info and returns an iframe URL.
 */
export const selfSubscribe = async (req: Request, res: Response) => {
    const jwtUser = req.user as any;
    const { planId, company, address, city, zip, country } = req.body;

    if (!planId || !company || !address || !city || !zip || !country) {
        return res.status(400).json({ message: "Missing required fields. Please ensure all billing details are provided." });
    }

    try {
        // Validate plan
        const planDoc = await plansCollection.doc(planId).get();
        if (!planDoc.exists) {
            return res.status(404).json({ message: "Plan not found." });
        }
        const plan = snapshotToData<DBPlan>(planDoc)!;

        if (!plan.isForSingleUser) {
            return res.status(400).json({ message: "This plan is not available for individual subscriptions." });
        }

        if (plan.academyId !== jwtUser.academyId) {
            return res.status(400).json({ message: "This plan does not belong to your academy." });
        }

        // Check if user already has an active individual subscription (plan.maxUsers === 1) in this academy
        const userMembershipsSnap = await membershipsCollection
            .where('userId', '==', jwtUser.id)
            .where('academyId', '==', jwtUser.academyId)
            .where('entityType', '==', 'organization')
            .get();

        if (!userMembershipsSnap.empty) {
            const userOrgIds = userMembershipsSnap.docs.map(d => d.data().entityId as string);
            const CHUNK_SIZE = 30;
            for (let i = 0; i < userOrgIds.length; i += CHUNK_SIZE) {
                const chunk = userOrgIds.slice(i, i + CHUNK_SIZE);
                const orgsSnap = await organizationsCollection
                    .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                    .get();
                for (const doc of orgsSnap.docs) {
                    const org = snapshotToData<DBOrganization>(doc)!;
                    if ((org.subscriptionStatus === 'active' || org.subscriptionStatus === 'trialing') && org.planId) {
                        const planDoc = await plansCollection.doc(org.planId).get();
                        if (planDoc.exists && planDoc.data()?.maxUsers === 1) {
                            return res.status(409).json({ message: "You already have an active personal subscription in this academy." });
                        }
                    }
                }
            }
        }

        // Fetch user details for the payment session
        const userDoc = await usersCollection.doc(jwtUser.id).get();
        if (!userDoc.exists) {
            return res.status(404).json({ message: "User not found." });
        }
        const dbUser = snapshotToData<DBUser>(userDoc)!;

        // Create payment initiation session
        const sessionRef = paymentInitiationSessionsCollection.doc();
        const sessionId = sessionRef.id;

        const sessionData: Partial<DBPaymentInitiationSession> = {
            id: sessionId,
            userId: jwtUser.id,
            planId: plan.id,
            academyId: plan.academyId,
            isForSingleUser: true,
            name: dbUser.name,
            email: dbUser.email,
            company, address, city, zip, country,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await sessionRef.set(sessionData as DBPaymentInitiationSession);
        logger.info(`Created self-subscribe payment session ${sessionId} for user ${dbUser.email}`);

        // Build iframe URL
        const terminal = env.PAYMENT_SIMULATOR_TERMINAL;
        const baseUrl = `${env.PAYMENT_SIMULATOR_URL}/${terminal}/iframenew.php`;
        const appBaseUrl = env.FRONTEND_URL;

        const params = new URLSearchParams({
            sum: (plan.priceMonthly || 0).toFixed(2),
            currency: plan.currency === 'ILS' ? '1' : plan.currency === 'EUR' ? '978' : '2',
            company, email: dbUser.email, address, city, zip, country,
            contact: `${dbUser.name} (Ref:${sessionId})`,
            success_url_address: `${appBaseUrl}/api/payments/callback/success`,
            fail_url_address: `${appBaseUrl}/self-subscribe?error=payment_failed`,
            notify_url_address: `${appBaseUrl}/api/payments/notify`,
            recur_transaction: '4', recur_payments: '', lang: 'us',
        });

        const iframeUrl = `${baseUrl}?${params.toString()}`;
        res.json({ iframeUrl });

    } catch (error: any) {
        logger.error("Error initiating self-subscribe payment:", error);
        res.status(500).json({ message: "Failed to initiate payment." });
    }
};

// --- REPORTING FUNCTIONS ---
export const getAcademyPayouts = async (req: Request, res: Response) => {
    try {
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc);
        if (!settings) return res.status(500).json({ message: "System settings not configured." });
        
        const costPro = settings.costPer1000TokensPro || 0;
        const costFlash = settings.costPer1000TokensFlash || 0;

        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

        const academiesSnapshot = await academiesCollection.get();
        const academies = querySnapshotToArray<DBAcademy>(academiesSnapshot);
        const payoutData = [];

        for (const academy of academies) {
            const orgsSnapshot = await organizationsCollection
                .where('academyId', '==', academy.id)
                .where('subscriptionProvider', '==', 'gymind')
                .get();
            
            const gymindOrgs = querySnapshotToArray<DBOrganization>(orgsSnapshot);
            const gymindOrgIds = gymindOrgs.map((org: DBOrganization) => org.id);

            let totalRevenue = 0;
            let activeGymindOrgs = 0;

            if (gymindOrgs.length > 0) {
                const planIds = [...new Set(gymindOrgs.map((o: DBOrganization) => o.planId).filter(Boolean))];
                if (planIds.length > 0) {
                    const plansSnapshot = await plansCollection.where(admin.firestore.FieldPath.documentId(), 'in', planIds).get();
                    const plansMap = new Map(querySnapshotToArray<DBPlan>(plansSnapshot).map((p: DBPlan) => [p.id, p]));

                    for (const org of gymindOrgs) {
                        if (org.planId) {
                            const plan = plansMap.get(org.planId);
                            if (plan && plan.priceMonthly && (org.subscriptionStatus === 'active' || org.subscriptionStatus === 'trialing')) {
                                totalRevenue += plan.priceMonthly;
                                activeGymindOrgs++;
                            }
                        }
                    }
                }
            }

            let totalTokenCost = 0;
            if (gymindOrgIds.length > 0) {
                const CHUNK_SIZE = 30;
                for (let i = 0; i < gymindOrgIds.length; i += CHUNK_SIZE) {
                    const chunk = gymindOrgIds.slice(i, i + CHUNK_SIZE);
                    const usageSnapshot = await tokenUsageCollection
                        .where('organizationId', 'in', chunk)
                        .where('createdAt', '>=', startOfMonth)
                        .where('createdAt', '<=', endOfMonth)
                        .get();
                    
                    usageSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
                        const data = doc.data() as DBTokenUsage;
                        const tokens = data.totalTokens;
                        const isPro = data.model.includes('pro');
                        const costRate = isPro ? costPro : costFlash;
                        totalTokenCost += (tokens / 1000) * costRate;
                    });
                }
            }

            if (totalRevenue > 0 || totalTokenCost > 0) {
                payoutData.push({
                    academyId: academy.id,
                    academyName: academy.name,
                    activeGymindOrgs,
                    totalRevenue,
                    totalTokenCost,
                    netPayout: totalRevenue - totalTokenCost,
                    currency: 'USD'
                });
            }
        }

        res.json(payoutData);

    } catch (error) {
        logger.error("Error calculating academy payouts:", error);
        res.status(500).json({ message: "Failed to calculate payouts." });
    }
};
