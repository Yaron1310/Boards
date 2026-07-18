
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
    workspacesCollection,
    preapprovedUsersCollection,
    organizationsCollection,
    membershipsCollection,
    boardMembersCollection,
} from '../db/collections.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';
import { env } from '../config/env.js';
import { DBUser, DBWorkspace, JwtUserPayload, DBPreapprovedUser, JwtVerificationPayload, JwtMultiOrgPayload, UserRole, DBOrganization, JwtPasswordResetPayload, DBMembership, BoardRole } from '../types/index.js';
import { sendAccountVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.service.js';
import { sanitizeText } from '../utils/sanitizer.js';
import { validatePasswordComplexity } from '../utils/password.js';
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken, RefreshTokenError } from '../services/refreshToken.service.js';

const isProduction = process.env.NODE_ENV === 'production' || env.FRONTEND_URL.startsWith('https');

const ACCESS_TOKEN_EXPIRES_IN = '15m';

const AUTH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' as const : 'lax' as const,
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes — matches access JWT expiry; refresh token extends the session
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


// Derives the user's highest possible role from their memberships.
export const deriveHighestRole = (memberships: DBMembership[]): UserRole => {
    let highestRole = UserRole.REGULAR_USER;
    let hasRegular = false, hasOrgEditor = false, hasOrgAdmin = false, hasOrganizationAdmin = false, hasSystemAdmin = false;

    for (const membership of memberships) {
        if (membership.role === UserRole.SYSTEM_ADMIN) hasSystemAdmin = true;
        if (membership.role === UserRole.ORGANIZATION_ADMIN) hasOrganizationAdmin = true;
        if (membership.role === UserRole.WORKSPACE_ADMIN) hasOrgAdmin = true;
        if (membership.role === UserRole.ORG_EDITOR) hasOrgEditor = true;
        if (membership.role === UserRole.REGULAR_USER) hasRegular = true;
    }

    if (hasSystemAdmin) highestRole = UserRole.SYSTEM_ADMIN;
    else if (hasOrganizationAdmin) highestRole = UserRole.ORGANIZATION_ADMIN;
    else if (hasOrgAdmin) highestRole = UserRole.WORKSPACE_ADMIN;
    else if (hasOrgEditor) highestRole = UserRole.ORG_EDITOR;
    else if (hasRegular) highestRole = UserRole.REGULAR_USER;
    
    return highestRole;
};

export const formatUserForFrontend = async (
    user: DBUser,
    context?: { orgId?: string; workspaceId?: string; role?: UserRole }
): Promise<any> => {
    const { passwordHash, passwordResetId, failedLoginAttempts, lockoutUntil, ...rest } = user;
    
    const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
    const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
    
    const dbRoles = {
        systemAdmin: memberships.some(m => m.role === UserRole.SYSTEM_ADMIN),
        organizationAdmin: [...new Set(memberships.filter(m => m.role === UserRole.ORGANIZATION_ADMIN).map(m => m.entityId))],
        workspaceAdmin: [...new Set(memberships.filter(m => m.role === UserRole.WORKSPACE_ADMIN).map(m => m.entityId))],
        orgEditor: [...new Set(memberships.filter(m => m.role === UserRole.ORG_EDITOR).map(m => m.orgId).filter(Boolean))],
    };
    
    const workspaceIdsFromMemberships = [...new Set(memberships.filter(m => m.entityType === 'workspace').map(m => m.entityId))];
    let allRelevantOrgIds = [...workspaceIdsFromMemberships];

    // If the user is an org admin, always ensure a representative workspace exists for each
    // admin org — even when they also have other workspace memberships (otherwise multi-org
    // detection misses the admin orgs and the context selection screen never appears).
    if (dbRoles.organizationAdmin.length > 0) {
        const adminOrganizationIds = dbRoles.organizationAdmin;
        const repOrgPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < adminOrganizationIds.length; i += 30) {
            repOrgPromises.push(workspacesCollection.where('orgId', 'in', adminOrganizationIds.slice(i, i + 30)).get());
        }
        const repOrgSnapshots = await Promise.all(repOrgPromises);
        const allRepOrgs = repOrgSnapshots.flatMap(snap => querySnapshotToArray<DBWorkspace>(snap));
        // Group by orgId and prefer a real (non-personal, non-templates) workspace as the representative
        const repByOrg = new Map<string, string>(); // orgId → workspaceId
        for (const org of allRepOrgs) {
            const existing = repByOrg.get(org.orgId);
            const isReal = !org.isPersonal && !org.isTemplates && org.name !== 'Default Workspace';
            if (!existing || isReal) {
                repByOrg.set(org.orgId, org.id);
            }
        }
        repByOrg.forEach(wsId => allRelevantOrgIds.push(wsId));
    }
    // For org_editor: fetch org names so the frontend can display them in context selection
    let orgEditorOrgs: { id: string; name: string }[] = [];
    if (dbRoles.orgEditor.length > 0) {
        const orgSnaps = await Promise.all(dbRoles.orgEditor.map((oid: string) => organizationsCollection.doc(oid).get()));
        orgEditorOrgs = orgSnaps
            .filter(s => s.exists)
            .map(s => ({ id: s.id, name: s.data()?.name || s.id }));
    }

    // De-duplicate the final list
    allRelevantOrgIds = [...new Set(allRelevantOrgIds)];

    // When formatting a user for display within a specific org (e.g. the
    // /admin/users table), derive the role from that org's memberships only —
    // otherwise deriveHighestRole would surface a role the user holds in a
    // DIFFERENT organization (e.g. an org admin of another org showing up as
    // "Org Admin" in this org's user list while they are only a regular member here).
    const roleMemberships = context?.orgId
        ? memberships.filter(m => m.orgId === context.orgId)
        : context?.workspaceId
            ? memberships.filter(m => m.entityId === context.workspaceId)
            : memberships;

    const userForFrontend: any = {
        ...rest,
        role: context?.role || deriveHighestRole(roleMemberships),
        hasPassword: !!passwordHash,
        dbRoles,
        ...(orgEditorOrgs.length > 0 ? { orgEditorOrgs } : {}),
    };
    
    let userOrgs: (Pick<DBWorkspace, 'id' | 'name' | 'orgId' | 'isPersonal' | 'isTemplates'> & { organizationName?: string })[] = [];

    if (dbRoles.systemAdmin && !context) {
        logger.info(`Formatting user ${user.id} as System Admin, fetching all workspaces and a representative org for each.`);
        const allOrganizationsSnapshot = await organizationsCollection.orderBy('name').get();
        const workspaces = querySnapshotToArray<DBOrganization>(allOrganizationsSnapshot);
        userForFrontend.allOrganizations = workspaces;

        if (workspaces.length > 0) {
            // Fetch all orgs in one query instead of N+1 per-workspace queries, then pick one per workspace
            const allOrgsSnapshot = await workspacesCollection.get();
            const allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot);
            const seenOrganizationIds = new Set<string>();
            userOrgs = allOrgs
                .filter(o => !!o.orgId)
                .filter(o => {
                    if (seenOrganizationIds.has(o.orgId)) return false;
                    seenOrganizationIds.add(o.orgId);
                    return true;
                })
                .map(o => ({ id: o.id, name: o.name, orgId: o.orgId, isPersonal: o.isPersonal, isTemplates: o.isTemplates }));
        }
    } else if (allRelevantOrgIds.length > 0) {
        const orgFetchPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < allRelevantOrgIds.length; i += 30) {
            orgFetchPromises.push(workspacesCollection.where(admin.firestore.FieldPath.documentId(), 'in', allRelevantOrgIds.slice(i, i + 30)).get());
        }
        const orgFetchSnapshots = await Promise.all(orgFetchPromises);
        let allUserOrgs = orgFetchSnapshots.flatMap(snap => querySnapshotToArray<DBWorkspace>(snap)).map(o => ({ id: o.id, name: o.name, orgId: o.orgId, isPersonal: o.isPersonal, isTemplates: o.isTemplates }));

        if (context?.orgId) {
            userOrgs = allUserOrgs.filter(org => org.orgId === context.orgId);
        } else if (context?.workspaceId) {
            userOrgs = allUserOrgs.filter(org => org.id === context.workspaceId);
        } else {
            userOrgs = allUserOrgs;
        }
    }

    if (userOrgs.length > 0) {
        const organizationIds = [...new Set(userOrgs.map(org => org.orgId))];
        if (organizationIds.length > 0) {
            const organizationFetchPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
            for (let i = 0; i < organizationIds.length; i += 30) {
                organizationFetchPromises.push(organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', organizationIds.slice(i, i + 30)).get());
            }
            const organizationFetchSnapshots = await Promise.all(organizationFetchPromises);
            const organizationsData = organizationFetchSnapshots.flatMap(snap => querySnapshotToArray<DBOrganization>(snap));
            const organizationMap = new Map(organizationsData.map(a => [a.id, a.name]));
            userOrgs.forEach((org => {
                org.organizationName = organizationMap.get(org.orgId) || 'Unknown Workspace';
            }));
        }
    }
    userForFrontend.workspaces = userOrgs;

    const organizationAdminOrganizationIds = new Set(memberships.filter(m => m.entityType === 'workspace' && m.role === UserRole.ORGANIZATION_ADMIN).map(m => m.entityId));
    const visibleOrgs = userOrgs.filter(o => !(o.isPersonal && organizationAdminOrganizationIds.has(o.orgId)));

    if (visibleOrgs.length === 1) {
        userForFrontend.workspaceId = visibleOrgs[0].id;
        userForFrontend.workspaceName = visibleOrgs[0].name;
    } else if (visibleOrgs.length > 1) {
        userForFrontend.workspaceName = 'Multiple Workspaces';
        delete userForFrontend.workspaceId;
    } else {
        userForFrontend.workspaceName = 'N/A';
        delete userForFrontend.workspaceId;
    }
    
    return userForFrontend;
};

/**
 * Creates memberships (and board-member docs) for a user from ALL their
 * pre-approval records and queues deletion of those records. Mirrors the
 * email/password register flow so board-only invites (boardOnlyAccess/boardIds)
 * survive every sign-up path — including Google/Microsoft OAuth, which
 * previously copied only `permissions` and silently granted full workspace
 * access. Writes are added to `batch`; the caller commits. Returns the resolved
 * primary orgId (first membership's org), or '' if none.
 */
export async function applyPreapprovalsToBatch(
    batch: admin.firestore.WriteBatch,
    newUser: { id: string; name: string; email: string; profileImageUrl?: string | null },
    preapprovedDocs: admin.firestore.QueryDocumentSnapshot[],
): Promise<string> {
    let orgId = '';
    for (const preapprovedDoc of preapprovedDocs) {
        const preapprovedData = snapshotToData<DBPreapprovedUser>(preapprovedDoc)!;

        if (preapprovedData.allWorkspaces && preapprovedData.orgId) {
            // Org-editor: one membership scoped to the org, not a specific workspace
            if (!orgId) orgId = preapprovedData.orgId;
            const newMembershipRef = membershipsCollection.doc();
            batch.set(newMembershipRef, {
                id: newMembershipRef.id,
                userId: newUser.id,
                userName: newUser.name,
                userEmail: newUser.email,
                entityId: preapprovedData.orgId,
                entityType: 'organization',
                role: UserRole.ORG_EDITOR,
                orgId: preapprovedData.orgId,
                permissions: preapprovedData.permissions ?? 'edit',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else if (preapprovedData.workspaceId) {
            const orgDoc = await workspacesCollection.doc(preapprovedData.workspaceId).get();
            const wsOrgId = orgDoc.exists ? (orgDoc.data()?.orgId || '') : '';
            if (!orgId) orgId = wsOrgId;
            const newMembershipRef = membershipsCollection.doc();
            batch.set(newMembershipRef, {
                id: newMembershipRef.id,
                userId: newUser.id,
                userName: newUser.name,
                userEmail: newUser.email,
                entityId: preapprovedData.workspaceId,
                entityType: 'workspace',
                role: UserRole.REGULAR_USER,
                orgId: wsOrgId,
                ...(preapprovedData.permissions ? { permissions: preapprovedData.permissions } : {}),
                ...(preapprovedData.boardOnlyAccess ? { boardOnlyAccess: true } : {}),
                ...(preapprovedData.boardIds ? { boardIds: preapprovedData.boardIds } : {}),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            if (preapprovedData.boardIds?.length && wsOrgId) {
                const boardRole = preapprovedData.permissions === 'read_only' ? BoardRole.VIEWER : BoardRole.EDITOR;
                for (const boardId of preapprovedData.boardIds) {
                    batch.set(boardMembersCollection(wsOrgId, boardId).doc(newUser.id), {
                        userId: newUser.id,
                        boardId,
                        workspaceId: preapprovedData.workspaceId,
                        role: boardRole,
                        addedBy: preapprovedData.addedBy ?? 'system',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        userName: newUser.name ?? null,
                        userEmail: newUser.email ?? null,
                        userProfileImageUrl: newUser.profileImageUrl ?? null,
                    });
                }
            }
        }
        // Delete pre-approval record immediately — no longer needed
        batch.delete(preapprovedDoc.ref);
    }
    return orgId;
}

export const generateFullLoginResponse = async (user: DBUser, selectedWorkspaceId: string, memberships: DBMembership[], sessionRole?: UserRole, preIssuedRefreshToken?: string) => {
    const effectiveRole = sessionRole || deriveHighestRole(memberships);
    if (!effectiveRole) {
        throw new Error(`Could not determine a valid role for user ${user.id}.`);
    }

    // org_editor: selectedWorkspaceId is actually the orgId — look up the org directly
    if (effectiveRole === UserRole.ORG_EDITOR) {
        const orgEditorMembership = memberships.find(m => m.role === UserRole.ORG_EDITOR);
        const orgId = orgEditorMembership?.orgId || selectedWorkspaceId;
        const workspacePermissions: 'edit' | 'read_only' = orgEditorMembership?.permissions ?? 'edit';
        const tokenPayload: JwtUserPayload = {
            id: user.id,
            role: effectiveRole,
            selectedWorkspaceId: orgId,
            orgId,
            workspacePermissions,
        };
        const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
        const orgDoc = await organizationsCollection.doc(orgId).get();
        const orgName = orgDoc.exists ? (orgDoc.data()?.name || 'Organization') : 'Organization';
        const [userForFrontend, firebaseToken, refreshToken] = await Promise.all([
            formatUserForFrontend(user, { role: effectiveRole }),
            admin.auth().createCustomToken(user.id, { orgId, role: effectiveRole }).catch((err) => {
                logger.warn('createCustomToken failed — real-time sync unavailable until IAM is fixed', err.message);
                return null;
            }),
            preIssuedRefreshToken ? Promise.resolve(preIssuedRefreshToken) : issueRefreshToken(user.id, orgId, effectiveRole),
        ]);
        return {
            accessToken,
            refreshToken,
            firebaseToken,
            user: userForFrontend,
            selectedWorkspace: { id: orgId, name: orgName, orgId, workspacePermissions },
        };
    }

    const orgDoc = await workspacesCollection.doc(selectedWorkspaceId).get();
    if (!orgDoc.exists) {
        throw new Error(`Workspace ${selectedWorkspaceId} not found for user ${user.id}`);
    }
    const selectedWorkspace = snapshotToData<DBWorkspace>(orgDoc)!;
    const orgId = selectedWorkspace.orgId;

    const selectedMembership = memberships.find(m => m.entityId === selectedWorkspaceId);
    const workspacePermissions: 'edit' | 'read_only' = selectedMembership?.permissions ?? 'edit';
    const tokenPayload: JwtUserPayload = {
        id: user.id,
        role: effectiveRole,
        selectedWorkspaceId: selectedWorkspace.id,
        orgId: orgId,
        workspacePermissions,
        ...(selectedMembership?.boardIds !== undefined ? { boardIds: selectedMembership.boardIds } : {}),
    };
    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });

    const [userForFrontend, firebaseToken, refreshToken] = await Promise.all([
        formatUserForFrontend(user, { role: effectiveRole }),
        admin.auth().createCustomToken(user.id, { orgId, role: effectiveRole }).catch((err) => {
            logger.warn('createCustomToken failed — real-time sync unavailable until IAM is fixed', err.message);
            return null;
        }),
        preIssuedRefreshToken ? Promise.resolve(preIssuedRefreshToken) : issueRefreshToken(user.id, selectedWorkspace.id, effectiveRole),
    ]);

    return {
        accessToken,
        refreshToken,
        firebaseToken,
        user: userForFrontend,
        selectedWorkspace: {
            id: selectedWorkspace.id,
            name: selectedWorkspace.name,
            orgId: selectedWorkspace.orgId,
            workspacePermissions,
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
        { id: user.id, action: 'select-workspace' } as JwtMultiOrgPayload,
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

const calculateAvailableContexts = async (user: any): Promise<{ role: UserRole, workspaceId: string }[]> => {
    if (!user.workspaces || !user.dbRoles) {
        return [];
    }

    const { systemAdmin, organizationAdmin = [], workspaceAdmin = [] } = user.dbRoles;
    const contexts: { role: UserRole, workspaceId: string }[] = [];
    const addedContexts = new Set<string>(); // "role|orgId"

    if (systemAdmin) {
        if (user.workspaces.length > 0) {
            const defaultOrg = user.workspaces.find((o:any) => o.name === 'Default Workspace' || o.id === 'default_org') || user.workspaces[0];
            const contextKey = `${UserRole.SYSTEM_ADMIN}|${defaultOrg.id}`;
            if (!addedContexts.has(contextKey)) {
                contexts.push({ role: UserRole.SYSTEM_ADMIN, workspaceId: defaultOrg.id });
                addedContexts.add(contextKey);
            }
        }
        
        const allOrganizationsSnapshot = await organizationsCollection.get();
        const allOrganizations = querySnapshotToArray<DBOrganization>(allOrganizationsSnapshot);

        // Fetch all orgs in one query instead of N+1 per-workspace queries
        const allOrgsSnapshot = await workspacesCollection.get();
        const allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot);

        // Build a map of orgId → first org ID
        const firstOrgByOrganization = new Map<string, string>();
        for (const org of allOrgs) {
            if (!firstOrgByOrganization.has(org.orgId)) {
                firstOrgByOrganization.set(org.orgId, org.id);
            }
        }

        for (const workspace of allOrganizations) {
            const orgId = firstOrgByOrganization.get(workspace.id);
            if (orgId) {
                const contextKey = `${UserRole.ORGANIZATION_ADMIN}|${orgId}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.ORGANIZATION_ADMIN, workspaceId: orgId });
                    addedContexts.add(contextKey);
                }
            } else {
                logger.warn(`Workspace '${workspace.name}' (${workspace.id}) has no workspaces. Cannot create an Workspace Admin context for it.`);
            }
        }
    } else {
        organizationAdmin.forEach((orgId: string) => {
            // Workspace Admin context is ONLY available for workspaces the user is EXPLICITLY a member of in that workspace.
            // This prevents them from assuming AA role for workspaces they are not part of.
            const userOrgsInOrganization = user.workspaces.filter((o: any) => o.orgId === orgId && o.name !== 'Default Workspace');
            userOrgsInOrganization.forEach((org: any) => {
                const contextKey = `${UserRole.ORGANIZATION_ADMIN}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.ORGANIZATION_ADMIN, workspaceId: org.id });
                    addedContexts.add(contextKey);
                }
            });
        });

        workspaceAdmin.forEach((orgId: string) => {
            const org = user.workspaces.find((o: any) => o.id === orgId && o.name !== 'Default Workspace');
            const isCoveredByOrganizationAdmin = organizationAdmin.includes(org?.orgId || '');
            if (org && !isCoveredByOrganizationAdmin) {
                const contextKey = `${UserRole.WORKSPACE_ADMIN}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.WORKSPACE_ADMIN, workspaceId: org.id });
                    addedContexts.add(contextKey);
                }
            }
        });

        // Org editors have one context per org (entityId is the orgId on their membership)
        const orgEditorOrgIds = [...new Set(
            (user.dbRoles?.orgEditor ?? []) as string[]
        )];
        orgEditorOrgIds.forEach((oid: string) => {
            const contextKey = `${UserRole.ORG_EDITOR}|${oid}`;
            if (!addedContexts.has(contextKey)) {
                contexts.push({ role: UserRole.ORG_EDITOR, workspaceId: oid });
                addedContexts.add(contextKey);
            }
        });

        user.workspaces.forEach((org: any) => {
            if (org.name === 'Default Workspace') return;

            const isOrganizationAdminForThisOrg = organizationAdmin.includes(org.orgId);
            const isOrgManagerForThisOrg = workspaceAdmin.includes(org.id);
            const isOrgEditorForThisOrg = orgEditorOrgIds.includes(org.orgId);

            if (!isOrganizationAdminForThisOrg && !isOrgManagerForThisOrg && !isOrgEditorForThisOrg) {
                const contextKey = `${UserRole.REGULAR_USER}|${org.id}`;
                if (!addedContexts.has(contextKey)) {
                    contexts.push({ role: UserRole.REGULAR_USER, workspaceId: org.id });
                    addedContexts.add(contextKey);
                }
            }
        });
    }

    // Special case: If after all checks, no contexts are found, check if the user's ONLY workspace
    // is the "Default Workspace". If so, grant them a limited login context.
    if (contexts.length === 0 && user.workspaces.length === 1 && user.workspaces[0].name === 'Default Workspace') {
        logger.info(`User ${user.id} has no active contexts, but is a regular user in Default Workspace. Granting limited login context.`);
        contexts.push({ role: UserRole.REGULAR_USER, workspaceId: user.workspaces[0].id });
    }

    return contexts;
};

const isMultiOrgUser = (userForFrontend: any): boolean => {
    if (userForFrontend.dbRoles?.systemAdmin) return true;
    const workspaces: any[] = (userForFrontend.workspaces || []).filter((w: any) => !w.isPersonal && !w.isTemplates && w.name !== 'Default Workspace');
    const distinctOrgIds = new Set(workspaces.map((w: any) => w.orgId).filter(Boolean));
    // Also count orgs from org-admin roles — an org admin for a new org may have no
    // real workspaces yet (only personal/templates), but still needs context selection.
    (userForFrontend.dbRoles?.organizationAdmin || []).forEach((orgId: string) => distinctOrgIds.add(orgId));
    return distinctOrgIds.size > 1;
};

export const register = async (req: Request, res: Response) => {
    const { password } = req.body;
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

        // Standard Workspace Pre-approved Flow
        // Fetch ALL pre-approval records for this email (there may be one per workspace when invited org-wide)
        const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).get();
        if (preapprovedQuery.empty) {
            logger.warn(`Registration attempt by non-pre-approved email: ${email}`);
            return res.status(403).json({ message: 'You are not authorized to register. Please contact your workspace manager.' });
        }

        const allPreapprovedDocs = preapprovedQuery.docs;
        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRef = usersCollection.doc();
        // Invited users are trusted — mark active immediately, no email verification needed
        const newUser: Omit<DBUser, 'createdAt' | 'googleId'> = {
            id: newUserRef.id, email, name, passwordHash,
            status: 'active',
            emailVerified: true,
            profileImageUrl: '/default_user.webp',
        };

        const batch = db.batch();
        batch.set(newUserRef, { ...newUser, createdAt: new Date() });

        // Create a membership for every workspace/board the user was pre-approved into.
        const orgId = await applyPreapprovalsToBatch(
            batch,
            { id: newUser.id, name: newUser.name, email: newUser.email, profileImageUrl: newUser.profileImageUrl },
            allPreapprovedDocs,
        );

        await batch.commit();

        let organizationName = 'Logyx';
        if (orgId) {
            const organizationDoc = await organizationsCollection.doc(orgId).get();
            organizationName = organizationDoc.exists ? (organizationDoc.data()?.name || 'Logyx') : 'Logyx';
        }

        // Send welcome email (fire and forget) — verification email is skipped for invited users
        sendWelcomeEmail(email, name, organizationName).catch(err => logger.error("Failed to send welcome email:", err));

        return res.status(201).json({
            success: true,
            requiresVerification: false,
            message: `Welcome to ${organizationName}! Your account is ready. You can now log in.`
        });

    } catch (error) {
        logger.error("Registration error:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

export const registerOrganizationAdmin = async (req: Request, res: Response) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        return res.status(400).json({ message: 'Email, password, and name are required.' });
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
        };
        await newUserRef.set({ ...newUser, createdAt: new Date() });

        const verificationTokenPayload: JwtVerificationPayload = { userId: newUser.id, action: 'verify_organization_admin' };
        const verificationToken = jwt.sign(verificationTokenPayload, env.JWT_SECRET, { expiresIn: '24h' });
        const verificationLink = `${env.FRONTEND_URL}/verify-account?token=${verificationToken}`;
        
        // Since the workspace isn't created yet, we use a generic name.
        await sendAccountVerificationEmail(email, name, verificationLink, "Your New Workspace");

        res.status(201).json({
            success: true,
            message: `Registration successful! An email has been sent to ${email}. Please click the link inside to verify your account and begin setup.`
        });

    } catch (error) {
        logger.error("Workspace admin registration error:", error);
        res.status(500).json({ message: 'Server error during workspace admin registration.' });
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

        if (user.status === 'pending') {
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
            return res.status(403).json({ message: "Your account is not assigned to any workspace. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (isMultiOrgUser(userForFrontend)) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                logger.info(`System Admin multi-context login for ${user.email}. Fetching all workspaces for context selection UI.`);
                const allOrgsSnapshot = await workspacesCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot).filter(o => !!o.orgId).map(o => ({ id: o.id, name: o.name, orgId: o.orgId }));
                
                const organizationIds = [...new Set(allOrgs.map(org => org.orgId))];
                if (organizationIds.length > 0) {
                    const organizationsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', organizationIds).get();
                    const organizationsData = querySnapshotToArray<DBOrganization>(organizationsSnapshot);
                    const organizationMap = new Map(organizationsData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.organizationName = organizationMap.get(org.orgId) || 'Unknown Workspace';
                    });
                }
                userForFrontend.workspaces = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length >= 1) {
            const { role, workspaceId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, workspaceId, memberships, role);
            setAuthCookie(res, response.accessToken);
            res.clearCookie('partialAuthToken', { path: '/' });
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any workspace. Please contact an administrator." });
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
        
        let organizationName = 'Logyx';
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).limit(1).get();
        if (!membershipsSnapshot.empty) {
            const membership = snapshotToData<DBMembership>(membershipsSnapshot.docs[0])!;
            let orgId: string | undefined;
            if (membership.entityType === 'workspace') {
                orgId = membership.entityId;
            } else {
                const orgDoc = await workspacesCollection.doc(membership.entityId).get();
                if (orgDoc.exists) orgId = orgDoc.data()?.orgId;
            }
            if(orgId) {
                const organizationDoc = await organizationsCollection.doc(orgId).get();
                if (organizationDoc.exists) organizationName = organizationDoc.data()?.name || 'Logyx';
            }
        }
        await sendPasswordResetEmail(user.email, user.name, resetLink, organizationName);
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
    const { workspaceId, role: requestedRole } = req.body as { workspaceId: string, role: UserRole };

    try {
        const userDoc = await usersCollection.doc(partialToken.id).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;
        
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const orgDoc = await workspacesCollection.doc(workspaceId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Workspace not found." });
        const targetOrg = snapshotToData<DBWorkspace>(orgDoc)!;
        const targetOrganizationId = targetOrg.orgId;

        let canAssumeRole = false;
        if (requestedRole === UserRole.REGULAR_USER) {
            canAssumeRole = memberships.some(m => m.entityId === workspaceId && m.role === UserRole.REGULAR_USER);
        } else if (requestedRole === UserRole.WORKSPACE_ADMIN) {
            canAssumeRole = memberships.some(m => 
                (m.entityId === workspaceId && m.role === UserRole.WORKSPACE_ADMIN) ||
                (m.entityId === targetOrganizationId && m.role === UserRole.ORGANIZATION_ADMIN) ||
                m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.ORGANIZATION_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === targetOrganizationId && m.role === UserRole.ORGANIZATION_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.SYSTEM_ADMIN) {
            canAssumeRole = memberships.some(m => m.role === UserRole.SYSTEM_ADMIN);
        }

        if (!canAssumeRole) {
            return res.status(403).json({ message: `You do not have permission to assume the role '${requestedRole}' for this context.` });
        }

        const response = await generateFullLoginResponse(user, workspaceId, memberships, requestedRole);
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
    const { workspaceId, role: requestedRole } = req.body as { workspaceId: string, role: UserRole };
    
    try {
        const userDoc = await usersCollection.doc(userPayload.id).get();
        if (!userDoc.exists) return res.status(404).json({ message: "User not found." });
        const user = snapshotToData<DBUser>(userDoc)!;
        
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);
        
        const orgDoc = await workspacesCollection.doc(workspaceId).get();
        if (!orgDoc.exists) return res.status(404).json({ message: "Workspace not found." });
        const targetOrg = snapshotToData<DBWorkspace>(orgDoc)!;
        const targetOrganizationId = targetOrg.orgId;

        let canAssumeRole = false;
        if (requestedRole === UserRole.REGULAR_USER) {
            canAssumeRole = memberships.some(m => m.entityId === workspaceId && m.role === UserRole.REGULAR_USER);
        } else if (requestedRole === UserRole.WORKSPACE_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === workspaceId && m.role === UserRole.WORKSPACE_ADMIN) || (m.entityId === targetOrganizationId && m.role === UserRole.ORGANIZATION_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.ORGANIZATION_ADMIN) {
            canAssumeRole = memberships.some(m => (m.entityId === targetOrganizationId && m.role === UserRole.ORGANIZATION_ADMIN) || m.role === UserRole.SYSTEM_ADMIN);
        } else if (requestedRole === UserRole.SYSTEM_ADMIN) {
            canAssumeRole = memberships.some(m => m.role === UserRole.SYSTEM_ADMIN);
        }

        if (!canAssumeRole) {
            return res.status(403).json({ message: `You do not have permission to assume the role '${requestedRole}' for this context.` });
        }

        const response = await generateFullLoginResponse(user, workspaceId, memberships, requestedRole);
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

        if (decoded.action === 'verify_organization_admin') {
            if (user.status === 'active') return res.redirect(`${env.FRONTEND_URL}/login?message=Workspace%20account%20already%20active.`);
            if (user.status !== 'pending' && user.status !== 'pending_setup') return res.redirect(`${env.FRONTEND_URL}/login?message=Account%20status%20is%20not%20pending.`);
            
            await userRef.update({ status: 'pending_setup' });
            const partialTokenPayload: JwtMultiOrgPayload = { id: user.id, action: 'workspace-setup' };
            const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '1h' });
            setPartialAuthCookie(res, partialToken);
            return res.redirect(`${env.FRONTEND_URL}/auth/workspace/callback?token=${partialToken}`);
        }

        if (decoded.action === 'verify_email') {
            // Standard registration flow
            const batch = db.batch();
            batch.update(userRef, { status: 'active', emailVerified: true });

            const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', user.email.toLowerCase()).get();
            if (!preapprovedQuery.empty) {
                preapprovedQuery.docs.forEach(doc => batch.delete(doc.ref));
            }
            await batch.commit();

            // Resolve the user's organization to brand the welcome email (they were invited
            // into a real org via the org-admin / workspace-manager verify_email flow).
            let welcomeOrgName = 'Logyx';
            const welcomeMembershipSnapshot = await membershipsCollection.where('userId', '==', user.id).limit(1).get();
            if (!welcomeMembershipSnapshot.empty) {
                const membership = snapshotToData<DBMembership>(welcomeMembershipSnapshot.docs[0])!;
                let welcomeOrgId: string | undefined;
                if (membership.entityType === 'workspace') {
                    welcomeOrgId = membership.entityId;
                } else {
                    const orgDoc = await workspacesCollection.doc(membership.entityId).get();
                    if (orgDoc.exists) welcomeOrgId = orgDoc.data()?.orgId;
                }
                if (welcomeOrgId) {
                    const organizationDoc = await organizationsCollection.doc(welcomeOrgId).get();
                    if (organizationDoc.exists) welcomeOrgName = organizationDoc.data()?.name || 'Logyx';
                }
            }

            // Send Welcome Email (Fire and forget)
            sendWelcomeEmail(user.email, user.name, welcomeOrgName).catch(err => logger.error("Failed to send welcome email:", err));

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
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', dbUser.id).get();
        if (dbUser.status === 'active' && !membershipsSnapshot.empty) {
             const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-workspace' };
             const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
             setPartialAuthCookie(res, partialToken);
             return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}`);
        }

        // Provisioned users (e.g. via WooCommerce) have pending status with existing memberships.
        // Google OAuth verifies the email, so activate them and allow login.
        if (dbUser.status === 'pending' && !membershipsSnapshot.empty) {
            await usersCollection.doc(dbUser.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
            const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-workspace' };
            const partialToken = jwt.sign(partialTokenPayload, env.JWT_SECRET, { expiresIn: '5m' });
            setPartialAuthCookie(res, partialToken);
            return res.redirect(`${env.FRONTEND_URL}/auth/google/callback?token=${partialToken}`);
        }

        const preapprovedQuery = await preapprovedUsersCollection.where('email', '==', dbUser.email.toLowerCase()).get();
        if (preapprovedQuery.empty) {
            return res.redirect(`${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=Your%20email%20is%20not%20pre-approved.`);
        }

        const batch = db.batch();
        await applyPreapprovalsToBatch(
            batch,
            { id: dbUser.id, name: dbUser.name, email: dbUser.email, profileImageUrl: dbUser.profileImageUrl },
            preapprovedQuery.docs,
        );
        batch.update(usersCollection.doc(dbUser.id), { status: 'active', registrationType: 'standard', emailVerified: true });
        await batch.commit();

        const partialTokenPayload: JwtMultiOrgPayload = { id: dbUser.id, action: 'select-workspace' };
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

        if (memberships.length === 0) {
            logger.warn(`User ${user.id} logged in via Google but has no memberships.`);
            return res.status(403).json({ message: "Your account is not assigned to any workspace. Please contact an administrator." });
        }

        const availableContexts = await calculateAvailableContexts(userForFrontend);
        
        if (isMultiOrgUser(userForFrontend)) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                logger.info(`System Admin multi-context Google login for ${user.email}. Fetching all workspaces for context selection UI.`);
                const allOrgsSnapshot = await workspacesCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, orgId: o.orgId }));
                const organizationIds = [...new Set(allOrgs.map(org => org.orgId))];
                if (organizationIds.length > 0) {
                    const organizationsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', organizationIds).get();
                    const organizationsData = querySnapshotToArray<DBOrganization>(organizationsSnapshot);
                    const organizationMap = new Map(organizationsData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.organizationName = organizationMap.get(org.orgId) || 'Unknown Workspace';
                    });
                }
                userForFrontend.workspaces = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, tokenFromHeader, userForFrontend);
        } else if (availableContexts.length >= 1) {
            const { role, workspaceId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, workspaceId, memberships, role);
            setAuthCookie(res, response.accessToken);
            res.clearCookie('partialAuthToken', { path: '/' });
            return res.json(response);
        } else {
             logger.warn(`User ${user.id} logged in via Google but has no available contexts.`);
             return res.status(403).json({ message: "You do not have an active role in any workspace. Please contact an administrator." });
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
            const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).get();
            if (preapprovedSnap.empty) {
                return res.status(403).json({ message: "Your email is not pre-approved for registration." });
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
            };

            const batch = db.batch();
            batch.set(newUserRef, {
                ...newUserData,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Create memberships from ALL pre-approvals (preserves boardOnlyAccess/boardIds)
            await applyPreapprovalsToBatch(
                batch,
                { id: newUserRef.id, name, email, profileImageUrl: picture },
                preapprovedSnap.docs,
            );

            await batch.commit();

            const userDoc = await newUserRef.get();
            user = snapshotToData<DBUser>(userDoc)!;
        } else {
            // Existing user
            user = snapshotToData<DBUser>(userSnap.docs[0])!;
            if (user.status === 'disabled') return res.status(403).json({ message: 'Your account has been disabled.' });

            if (user.status === 'pending') {
                await usersCollection.doc(user.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
                user.status = 'active';
            }
        }

        // Process login (similar to standard login flow)
        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        if (membershipsSnapshot.empty) {
            return res.status(403).json({ message: "Your account is not assigned to any workspace. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (isMultiOrgUser(userForFrontend)) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                 const allOrgsSnapshot = await workspacesCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, orgId: o.orgId }));
                const organizationIds = [...new Set(allOrgs.map(org => org.orgId))];
                if (organizationIds.length > 0) {
                    const organizationsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', organizationIds).get();
                    const organizationsData = querySnapshotToArray<DBOrganization>(organizationsSnapshot);
                    const organizationMap = new Map(organizationsData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.organizationName = organizationMap.get(org.orgId) || 'Unknown Workspace';
                    });
                }
                userForFrontend.workspaces = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length >= 1) {
            const { role, workspaceId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, workspaceId, memberships, role);
            setAuthCookie(res, response.accessToken);
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any workspace." });
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
            const preapprovedSnap = await preapprovedUsersCollection.where('email', '==', email.toLowerCase()).get();
            if (preapprovedSnap.empty) {
                return res.status(403).json({ message: "Your email is not pre-approved for registration." });
            }

            const newUserRef = usersCollection.doc();
            const newUserData: Omit<DBUser, 'createdAt' | 'passwordHash' | 'googleId'> = {
                id: newUserRef.id,
                microsoftId: microsoftId,
                name: name,
                email: email,
                status: 'active',
                emailVerified: true,
            };

            const batch = db.batch();
            batch.set(newUserRef, { ...newUserData, createdAt: admin.firestore.FieldValue.serverTimestamp() });

            // Create memberships from ALL pre-approvals (preserves boardOnlyAccess/boardIds)
            await applyPreapprovalsToBatch(
                batch,
                { id: newUserRef.id, name, email, profileImageUrl: null },
                preapprovedSnap.docs,
            );
            await batch.commit();

            const userDoc = await newUserRef.get();
            user = snapshotToData<DBUser>(userDoc)!;
        } else {
            user = snapshotToData<DBUser>(userSnap.docs[0])!;
            if (user.status === 'disabled') return res.status(403).json({ message: 'Your account has been disabled.' });

            if (user.status === 'pending') {
                await usersCollection.doc(user.id).update({ status: 'active', emailVerified: true, registrationType: 'standard' });
                user.status = 'active';
            }
        }

        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        if (membershipsSnapshot.empty) {
            return res.status(403).json({ message: "Your account is not assigned to any workspace. Please contact an administrator." });
        }
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const userForFrontend = await formatUserForFrontend(user);
        const availableContexts = await calculateAvailableContexts(userForFrontend);

        if (isMultiOrgUser(userForFrontend)) {
            if (userForFrontend.dbRoles?.systemAdmin) {
                 const allOrgsSnapshot = await workspacesCollection.orderBy('name').get();
                let allOrgs = querySnapshotToArray<DBWorkspace>(allOrgsSnapshot).map(o => ({ id: o.id, name: o.name, orgId: o.orgId }));
                const organizationIds = [...new Set(allOrgs.map(org => org.orgId))];
                if (organizationIds.length > 0) {
                    const organizationsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', organizationIds).get();
                    const organizationsData = querySnapshotToArray<DBOrganization>(organizationsSnapshot);
                    const organizationMap = new Map(organizationsData.map(a => [a.id, a.name]));
                    allOrgs.forEach((org: any) => {
                        org.organizationName = organizationMap.get(org.orgId) || 'Unknown Workspace';
                    });
                }
                userForFrontend.workspaces = allOrgs;
            }
            return handleMultiOrgOrContextLogin(user, res, undefined, userForFrontend);
        } else if (availableContexts.length >= 1) {
            const { role, workspaceId } = availableContexts[0];
            const response = await generateFullLoginResponse(user, workspaceId, memberships, role);
            setAuthCookie(res, response.accessToken);
            return res.json(response);
        } else {
            return res.status(403).json({ message: "You do not have an active role in any workspace." });
        }
    } catch (error: any) {
        logger.error("Native Microsoft Login error:", error);
        res.status(500).json({ message: error.message || "Authentication failed." });
    }
};

export const finalizeOrganizationSetup = async (req: Request, res: Response) => {
    const partialToken = req.user as JwtMultiOrgPayload;
    try {
        const userDoc = await usersCollection.doc(partialToken.id).get();
        if (!userDoc.exists) throw new Error("User not found during finalization.");
        const user = snapshotToData<DBUser>(userDoc)!;

        if (user.status !== 'pending_setup') {
            throw new Error("User is not pending workspace setup.");
        }

        const userForFrontend = await formatUserForFrontend(user);

        // Return the same partial token and the user object
        const tokenFromHeader = req.cookies?.partialAuthToken || req.headers['authorization']?.split(' ')[1];

        // Set the partial token as an auth cookie (workspace setup is a special flow)
        if (tokenFromHeader) {
            setAuthCookie(res, tokenFromHeader);
        }

        res.json({
            accessToken: tokenFromHeader,
            user: userForFrontend,
        });

    } catch (error: any) {
        logger.error("Workspace setup finalization error:", error);
        res.status(500).json({ message: "Failed to finalize workspace setup." });
    }
};

export const logout = async (req: Request, res: Response) => {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully.' });
};

export const refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken || typeof refreshToken !== 'string') {
        return res.status(401).json({ message: 'No refresh token provided.' });
    }

    try {
        const { userId, workspaceId, role, newToken } = await rotateRefreshToken(refreshToken);

        const userDoc = await usersCollection.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(401).json({ message: 'User not found.' });
        }
        const user = snapshotToData<DBUser>(userDoc)!;
        if (user.status === 'disabled') {
            return res.status(403).json({ message: 'Your account has been disabled.' });
        }

        const membershipsSnapshot = await membershipsCollection.where('userId', '==', user.id).get();
        const memberships = querySnapshotToArray<DBMembership>(membershipsSnapshot);

        const response = await generateFullLoginResponse(user, workspaceId, memberships, role, newToken);

        setAuthCookie(res, response.accessToken);
        return res.json(response);
    } catch (error: any) {
        if (error instanceof RefreshTokenError) {
            clearAuthCookies(res);
            return res.status(401).json({ message: error.message });
        }
        logger.error('Token refresh error:', error);
        return res.status(500).json({ message: 'Failed to refresh session.' });
    }
};
