
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';
import crypto from 'crypto';
import jwksClient from 'jwks-rsa';
import { db } from '../services/firestore.service.js';
import { Buffer } from 'node:buffer';
import { OAuth2Client } from 'google-auth-library';
import { URL } from 'url';
import { 
    usersCollection, 
    organizationsCollection,
    preapprovedUsersCollection,
    academiesCollection,
    userQuestionnaireResultsCollection,
    plansCollection,
    membershipsCollection,
    pendingCheckoutsCollection,
    paymentSessionsCollection,
    academyBillingCyclesCollection
} from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { env } from '../config/env.js';
import { DBUser, DBOrganization, JwtUserPayload, DBPreapprovedUser, JwtVerificationPayload, JwtMultiOrgPayload, UserRole, DBAcademy, JwtPasswordResetPayload, DBPlan, DBMembership, DBPendingCheckout, DBAcademyBillingCycle } from '../types/index.js';
import { sendAccountVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { validatePasswordComplexity } from '../utils/password.js';
import { enrollUserInTriggerCampaigns } from '../services/trigger.service.js';

const isProduction = process.env.NODE_ENV === 'production' || env.FRONTEND_URL.startsWith('https');

const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'lax' as const,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours — matches JWT expiry
};

const PARTIAL_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'lax' as const,
    path: '/',
    maxAge: 5 * 60 * 1000, // 5 minutes — matches partial JWT expiry
};

const setAuthCookie = (res: import('express').Response, token: string) => {
    // '__session' is the only cookie Firebase Hosting forwards to Cloud Functions.
    // All other cookie names are stripped from incoming requests by the CDN.
    res.cookie('__session', token, AUTH_COOKIE_OPTIONS);
};

const setPartialAuthCookie = (res: import('express').Response, token: string) => {
    res.cookie('partialAuthToken', token, PARTIAL_COOKIE_OPTIONS);
};

const clearAuthCookies = (res: import('express').Response) => {
    res.clearCookie('__session', { path: '/' });
    res.clearCookie('partialAuthToken', { path: '/' });
};

async function checkOrganizationUserLimit(organizationId: string): Promise<{ limitExceeded: boolean; message: string }> {
    const orgDoc = await organizationsCollection.doc(organizationId).get();
    if (!orgDoc.exists) {
        return { limitExceeded: false, message: '' }; // Let other logic handle "org not found"
    }
    const orgData = orgDoc.data() as DBOrganization;
    if (orgData.planId) {
        const planDoc = await plansCollection.doc(orgData.planId).get();
        if (planDoc.exists) {
            const plan = snapshotToData<DBPlan>(planDoc)!;
            // A plan with maxUsers=0 or null/undefined is considered unlimited
            if (plan.maxUsers && plan.maxUsers > 0) {
                const currentUsersSnapshot = await membershipsCollection
                    .where('entityId', '==', organizationId)
                    .where('entityType', '==', 'organization')
                    .where('role', '==', UserRole.REGULAR_USER)
                    .get();
                
                if (currentUsersSnapshot.size >= plan.maxUsers) {
                    return { limitExceeded: true, message: 'This organization has reached its maximum user limit. Please contact your administrator.' };
                }
            }
        }
    }
    return { limitExceeded: false, message: '' };
}

// Derives the user's highest possible role from their memberships.
export const deriveHighestRole = (memberships: DBMembership[]): UserRole => {
    let highestRole = UserRole.REGULAR_USER;
    let hasRegular = false, hasOrgAdmin = false, hasAcademyAdmin = false, hasSystemAdmin = false;

    for (const membership of memberships) {
        if (membership.role === UserRole.SYSTEM_ADMIN) hasSystemAdmin = true;
        if (membership.role === UserRole.ACADEMY_ADMIN) hasAcademyAdmin = true;
        if (membership.role === UserRole.ORGANIZATION_ADMIN) hasOrgAdmin = true;
        if (membership.role === UserRole.REGULAR_USER) hasRegular = true;
    }

    if (hasSystemAdmin) highestRole = UserRole.SYSTEM_ADMIN;
    else if (hasAcademyAdmin) highestRole = UserRole.ACADEMY_ADMIN;
    else if (hasOrgAdmin) highestRole = UserRole.ORGANIZATION_ADMIN;
    else if (hasRegular) highestRole = UserRole.REGULAR_USER;
    
    return highestRole;
};

export const formatUserForFrontend = async (
    user: DBUser,
    context?: { academyId?: string; organizationId?: string; role?: UserRole }
): Promise<any> => {
    const { passwordHash, passwordResetId, failedLoginAttempts, lockoutUntil, ...rest } = user;
    
    const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
    const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
    
    const dbRoles = {
        systemAdmin: memberships.some(m => m.role === UserRole.SYSTEM_ADMIN),
        academyAdmin: [...new Set(memberships.filter(m => m.role === UserRole.ACADEMY_ADMIN).map(m => m.entityId))],
        organizationAdmin: [...new Set(memberships.filter(m => m.role === UserRole.ORGANIZATION_ADMIN).map(m => m.entityId))],
    };
    
    const organizationIdsFromMemberships = [...new Set(memberships.filter(m => m.entityType === 'organization').map(m => m.entityId))];
    let allRelevantOrgIds = [...organizationIdsFromMemberships];

    // If the user is an academy admin and has NO organization memberships, they need a representative org from their academy to log in.
    if (dbRoles.academyAdmin.length > 0 && allRelevantOrgIds.length === 0) {
        // Fetch orgs for all admin academies in one query instead of N+1
        const adminAcademyIds = dbRoles.academyAdmin;
        const repOrgPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < adminAcademyIds.length; i += 30) {
            repOrgPromises.push(organizationsCollection.where('academyId', 'in', adminAcademyIds.slice(i, i + 30)).get());
        }
        const repOrgSnapshots = await Promise.all(repOrgPromises);
        const allRepOrgs = repOrgSnapshots.flatMap(snap => querySnapshotToArray<DBOrganization>(snap));
        // Pick one org per academy
        const seenAcademies = new Set<string>();
        for (const org of allRepOrgs) {
            if (!seenAcademies.has(org.academyId)) {
                seenAcademies.add(org.academyId);
                allRelevantOrgIds.push(org.id);
            }
        }
    }
    // De-duplicate the final list
    allRelevantOrgIds = [...new Set(allRelevantOrgIds)];

    const userForFrontend: any = { 
        ...rest,
        role: context?.role || deriveHighestRole(memberships),
        hasPassword: !!passwordHash,
        dbRoles,
    };
    
    let userOrgs: (Pick<DBOrganization, 'id' | 'name' | 'academyId' | 'isPersonal'> & { academyName?: string })[] = [];

    if (dbRoles.systemAdmin && !context) {
        logger.info(`Formatting user ${user.id} as System Admin, fetching all academies and a representative org for each.`);
        const allAcademiesSnapshot = await academiesCollection.orderBy('name').get();
        const academies = querySnapshotToArray<DBAcademy>(allAcademiesSnapshot);
        userForFrontend.allAcademies = academies;

        if (academies.length > 0) {
            // Fetch all orgs in one query instead of N+1 per-academy queries, then pick one per academy
            const allOrgsSnapshot = await organizationsCollection.get();
            const allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot);
            const seenAcademyIds = new Set<string>();
            userOrgs = allOrgs
                .filter(o => {
                    if (seenAcademyIds.has(o.academyId)) return false;
                    seenAcademyIds.add(o.academyId);
                    return true;
                })
                .map(o => ({ id: o.id, name: o.name, academyId: o.academyId, isPersonal: o.isPersonal }));
        }
    } else if (allRelevantOrgIds.length > 0) {
        const orgFetchPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < allRelevantOrgIds.length; i += 30) {
            orgFetchPromises.push(organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', allRelevantOrgIds.slice(i, i + 30)).get());
        }
        const orgFetchSnapshots = await Promise.all(orgFetchPromises);
        let allUserOrgs = orgFetchSnapshots.flatMap(snap => querySnapshotToArray<DBOrganization>(snap)).map(o => ({ id: o.id, name: o.name, academyId: o.academyId, isPersonal: o.isPersonal }));

        if (context?.academyId) {
            userOrgs = allUserOrgs.filter(org => org.academyId === context.academyId);
        } else if (context?.organizationId) {
            userOrgs = allUserOrgs.filter(org => org.id === context.organizationId);
        } else {
            userOrgs = allUserOrgs;
        }
    }

    if (userOrgs.length > 0) {
        const academyIds = [...new Set(userOrgs.map(org => org.academyId))];
        if (academyIds.length > 0) {
            const academyFetchPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
            for (let i = 0; i < academyIds.length; i += 30) {
                academyFetchPromises.push(academiesCollection.where(admin.firestore.FieldPath.documentId(), 'in', academyIds.slice(i, i + 30)).get());
            }
            const academyFetchSnapshots = await Promise.all(academyFetchPromises);
            const academiesData = academyFetchSnapshots.flatMap(snap => querySnapshotToArray<DBAcademy>(snap));
            const academyMap = new Map(academiesData.map(a => [a.id, a.name]));
            userOrgs.forEach((org => {
                org.academyName = academyMap.get(org.academyId) || 'Unknown Academy';
            }));
        }
    }
    userForFrontend.organizations = userOrgs;
    
    const resultsSnapshot = await userQuestionnaireResultsCollection.where('userId', '==', user.id).get();
    userForFrontend.completedQuestionnairesCount = resultsSnapshot.empty ? 0 : new Set(resultsSnapshot.docs.map(doc => doc.data().questionnaireId)).size;

    const academyAdminAcademyIds = new Set(memberships.filter(m => m.entityType === 'academy' && m.role === UserRole.ACADEMY_ADMIN).map(m => m.entityId));
    const visibleOrgs = userOrgs.filter(o => !(o.isPersonal && academyAdminAcademyIds.has(o.academyId)));

    if (visibleOrgs.length === 1) {
        userForFrontend.organizationId = visibleOrgs[0].id;
        userForFrontend.organizationName = visibleOrgs[0].name;
    } else if (visibleOrgs.length > 1) {
        userForFrontend.organizationName = 'Multiple Organizations';
        delete userForFrontend.organizationId;
    } else {
        userForFrontend.organizationName = 'N/A';
        delete userForFrontend.organizationId;
    }
    
    return userForFrontend;
};

export const generateFullLoginResponse = async (user: DBUser, selectedOrganizationId: string, memberships: DBMembership[], sessionRole?: UserRole) => {
    const orgDoc = await organizationsCollection.doc(selectedOrganizationId).get();
    if (!orgDoc.exists) {
        throw new Error(`Organization ${selectedOrganizationId} not found for user ${user.id}`);
    }
    const selectedOrganization = snapshotToData<DBOrganization>(orgDoc)!;
    const academyId = selectedOrganization.academyId;
    
    const effectiveRole = sessionRole || deriveHighestRole(memberships);
    if (!effectiveRole) {
        throw new Error(`Could not determine a valid role for user ${user.id}.`);
    }

    const tokenPayload: JwtUserPayload = { 
        id: user.id, 
        role: effectiveRole, 
        selectedOrganizationId: selectedOrganization.id, 
        academyId: academyId
    };
    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '24h' });

    const userForFrontend = await formatUserForFrontend(user, { role: effectiveRole });

    let planAccess = {
        hasChatAccess: false,
        hasMindPatternsAccess: false,
    };

    // --- BILLING LIMIT CHECK ---
    // We check the overall Academy billing cycle. If the limit is reached, we disable AI features for EVERYONE including admins.
    const now = new Date();
    const cycleId = `${academyId}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const cycleDoc = await academyBillingCyclesCollection.doc(cycleId).get();
    let isBillingLimitReached = false;

    if (cycleDoc.exists) {
        const cycle = snapshotToData<DBAcademyBillingCycle>(cycleDoc)!;
        if (cycle.currentTokenUsage >= cycle.calculatedTokenLimit) {
            logger.warn(`Academy ${academyId} has reached its token limit. Disabling AI features for login context.`);
            isBillingLimitReached = true;
        }
    }

    // Admins have feature access by default, but still gated by the overall Academy billing limit.
    if (effectiveRole === UserRole.ACADEMY_ADMIN || effectiveRole === UserRole.SYSTEM_ADMIN) {
        planAccess = {
            hasChatAccess: !isBillingLimitReached,
            hasMindPatternsAccess: !isBillingLimitReached,
        };
    } else if (selectedOrganization.planId && !isBillingLimitReached) {
        const planDoc = await plansCollection.doc(selectedOrganization.planId).get();
        if (planDoc.exists) {
            const plan = snapshotToData<DBPlan>(planDoc)!;
            const hasAnyChatAccess = (plan.hasAllChatAccess !== false) || ((plan.accessibleChatPersonaIds || []).length > 0);
            const hasAnyQuestionnaireAccess = (plan.hasAllQuestionnairesAccess !== false) || ((plan.accessibleQuestionnaireIds || []).length > 0);
            planAccess = {
                hasChatAccess: hasAnyChatAccess,
                hasMindPatternsAccess: hasAnyQuestionnaireAccess,
            };
        }
    }


    // Gate AI features on org subscription status for non-admin roles.
    // If the org's subscription is not active/trialing, override plan access to false.
    const orgSubStatus = selectedOrganization.subscriptionStatus || 'active';
    const isOrgSubscriptionActive = orgSubStatus === 'active' || orgSubStatus === 'trialing';
    if (!isOrgSubscriptionActive && effectiveRole !== UserRole.ACADEMY_ADMIN && effectiveRole !== UserRole.SYSTEM_ADMIN) {
        planAccess = { hasChatAccess: false, hasMindPatternsAccess: false };
    }

    // If billing limit reached, ensure everything is false regardless of individual org plan
    if (isBillingLimitReached) {
        planAccess = { hasChatAccess: false, hasMindPatternsAccess: false };
    }

    return {
        accessToken,
        user: userForFrontend,
        selectedOrganization: {
            id: selectedOrganization.id,
            name: selectedOrganization.name,
            academyId: selectedOrganization.academyId,
            subscriptionProvider: selectedOrganization.subscriptionProvider,
            subscriptionStatus: selectedOrganization.subscriptionStatus,
            isPersonal: selectedOrganization.isPersonal,
            ...planAccess,
        },
    };
};

const handleMultiOrgOrContextLogin = async (
    user: DBUser,
    res: Response,
    existingPartialToken?: string,
    userObjectForFrontend?: any
) => {
    const userForFrontend = userObjectForFrontend || await formatUserForFrontend(user);

    const partialToken = existingPartialToken || jwt.sign(
        { id: user.id, action: 'select-organization' } as JwtMultiOrgPayload,
        env.JWT_SECRET,
        { expiresIn: '5m' }
    );

    // Set partial token as httpOnly cookie
    setPartialAuthCookie(res, partialToken);

    return res.json({
        multiContext: true,
        user: userForFrontend,
        partialToken: partialToken,
    });
};

const calculateAvailableContexts = async (user: any): Promise<{ role: UserRole, organizationId: string }[]> => {
    if (!user.organizations || !user.dbRoles) {
        return [];
    }

    const { systemAdmin, academyAdmin = [], organizationAdmin = [] } = user.dbRoles;
    const contexts: { role: UserRole, organizationId: string }[] = [];
    const addedContexts = new Set<string>(); // "role|orgId"

    if (systemAdmin) {
        if (user.organizations.length > 0) {
            const defaultOrg = user.organizations.find((o:any) => o.name === 'Default Organization' || o.id === 'default_org') || user.organizations[0];
            const contextKey = `${UserRole.SYSTEM_ADMIN}|${defaultOrg.id}`;
            if (!addedContexts.has(contextKey)) {
                contexts.push({ role: UserRole.SYSTEM_ADMIN, organizationId: defaultOrg.id });
                addedContexts.add(contextKey);
            }
        }
        
        const allAcademiesSnapshot = await academiesCollection.get();
        const allAcademies = querySnapshotToArray<DBAcademy>(allAcademiesSnapshot);

        // Fetch all orgs in one query instead of N+1 per-academy queries
        const allOrgsSnapshot = await organizationsCollection.get();
        const allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot);

        // Build a map of academyId → first org ID
        const firstOrgByAcademy = new Map<string, string>();
        for (const org of allOrgs) {
            if (!firstOrgByAcademy.has(org.academyId)) {
                firstOrgByAcademy.set(org.academyId, org.id);
            }
        }

        for (const academy of allAcademies) {
            const orgId = firstOrgByAcademy.get(academy.id);
            if (orgId) {
                const contextKey = `${UserRole.ACADEMY_ADMIN}|${orgId}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.ACADEMY_ADMIN, organizationId: orgId });
                    addedContexts.add(contextKey);
                }
            } else {
                logger.warn(`Academy '${academy.name}' (${academy.id}) has no organizations. Cannot create an Academy Admin context for it.`);
            }
        }
    } else {
        academyAdmin.forEach((academyId: string) => {
            // Academy Admin context is ONLY available for organizations the user is EXPLICITLY a member of in that academy.
            // This prevents them from assuming AA role for organizations they are not part of.
            const userOrgsInAcademy = user.organizations.filter((o: any) => o.academyId === academyId && o.name !== 'Default Organization');
            userOrgsInAcademy.forEach((org: any) => {
                const contextKey = `${UserRole.ACADEMY_ADMIN}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.ACADEMY_ADMIN, organizationId: org.id });
                    addedContexts.add(contextKey);
                }
            });
        });

        organizationAdmin.forEach((orgId: string) => {
            const org = user.organizations.find((o: any) => o.id === orgId && o.name !== 'Default Organization');
            const isCoveredByAcademyAdmin = academyAdmin.includes(org?.academyId || '');
            if (org && !isCoveredByAcademyAdmin) {
                const contextKey = `${UserRole.ORGANIZATION_ADMIN}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.ORGANIZATION_ADMIN, organizationId: org.id });
                    addedContexts.add(contextKey);
                }
            }
        });

        user.organizations.forEach((org: any) => {
            if (org.name === 'Default Organization') return;

            const isAcademyAdminForThisOrg = academyAdmin.includes(org.academyId);
            const isOrgManagerForThisOrg = organizationAdmin.includes(org.id);

            if (!isAcademyAdminForThisOrg && !isOrgManagerForThisOrg) {
                const contextKey = `${UserRole.REGULAR_USER}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.REGULAR_USER, organizationId: org.id });
                    addedContexts.add(contextKey);
                }
            }
        });
    }

    // Special case: If after all checks, no contexts are found, check if the user's ONLY organization
    // is the "Default Organization". If so, grant them a limited login context.
    if (contexts.length === 0 && user.organizations.length === 1 && user.organizations[0].name === 'Default Organization') {
        logger.info(`User ${user.id} has no active contexts, but is a regular user in Default Organization. Granting limited login context.`);
        contexts.push({ role: UserRole.REGULAR_USER, organizationId: user.organizations[0].id });
    }

    return contexts;
};

export const register = async (req: Request, res: Response) => {
    const { password, planId } = req.body;
    const email = sanitizeText(req.body.email);
    const name = sanitizeText(req.body.name);

    if (!email || !password || !name) {
        return res.status(400).json({ message: 'Email, password, and name are required.' });
    }

    const passwordError = validatePasswordComplexity(password);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }

    try {
        const userQuery = await usersCollection.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
            const existingUser = snapshotToData<DBUser>(userQuery.docs[0])!;
            if (existingUser.status === 'active' && !existingUser.passwordHash) {
                const passwordHash = await bcrypt.hash(password, 10);
                await usersCollection.doc(existingUser.id).update({ passwordHash, name });
                return res.status(200).json({
                    success: true,
                    message: "Password created successfully. You can now log in."
                });
            }

            if (existingUser.status === 'pending') {
                 return res.status(400).json({ message: 'This email is already registered and pending verification. Please check your inbox.' });
            }
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        let organizationId = '';
        let academyId = '';

        if (planId) {
            // --- Checkout Flow: Validate Plan ---
            const planDoc = await plansCollection.doc(planId).get();
            if (!planDoc.exists) {
                return res.status(404).json({ message: 'Invalid plan selected.' });
            }
            const plan = snapshotToData<DBPlan>(planDoc)!;
            academyId = plan.academyId;
            // Note: We do not set organizationId here as it's created after payment
        } else {
            // --- Standard Organization Pre-approved Flow ---
            const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
            if (preapprovedQuery.empty) {
                logger.warn(`Registration attempt by non-pre-approved email: ${email}`);
                return res.status(403).json({ message: 'You are not authorized to register. Please contact your organization manager.' });
            }
            
            const preapprovedData = snapshotToData<DBPreapprovedUser>(preapprovedQuery.docs[0])!;
            organizationId = preapprovedData.organizationId;
            
            // Check user limit
            const limitCheck = await checkOrganizationUserLimit(organizationId);
            if (limitCheck.limitExceeded) {
                return res.status(403).json({ message: limitCheck.message });
            }
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRef = usersCollection.doc();
        const newUser: Omit<DBUser, 'createdAt' | 'googleId'> = {
            id: newUserRef.id, email, name, passwordHash, 
            status: 'pending',
            profileImageUrl: '/default_user.webp', 
            hasSeenChatPrivacyNotice: false,
            registrationType: planId ? 'payment' : 'standard'
        };

        const batch = db.batch();
        batch.set(newUserRef, { ...newUser, createdAt: new Date() });

        // Only create membership immediately if NOT a checkout flow
        if (!planId && organizationId) {
            // Look up academyId from the org if not already set
            if (!academyId) {
                const orgDoc = await organizationsCollection.doc(organizationId).get();
                if (orgDoc.exists) academyId = orgDoc.data()?.academyId || '';
            }
            const newMembershipRef = membershipsCollection.doc();
            const newMembership: Omit<DBMembership, 'createdAt'> = {
                id: newMembershipRef.id,
                userId: newUser.id,
                entityId: organizationId,
                entityType: 'organization',
                role: UserRole.REGULAR_USER,
                academyId,
            };
            batch.set(newMembershipRef, { ...newMembership, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }

        await batch.commit();

        const verificationTokenPayload: JwtVerificationPayload = { 
            userId: newUser.id, 
            action: 'verify_email',
            planId: planId // Optional planId for checkout redirect
        };
        const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
        
        let academyName = 'Gymind';
        if (organizationId && !academyId) {
            const orgDoc = await organizationsCollection.doc(organizationId).get();
            academyId = orgDoc.exists ? orgDoc.data()?.academyId : '';
        }
        
        if (academyId) {
            const academyDoc = await academiesCollection.doc(academyId).get();
            academyName = academyDoc.exists ? (academyDoc.data()?.name || 'Gymind') : 'Gymind';
        }

        await sendAccountVerificationEmail(email, name, verificationLink, academyName);

        return res.status(201).json({ 
            success: true, 
            message: `Registration successful! An email has been sent to ${email}. Please click the link inside to verify your account.`
        });

    } catch (error) {
        logger.error("Registration error:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

export const initiateCheckoutRegistration = async (req: Request, res: Response) => {
    const { name, email, password, planId, academyId, company, address, city, zip, country } = req.body;
    if (!name || !email || !password || !planId || !academyId || !company || !address || !city || !zip || !country) {
        return res.status(400).json({ message: 'All form fields are required.' });
    }

    try {
        const userQuery = await usersCollection.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
            return res.status(400).json({ message: 'A user with this email address already exists. Please log in first.' });
        }
        
        const planDoc = await plansCollection.doc(planId).get();
        if (!planDoc.exists || planDoc.data()?.academyId !== academyId) {
            return res.status(404).json({ message: 'Plan not found or not available in this academy.' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRef = usersCollection.doc();
        const newUser: Omit<DBUser, 'createdAt' | 'googleId'> = {
            id: newUserRef.id, email: sanitizeText(email), name: sanitizeText(name), passwordHash,
            status: 'pending', profileImageUrl: '/default_user.webp',
            registrationType: 'payment'
        };
        
        // Store form data temporarily for retrieval after verification
        const checkoutSessionRef = pendingCheckoutsCollection.doc();
        const checkoutData: DBPendingCheckout = {
            id: checkoutSessionRef.id, name, email, password, company, address, city, zip, country, planId, academyId
        };

        const batch = db.batch();
        batch.set(newUserRef, { ...newUser, createdAt: new Date() });
        batch.set(checkoutSessionRef, checkoutData);
        await batch.commit();

        const verificationTokenPayload: JwtVerificationPayload = { 
            userId: newUser.id, 
            action: 'verify_email',
            planId: planId,
            checkoutSessionId: checkoutSessionRef.id // Include session ID in token
        };
        const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
        
        const academyDoc = await academiesCollection.doc(academyId).get();
        const academyName = academyDoc.exists ? (academyDoc.data()?.name || 'Gymind') : 'Gymind';

        await sendAccountVerificationEmail(email, name, verificationLink, academyName);
        
        res.status(201).json({ 
            success: true, 
            message: `Account created. Please check your email to verify your address and continue to payment.` 
        });
        
    } catch (error) {
        logger.error("Error during initiateCheckoutRegistration:", error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
};


export const registerAcademyAdmin = async (req: Request, res: Response) => {
    const { email, password, name, planId } = req.body;

    if (!email || !password || !name || !planId) {
        return res.status(400).json({ message: 'Email, password, name, and planId are required.' });
    }

    if (planId !== 'academy_pay_as_you_go') {
        return res.status(400).json({ message: 'Invalid planId.' });
    }

    try {
        const userQuery = await usersCollection.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRef = usersCollection.doc();
        const newUser: Omit<DBUser, 'createdAt' | 'googleId'> = {
            id: newUserRef.id,
            email: sanitizeText(email),
            name: sanitizeText(name),
            passwordHash,
            status: 'pending', // Change status to 'pending' for verification
            profileImageUrl: '/default_user.webp',
            hasSeenChatPrivacyNotice: false,
            registrationType: 'standard'
        };
        await newUserRef.set({ ...newUser, createdAt: new Date() });

        const verificationTokenPayload: JwtVerificationPayload = { userId: newUser.id, action: 'verify_academy_admin' };
        const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
        
        // Since the academy isn't created yet, we use a generic name.
        await sendAccountVerificationEmail(email, name, verificationLink, "Your New Academy");

        res.status(201).json({
            success: true,
            message: `Registration successful! An email has been sent to ${email}. Please click the link inside to verify your account and begin setup.`
        });

    } catch (error) {
        logger.error("Academy admin registration error:", error);
        res.status(500).json({ message: 'Server error during academy admin registration.' });
    }
};


export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const errorMessage = "Incorrect login details. Please check your email and password and try again.";
    try {
        const userQuery = await usersCollection.where('email', '==', email).limit(1).get();
        if (userQuery.empty) return res.status(401).json({ message: errorMessage });
        
        const user = snapshotToData<DBUser>(userQuery.docs[0])!;
        
        // Helper to safely get millis whether it's a Date or a Firestore Timestamp
        const getMillis = (ts: any) => {
            if (!ts) return 0;
            if (typeof ts.getTime === 'function') return ts.getTime(); // JS Date
            if (typeof ts.toMillis === 'function') return ts.toMillis(); // Firestore Timestamp
            return 0;
        };

        const lockoutTime = getMillis(user.lockoutUntil);
        if (lockoutTime > Date.now()) {
            const timeLeft = Math.ceil((lockoutTime - Date.now()) / 60000);
            return res.status(403).json({ message: `Your account is locked due to too many failed attempts. Please try again in ${timeLeft} minute${timeLeft > 1 ? 's' : ''}.` });
        }

        // Allow login if user is active OR if they are pending AND have verified email in payment flow
        const isPaymentPending = user.status === 'pending' && user.emailVerified && user.registrationType === 'payment';
        
        if (user.status === 'pending' && !isPaymentPending) {
             return res.status(403).json({ message: 'Your account is pending verification.' });
        }
        
        if (user.status === 'disabled') return res.status(403).json({ message: 'Your account has been disabled.' });

        if (!user.passwordHash) return res.status(401).json({ message: "You have not created an account yet. Please create an account on the registration page or sign in with Google." });
        
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        
        const userRef = userQuery.docs[0].ref;

        if (!validPassword) {
            const currentAttempts = user.failedLoginAttempts || 0;
            const newAttempts = currentAttempts + 1;
            const MAX_ATTEMPTS = 3;
            const LOCKOUT_MINUTES = 5;

            if (newAttempts >= MAX_ATTEMPTS) {
                const newLockoutTime = admin.firestore.Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
                await userRef.update({ failedLoginAttempts: newAttempts, lockoutUntil: newLockoutTime });
                return res.status(403).json({ message: `Too many failed login attempts. Your account is locked for ${LOCKOUT_MINUTES} minutes. Please try again later or use 'Forgot Password.'` });
            } else {
                await userRef.update({ failedLoginAttempts: newAttempts });
                const attemptsLeft = MAX_ATTEMPTS - newAttempts;
                return res.status(401).json({ message: `Incorrect login details. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} left, or use "Forgot Password."` });
            }
        }
        
        if (user.failedLoginAttempts || user.lockoutUntil) {
            await userRef.update({ failedLoginAttempts: 0, lockoutUntil: null });
        }
        
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        if (membershipsSnapshot.empty) {
            if (user.registrationType === 'payment') {
                // Allow login for payment flow users who don't have memberships yet (pending checkout)
                return handleMultiOrgOrContextLogin(user, res);
            }
            return res.status(403).json({ message: "Your account is not assigned to any organization. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (availableContexts.length > 1) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                logger.info(`System Admin multi-context login for ${user.email}. Fetching all organizations for context selection UI.`);
                const allOrgsSnapshot = await organizationsCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, academyId: o.academyId }));
                
                const academyIds = [...new Set(allOrgs.map(org => org.academyId))];
                if (academyIds.length > 0) {
                    const academiesSnapshot = await academiesCollection.where(admin.firestore.FieldPath.documentId(), 'in', academyIds).get();
                    const academiesData = querySnapshotToArray<DBAcademy>(academiesSnapshot);
                    const academyMap = new Map(academiesData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.academyName = academyMap.get(org.academyId) || 'Unknown Academy';
                    });
                }
                userForFrontend.organizations = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length === 1) {
            const { role, organizationId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, organizationId, memberships, role);
            setAuthCookie(res, response.accessToken);
            res.clearCookie('partialAuthToken', { path: '/' });
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any organization. Please contact an administrator." });
        }
    } catch (error) {
        logger.error("Login error:", error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    const { email } = req.body;
    const genericMessage = "If an account with that email exists, a password reset link has been sent.";

    try {
        const userQuery = await usersCollection.where('email', '==', email).limit(1).get();
        if (userQuery.empty) {
            logger.info(`Password reset requested for non-existent email: ${email}`);
            return res.status(200).json({ message: genericMessage });
        }
        const user = snapshotToData<DBUser>(userQuery.docs[0])!;
        if (!user.passwordHash) {
             logger.info(`Password reset requested for user ${email} who uses social login.`);
             return res.status(400).json({ message: "This account uses social sign-in and does not have a password to reset." });
        }
        const resetId = crypto.randomBytes(32).toString('hex');
        const tokenPayload: JwtPasswordResetPayload = { userId: user.id, resetId, action: 'reset_password' };
        const resetToken = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        
        await usersCollection.doc(user.id).update({ passwordResetId: resetId });
        const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        let academyName = 'Gymind';
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).limit(1).get();
        if (!membershipsSnapshot.empty) {
            const membership = snapshotToData<DBMembership>(membershipsSnapshot.docs[0])!;
            let academyId: string | undefined;
            if (membership.entityType === 'academy') {
                academyId = membership.entityId;
            } else {
                const orgDoc = await organizationsCollection.doc(membership.entityId).get();
                if (orgDoc.exists) academyId = orgDoc.data()?.academyId;
            }
            if(academyId) {
                const academyDoc = await academiesCollection.doc(academyId).get();
                if (academyDoc.exists) academyName = academyDoc.data()?.name || 'Gymind';
            }
        }
        await sendPasswordResetEmail(user.email, user.name, resetLink, academyName);
        return res.status(200).json({ message: genericMessage });
    } catch (error) {
        logger.error("Forgot password error:", error);
        res.status(200).json({ message: genericMessage });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'A valid token and new password are required.' });
    }

    const passwordError = validatePasswordComplexity(newPassword);
    if (passwordError) {
        return res.status(400).json({ message: passwordError });
    }
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPasswordResetPayload;
        if (decoded.action !== 'reset_password' || !decoded.userId || !decoded.resetId) {
            throw new Error('Invalid token type or payload.');
        }
        const userRef = usersCollection.doc(decoded.userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error('User not found.');
        const user = snapshotToData<DBUser>(userDoc)!;
        if (user.passwordResetId !== decoded.resetId) {
             throw new Error('This password reset link has already been used or is invalid.');
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await userRef.update({
            passwordHash: newPasswordHash,
            passwordResetId: admin.firestore.FieldValue.delete(),
        });
        res.status(200).json({ message: "Password has been successfully reset." });
    } catch (error: any) {
        logger.error('Password reset error:', error);
        let errorMessage = 'This password reset link is invalid or has expired. Please try again.';
        if (error.message.includes("already been used")) {
            errorMessage = error.message;
        }
        res.status(400).json({ message: errorMessage });
    }
};


export const selectContext = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    const { organizationId, role: requestedRole } = req.body as { organizationId: string, role: UserRole };

    try {
        const userDoc = await usersCollection.doc(partialToken.id).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;
        
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const orgDoc = await organizationsCollection.doc(organizationId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Organization not found." });
        const targetOrg = snapshotToData<DBOrganization>(orgDoc)!;
        const targetAcademyId = targetOrg.academyId;

        let canAssumeRole = false;
        if (requestedRole === UserRole.REGULAR_USER) {
            canAssumeRole = memberships.some(m => m.entityId === organizationId && m.role === UserRole.REGULAR_USER);
        } else if (requestedRole === UserRole.ORGANIZATION_ADMIN) {
            canAssumeRole = memberships.some(m => 
                (m.entityId === organizationId && m.role === UserRole.ORGANIZATION_ADMIN) ||
                (m.entityId === targetAcademyId && m.role === UserRole.ACADEMY_ADMIN) ||
                m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.ACADEMY_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === targetAcademyId && m.role === UserRole.ACADEMY_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.SYSTEM_ADMIN) {
            canAssumeRole = memberships.some(m => m.role === UserRole.SYSTEM_ADMIN);
        }

        if (!canAssumeRole) {
            return res.status(403).json({ message: `You do not have permission to assume the role '${requestedRole}' for this context.` });
        }

        const response = await generateFullLoginResponse(user, organizationId, memberships, requestedRole);
        setAuthCookie(res, response.accessToken);
        res.clearCookie('partialAuthToken', { path: '/' });
        res.json(response);
    } catch (error) {
        logger.error("Context selection error:", error);
        res.status(500).json({ message: "Failed to finalize login." });
    }
};

export const switchContext = async (req: Request, res: Response) => {
    const userPayload = req.user as JwtUserPayload;
    const { organizationId, role: requestedRole } = req.body as { organizationId: string, role: UserRole };
    
    try {
        const userDoc = await usersCollection.doc(userPayload.id).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;
        
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
        
        const orgDoc = await organizationsCollection.doc(organizationId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Organization not found." });
        const targetOrg = snapshotToData<DBOrganization>(orgDoc)!;
        const targetAcademyId = targetOrg.academyId;

        let canAssumeRole = false;
        if (requestedRole === UserRole.REGULAR_USER) {
            canAssumeRole = memberships.some(m => m.entityId === organizationId && m.role === UserRole.REGULAR_USER);
        } else if (requestedRole === UserRole.ORGANIZATION_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === organizationId && m.role === UserRole.ORGANIZATION_ADMIN) || (m.entityId === targetAcademyId && m.role === UserRole.ACADEMY_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.ACADEMY_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === targetAcademyId && m.role === UserRole.ACADEMY_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.SYSTEM_ADMIN) {
            canAssumeRole = memberships.some(m => m.role === UserRole.SYSTEM_ADMIN);
        }

        if (!canAssumeRole) {
            return res.status(403).json({ message: `You do not have permission to assume the role '${requestedRole}' for this context.` });
        }

        const response = await generateFullLoginResponse(user, organizationId, memberships, requestedRole);
        setAuthCookie(res, response.accessToken);
        res.json(response);
    } catch (error) {
        logger.error("Switch context error:", error);
        res.status(500).json({ message: "Failed to switch context." });
    }
};


export const verifyAccount = async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.redirect(`${env.FRONTEND_URL}/login?error_message=Invalid%20verification%20link.`);
    }
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtVerificationPayload;
        const userRef = usersCollection.doc(decoded.userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) throw new Error('User not found.');
        const user = snapshotToData<DBUser>(userDoc)!;

        if (decoded.action === 'verify_academy_admin') {
            if (user.status === 'active') return res.redirect(`${env.FRONTEND_URL}/login?message=Academy%20account%20already%20active.`);
            if (user.status !== 'pending' && user.status !== 'pending_setup') return res.redirect(`${env.FRONTEND_URL}/login?message=Account%20status%20is%20not%20pending.`);
            
            await userRef.update({ status: 'pending_setup' });
            const partialTokenPayload: JwtMultiOrgPayload = { id: user.id, action: 'academy-setup' };
            const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '1h' });
            setPartialAuthCookie(res, partialToken);
            return res.redirect(`${env.FRONTEND_URL}/auth/academy/callback?token=${partialToken}`);
        }

        if (decoded.action === 'verify_email') {
            // Check if user is in a payment registration flow.
            if (user.registrationType === 'payment') {
                logger.info(`User ${user.id} has registrationType='payment'.`);
                
                // Flow A: User filled full checkout form (has session data)
                if (decoded.checkoutSessionId) {
                    // Do NOT set status to active here. User must pay first.
                    // Just update emailVerified flag to allow future login attempts if they drop off.
                    await userRef.update({ emailVerified: true });

                    return res.redirect(`${env.FRONTEND_URL}/checkout?planId=${decoded.planId}&checkout_session=${decoded.checkoutSessionId}`);
                } 
                
                // Flow B: User registered via simple form with planId (no session data)
                if (decoded.planId) {
                    const batch = db.batch();
                    // Do NOT set status to active here. User must pay first.
                    // Mark email as verified.
                    batch.update(userRef, { emailVerified: true });
                    
                    const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', user.email.toLowerCase()).get();
                    if (!preapprovedQuery.empty) {
                        preapprovedQuery.docs.forEach(doc => batch.delete(doc.ref));
                    }
                    await batch.commit();

                    // Auto-login by generating a partial token (since they have no orgs yet)
                    const partialTokenPayload: JwtMultiOrgPayload = { id: user.id, action: 'select-organization' };
                    const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
                    
                    // Redirect to the frontend callback handler which processes the token and redirects to checkout
                    setPartialAuthCookie(res, partialToken);
                    return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}&planId=${decoded.planId}`);
                }
            }

            // Standard registration flow (non-payment)
            const batch = db.batch();
            // Standard users become active immediately upon verification
            batch.update(userRef, { status: 'active', emailVerified: true });
            
            const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', user.email.toLowerCase()).get();
            if (!preapprovedQuery.empty) {
                preapprovedQuery.docs.forEach(doc => batch.delete(doc.ref));
            }
            await batch.commit();

            // Send Welcome Email (Fire and forget)
            sendWelcomeEmail(user.email, user.name).catch(err => logger.error("Failed to send welcome email:", err));

            // Enroll in trigger campaigns (fire and forget)
            enrollUserInTriggerCampaigns(user.primaryAcademyId ?? '', user.id, user.email, 'registration')
                .catch(err => logger.error('Failed to enroll user in trigger campaigns:', err));

            if (!user.passwordHash) {
                return res.redirect(`${env.FRONTEND_URL}/register?account_verified=true&email=${encodeURIComponent(user.email)}`);
            }
            return res.redirect(`${env.FRONTEND_URL}/login?account_verified=true`);
        }
        
        throw new Error('Invalid token type.');
    } catch (error: any) {
        logger.error('Email verification error:', error);
        const message = 'This verification link is invalid or has expired. Please try registering again.';
        return res.redirect(`${env.FRONTEND_URL}/login?error_message=${encodeURIComponent(message)}`);
    }
};

export const googleCallback = async (req: Request, res: Response) => {
    const dbUser = req.user as DBUser;
    if (!dbUser) {
        return res.redirect(`${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=User%20not%20found`);
    }

    try {
        // --- CHECKOUT FLOW BYPASS START ---
        // Check state for planId, indicating a checkout registration flow
        let isCheckoutFlow = false;
        let planId = '';
        
        if (req.query.state) {
             try {
                const stateStr = Buffer.from(req.query.state as string, 'base64').toString();
                const state = JSON.parse(stateStr);
                if (state.planId) {
                    isCheckoutFlow = true;
                    planId = state.planId;
                }
            } catch (e) {}
        }
        
        // Fallback: Check if user document has 'payment' registration type
        if (!isCheckoutFlow && dbUser.registrationType === 'payment') {
             isCheckoutFlow = true;
             // We won't have planId here if it wasn't in state, but frontend localStorage handles redirection
        }

        if (isCheckoutFlow) {
            // For checkout flow, we allow the user to proceed without membership.
            // The frontend handles the redirection to checkout page based on localStorage.
            // We just need to give them a valid session token.
            const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-organization' };
            const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
            
            const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/google/callback`);
            redirectUrl.searchParams.append('token', partialToken);
            if (planId) {
                redirectUrl.searchParams.append('planId', planId);
            }
            setPartialAuthCookie(res, partialToken);
            return res.redirect(redirectUrl.toString());
        }
        // --- CHECKOUT FLOW BYPASS END ---


        const membershipsSnapshot = await membershipsCollection.where('userId', '==', dbUser.id).get();
        if (dbUser.status === 'active' && !membershipsSnapshot.empty) {
             const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-organization' };
             const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
             setPartialAuthCookie(res, partialToken);
             return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}`);
        }

        // Provisioned users (e.g. via WooCommerce) have pending status with existing memberships.
        // Google OAuth verifies the email, so activate them and allow login.
        if (dbUser.status === 'pending' && !membershipsSnapshot.empty) {
            await usersCollection.doc(dbUser.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
            const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-organization' };
            const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
            setPartialAuthCookie(res, partialToken);
            return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}`);
        }

        const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', dbUser.email.toLowerCase()).limit(1).get();
        if (preapprovedQuery.empty) {
            return res.redirect(`${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=Your%20email%20is%20not%20pre-approved.`);
        }

        const preapprovedData = snapshotToData<DBPreapprovedUser>(preapprovedQuery.docs[0])!;
        const organizationId = preapprovedData.organizationId;
        
        const limitCheck = await checkOrganizationUserLimit(organizationId);
        if (limitCheck.limitExceeded) {
            return res.redirect(`${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=${encodeURIComponent(limitCheck.message)}`);
        }

        const batch = db.batch();

        // Look up academyId from the org for denormalization
        const orgDoc = await organizationsCollection.doc(organizationId).get();
        const orgAcademyId = orgDoc.exists ? orgDoc.data()?.academyId || '' : '';

        const newMembershipRef = membershipsCollection.doc();
        batch.set(newMembershipRef, {
            id: newMembershipRef.id,
            userId: dbUser.id,
            entityId: organizationId,
            entityType: 'organization',
            role: UserRole.REGULAR_USER,
            academyId: orgAcademyId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        batch.update(usersCollection.doc(dbUser.id), { status: 'active', registrationType: 'standard', emailVerified: true });
        batch.delete(preapprovedQuery.docs[0].ref);
        await batch.commit();

        // Enroll in trigger campaigns (fire and forget)
        enrollUserInTriggerCampaigns(orgAcademyId, dbUser.id, dbUser.email, 'registration')
            .catch(err => logger.error('Failed to enroll user in trigger campaigns:', err));

        const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-organization' };
        const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
        setPartialAuthCookie(res, partialToken);
        return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}`);
    } catch (error) {
        logger.error(`Error during Google user activation for ${dbUser.email}:`, error);
        return res.redirect(`${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=An%20internal%20error%20occurred.`);
    }
};

export const getGoogleLoginFinalization = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    try {
        const userDoc = await usersCollection.doc(partialToken.id).get();
        if (!userDoc.exists) throw new Error("User not found during finalization.");
        
        const user = snapshotToData<DBUser>(userDoc)!;
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const tokenFromHeader = req.headers['authorization']?.split(' ')[1];
        const userForFrontend = await formatUserForFrontend(user);
        
        // --- CHECKOUT FLOW HANDLING ---
        // If the user has no memberships (new checkout user), return just the user object.
        // The frontend uses this to recognize the user is logged in but pending checkout.
        if (memberships.length === 0) {
             return handleMultiOrgOrContextLogin(user, res, tokenFromHeader, userForFrontend);
        }
        // -----------------------------

        const availableContexts = await calculateAvailableContexts(userForFrontend);
        
        if (availableContexts.length > 1) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                logger.info(`System Admin multi-context Google login for ${user.email}. Fetching all organizations for context selection UI.`);
                const allOrgsSnapshot = await organizationsCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, academyId: o.academyId }));
                const academyIds = [...new Set(allOrgs.map(org => org.academyId))];
                if (academyIds.length > 0) {
                    const academiesSnapshot = await academiesCollection.where(admin.firestore.FieldPath.documentId(), 'in', academyIds).get();
                    const academiesData = querySnapshotToArray<DBAcademy>(academiesSnapshot);
                    const academyMap = new Map(academiesData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.academyName = academyMap.get(org.academyId) || 'Unknown Academy';
                    });
                }
                userForFrontend.organizations = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, tokenFromHeader, userForFrontend);
        } else if (availableContexts.length === 1) {
            const { role, organizationId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, organizationId, memberships, role);
            setAuthCookie(res, response.accessToken);
            res.clearCookie('partialAuthToken', { path: '/' });
            return res.json(response);
        } else {
             logger.warn(`User ${user.id} logged in via Google but has no available contexts.`);
             return res.status(403).json({ message: "You do not have an active role in any organization. Please contact an administrator." });
        }
    } catch (error) {
        logger.error("Google finalization error:", error);
        res.status(500).json({ message: "Failed to finalize Google login." });
    }
};

// --- NATIVE GOOGLE LOGIN CONTROLLER ---
export const nativeGoogleLogin = async (req: Request, res: Response) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "ID token is required." });

    try {
        const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
        // Verify the ID token from the client
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: [env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID!, process.env.GOOGLE_ANDROID_CLIENT_ID!].filter(Boolean),
        });
        const payload = ticket.getPayload();
        
        if (!payload || !payload.email) {
            return res.status(400).json({ message: "Invalid Google token payload." });
        }

        const email = payload.email;
        const googleId = payload.sub;
        const name = payload.name || email.split('@')[0];
        const picture = payload.picture;

        // Check if user exists
        let userSnap = await usersCollection.where('googleId', '==', googleId).limit(1).get();
        
        // If not by ID, try by email
        if (userSnap.empty) {
            userSnap = await usersCollection.where('email', '==', email).limit(1).get();
            if (!userSnap.empty) {
                // Link existing account
                await userSnap.docs[0].ref.update({ googleId, profileImageUrl: picture });
            }
        }

        let user: DBUser;

        if (userSnap.empty) {
            // New user registration flow
            const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
            if (preapprovedSnap.empty) {
                return res.status(403).json({ message: "Your email is not pre-approved for registration." });
            }

            const preapprovedData = snapshotToData<DBPreapprovedUser>(preapprovedSnap.docs[0])!;
            const organizationId = preapprovedData.organizationId;
            
            const limitCheck = await checkOrganizationUserLimit(organizationId);
            if (limitCheck.limitExceeded) {
                return res.status(403).json({ message: limitCheck.message });
            }

            const newUserRef = usersCollection.doc();
            const newUserData: Omit<DBUser, 'createdAt' | 'passwordHash'> = {
                id: newUserRef.id,
                googleId: googleId,
                name: name,
                email: email,
                profileImageUrl: picture,
                status: 'active',
                emailVerified: true,
                hasSeenChatPrivacyNotice: false,
                registrationType: 'standard',
            };
            
            const batch = db.batch();
            batch.set(newUserRef, { 
                ...newUserData, 
                createdAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            
            // Look up academyId from the org for denormalization
            const orgDocForAcademy = await organizationsCollection.doc(organizationId).get();
            const orgAcademyId = orgDocForAcademy.exists ? orgDocForAcademy.data()?.academyId || '' : '';

            // Create membership
            const newMembershipRef = membershipsCollection.doc();
            batch.set(newMembershipRef, {
                id: newMembershipRef.id,
                userId: newUserRef.id,
                entityId: organizationId,
                entityType: 'organization',
                role: UserRole.REGULAR_USER,
                academyId: orgAcademyId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Remove preapproval
            batch.delete(preapprovedSnap.docs[0].ref);

            await batch.commit();

            // Enroll in trigger campaigns (fire and forget)
            enrollUserInTriggerCampaigns(orgAcademyId, newUserRef.id, email, 'registration')
                .catch(err => logger.error('Failed to enroll user in trigger campaigns:', err));

            const userDoc = await newUserRef.get();
            user = snapshotToData<DBUser>(userDoc)!;
        } else {
            // Existing user
            user = snapshotToData<DBUser>(userSnap.docs[0])!;
            if (user.status === 'disabled') return res.status(403).json({ message: 'Your account has been disabled.' });

            // Activate provisioned users (e.g. via WooCommerce) on Google OAuth login
            if (user.status === 'pending') {
                await usersCollection.doc(user.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
                user.status = 'active';
            }
        }

        // Process login (similar to standard login flow)
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        if (membershipsSnapshot.empty) {
            // NATIVE: If user has no memberships (e.g. created via checkout flow on web but logged in here), we can't really support checkout on native easily yet.
            return res.status(403).json({ message: "Your account is not assigned to any organization. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (availableContexts.length > 1) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                 const allOrgsSnapshot = await organizationsCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, academyId: o.academyId }));
                const academyIds = [...new Set(allOrgs.map(org => org.academyId))];
                if (academyIds.length > 0) {
                    const academiesSnapshot = await academiesCollection.where(admin.firestore.FieldPath.documentId(), 'in', academyIds).get();
                    const academiesData = querySnapshotToArray<DBAcademy>(academiesSnapshot);
                    const academyMap = new Map(academiesData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.academyName = academyMap.get(org.academyId) || 'Unknown Academy';
                    });
                }
                userForFrontend.organizations = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length === 1) {
            const { role, organizationId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, organizationId, memberships, role);
            setAuthCookie(res, response.accessToken);
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any organization." });
        }

    } catch (error: any) {
        logger.error("Native Google Login error:", error);
        res.status(500).json({ message: "Authentication failed." });
    }
};

// --- NATIVE MICROSOFT LOGIN CONTROLLER ---
export const nativeMicrosoftLogin = async (req: Request, res: Response) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "ID token is required." });

    try {
        const client = jwksClient({
            jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys'
        });

        function getKey(header: any, callback: any) {
            client.getSigningKey(header.kid, function(err, key) {
                if (err) {
                    callback(err);
                    return;
                }
                if (!key) {
                    callback(new Error("Signing key not found."));
                    return;
                }
                const signingKey = key.getPublicKey();
                callback(null, signingKey);
            });
        }

        const decodedToken: any = await new Promise((resolve, reject) => {
            jwt.verify(idToken, getKey, {
                audience: env.MICROSOFT_CLIENT_ID,
            }, (err, decoded) => {
                if (err) {
                    return reject(err);
                }
                resolve(decoded);
            });
        });

        if (!decodedToken.iss || !decodedToken.iss.startsWith('https://login.microsoftonline.com/')) {
            throw new Error('Invalid token issuer.');
        }

        if (!decodedToken || !decodedToken.email) {
            return res.status(400).json({ message: "Invalid Microsoft token payload. Email is missing." });
        }

        const email = decodedToken.email;
        const microsoftId = decodedToken.oid; // Object ID is the unique user identifier
        const name = decodedToken.name || email.split('@')[0];

        let userSnap = await usersCollection.where('microsoftId', '==', microsoftId).limit(1).get();

        if (userSnap.empty) {
            userSnap = await usersCollection.where('email', '==', email).limit(1).get();
            if (!userSnap.empty) {
                await userSnap.docs[0].ref.update({ microsoftId });
            }
        }

        let user: DBUser;

        if (userSnap.empty) {
            const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).limit(1).get();
            if (preapprovedSnap.empty) {
                return res.status(403).json({ message: "Your email is not pre-approved for registration." });
            }
            
            const preapprovedData = snapshotToData<DBPreapprovedUser>(preapprovedSnap.docs[0])!;
            const organizationId = preapprovedData.organizationId;

            const limitCheck = await checkOrganizationUserLimit(organizationId);
            if (limitCheck.limitExceeded) {
                return res.status(403).json({ message: limitCheck.message });
            }

            const newUserRef = usersCollection.doc();
            const newUserData: Omit<DBUser, 'createdAt' | 'passwordHash' | 'googleId'> = {
                id: newUserRef.id,
                microsoftId: microsoftId,
                name: name,
                email: email,
                status: 'active',
                emailVerified: true,
                hasSeenChatPrivacyNotice: false,
                registrationType: 'standard'
            };
            
            // Look up academyId from the org for denormalization
            const orgDocForAcademy = await organizationsCollection.doc(organizationId).get();
            const msOrgAcademyId = orgDocForAcademy.exists ? orgDocForAcademy.data()?.academyId || '' : '';

            const batch = db.batch();
            batch.set(newUserRef, { ...newUserData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

            const newMembershipRef = membershipsCollection.doc();
            batch.set(newMembershipRef, {
                id: newMembershipRef.id,
                userId: newUserRef.id,
                entityId: organizationId,
                entityType: 'organization',
                role: UserRole.REGULAR_USER,
                academyId: msOrgAcademyId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            batch.delete(preapprovedSnap.docs[0].ref);

            await batch.commit();

            // Enroll in trigger campaigns (fire and forget)
            enrollUserInTriggerCampaigns(msOrgAcademyId, newUserRef.id, email, 'registration')
                .catch(err => logger.error('Failed to enroll user in trigger campaigns:', err));

            const userDoc = await newUserRef.get();
            user = snapshotToData<DBUser>(userDoc)!;
        } else {
            user = snapshotToData<DBUser>(userSnap.docs[0])!;
            if (user.status === 'disabled') return res.status(403).json({ message: 'Your account has been disabled.' });

            // Activate provisioned users (e.g. via WooCommerce) on Microsoft OAuth login
            if (user.status === 'pending') {
                await usersCollection.doc(user.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
                user.status = 'active';
            }
        }

        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        if (membershipsSnapshot.empty) {
            return res.status(403).json({ message: "Your account is not assigned to any organization. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (availableContexts.length > 1) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                 const allOrgsSnapshot = await organizationsCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBOrganization>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, academyId: o.academyId }));
                const academyIds = [...new Set(allOrgs.map(org => org.academyId))];
                if (academyIds.length > 0) {
                    const academiesSnapshot = await academiesCollection.where(admin.firestore.FieldPath.documentId(), 'in', academyIds).get();
                    const academiesData = querySnapshotToArray<DBAcademy>(academiesSnapshot);
                    const academyMap = new Map(academiesData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.academyName = academyMap.get(org.academyId) || 'Unknown Academy';
                    });
                }
                userForFrontend.organizations = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length === 1) {
            const { role, organizationId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, organizationId, memberships, role);
            setAuthCookie(res, response.accessToken);
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any organization." });
        }
    } catch (error: any) {
        logger.error("Native Microsoft Login error:", error);
        res.status(500).json({ message: error.message || "Authentication failed." });
    }
};

export const finalizeAcademySetup = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    try {
        const userDoc = await usersCollection.doc(partialToken.id).get();
        if (!userDoc.exists) throw new Error("User not found during finalization.");
        const user = snapshotToData<DBUser>(userDoc)!;

        if (user.status !== 'pending_setup') {
            throw new Error("User is not pending academy setup.");
        }

        const userForFrontend = await formatUserForFrontend(user);

        // Return the same partial token and the user object
        const tokenFromHeader = req.cookies?.partialAuthToken || req.headers['authorization']?.split(' ')[1];

        // Set the partial token as an auth cookie (academy setup is a special flow)
        if (tokenFromHeader) {
            setAuthCookie(res, tokenFromHeader);
        }

        res.json({
            accessToken: tokenFromHeader,
            user: userForFrontend,
        });

    } catch (error: any) {
        logger.error("Academy setup finalization error:", error);
        res.status(500).json({ message: "Failed to finalize academy setup." });
    }
};

export const finalizePaymentSession = async (req: Request, res: Response) => {
    const { session_id } = req.query;

    if (!session_id || typeof session_id !== 'string') {
        return res.status(400).json({ message: "Session ID is required." });
    }

    try {
        const sessionRef = paymentSessionsCollection.doc(session_id);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            return res.status(404).json({ message: "Session not found or expired." });
        }

        const sessionData = sessionDoc.data() as any;

        // Delete the session to prevent replay attacks (single-use token)
        await sessionRef.delete();

        // Set auth cookie if session contains an accessToken
        if (sessionData?.accessToken) {
            setAuthCookie(res, sessionData.accessToken);
        }

        // sessionData contains { accessToken, user, selectedOrganization }
        res.json(sessionData);
    } catch (error) {
        logger.error("Error finalizing payment session:", error);
        res.status(500).json({ message: "Failed to finalize session." });
    }
};

export const logout = async (_req: Request, res: Response) => {
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully.' });
};
