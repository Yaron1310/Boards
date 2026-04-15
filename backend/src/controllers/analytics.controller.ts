
import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';

import { 
    tokenUsageCollection, 
    organizationsCollection,
    plansCollection,
    systemSettingsCollection,
    usersCollection,
    membershipsCollection,
    academiesCollection
} from '../db/collections.js';
import { DBTokenUsage, JwtUserPayload, UserRole, DBOrganization, DBPlan, DBSystemSettings, DBAcademy, DBMembership } from '../types/index.js';
import { snapshotToData, querySnapshotToArray } from '../services/firestore.service.js';

const getStartAndEndDates = (yearStr?: string, monthStr?: string): { startDate?: Date, endDate?: Date } => {
    let year = yearStr ? parseInt(yearStr, 10) : NaN;
    const month = monthStr ? parseInt(monthStr, 10) : NaN; // 1-12

    if (isNaN(year) && isNaN(month)) {
        // If both are missing, default to the current month.
        const now = new Date();
        year = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth() + 1;
        const startDate = new Date(Date.UTC(year, currentMonth - 1, 1));
        const endDate = new Date(Date.UTC(year, currentMonth, 0, 23, 59, 59, 999));
        return { startDate, endDate };
    }

    if (isNaN(year) && !isNaN(month)) {
        year = new Date().getUTCFullYear();
    }

    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        return { startDate, endDate };
    }
    
    if (!isNaN(year) && isNaN(month)) {
        const startDate = new Date(Date.UTC(year, 0, 1));
        const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        return { startDate, endDate };
    }

    return { startDate: undefined, endDate: undefined };
};

export const getUserTokenUsage = async (req: Request, res: Response) => {
    const requestingUser = req.user as JwtUserPayload;
    const { year, month } = req.query as { year?: string, month?: string };
    const { startDate, endDate } = getStartAndEndDates(year, month);

    try {
        let query: admin.firestore.Query = tokenUsageCollection;

        if (startDate && endDate) {
            query = query.where('createdAt', '>=', startDate).where('createdAt', '<=', endDate);
        }

        if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
             if (!requestingUser.selectedOrganizationId) return res.json({});
             query = query.where('organizationId', '==', requestingUser.selectedOrganizationId);
        } else if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
             query = query.where('academyId', '==', requestingUser.academyId);
        } else if (requestingUser.role !== UserRole.SYSTEM_ADMIN) {
            return res.json({});
        }

        const snapshot = await query.get();
        const usages = snapshot.docs.map(doc => doc.data() as DBTokenUsage);

        const result: { [userId: string]: { used: number, limit: number | null } } = {};
        for (const usage of usages) {
            if (!result[usage.userId]) {
                result[usage.userId] = { used: 0, limit: null };
            }
            result[usage.userId].used += usage.totalTokens;
        }

        const allOrgIds = [...new Set(usages.map(u => u.organizationId).filter((id): id is string => !!id))];
        if (allOrgIds.length === 0) {
            return res.json(result);
        }

        const orgsSnapshot = await organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', allOrgIds).get();
        const allPlanIds: string[] = [];
        const orgMap = new Map(querySnapshotToArray<DBOrganization>(orgsSnapshot).map(o => {
            if (o.planId) allPlanIds.push(o.planId);
            return [o.id, o];
        }));

        const uniquePlanIds = [...new Set(allPlanIds)];
        const planMap = new Map<string, DBPlan>();
        if (uniquePlanIds.length > 0) {
            const plansSnapshot = await plansCollection.where(admin.firestore.FieldPath.documentId(), 'in', uniquePlanIds).get();
            querySnapshotToArray<DBPlan>(plansSnapshot).forEach(p => planMap.set(p.id, p));
        }

        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;

        for (const usage of usages) {
            if (result[usage.userId] && result[usage.userId].limit === null) {
                let limit: number | null = null;
                const org = orgMap.get(usage.organizationId || '');
                if (org && org.planId) {
                    const plan = planMap.get(org.planId);
                    if (plan && plan.planType === 'subscription') {
                        limit = settings.subscriptionMonthlyLimit;
                    }
                }
                result[usage.userId].limit = limit;
            }
        }

        res.json(result);
    } catch (error) {
        logger.error("Error fetching user token usage:", error);
        res.status(500).json({ message: "Failed to fetch user token usage." });
    }
};


export const getOrgTokenUsage = async (req: Request, res: Response) => {
    const { year, month } = req.query as { year?: string, month?: string };
    const { startDate, endDate } = getStartAndEndDates(year, month);
    const requestingUser = req.user as JwtUserPayload;
    
    try {
        let query: admin.firestore.Query = tokenUsageCollection;

        if (startDate && endDate) {
            query = query.where('createdAt', '>=', startDate).where('createdAt', '<=', endDate);
        }

        if (requestingUser.role === UserRole.ORGANIZATION_ADMIN) {
             if (!requestingUser.selectedOrganizationId) return res.json({});
             query = query.where('organizationId', '==', requestingUser.selectedOrganizationId);
        } else if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
             query = query.where('academyId', '==', requestingUser.academyId);
        }

        const snapshot = await query.get();
        if (snapshot.empty) return res.json({});
        
        const usages = snapshot.docs.map(doc => doc.data() as DBTokenUsage);
        
        const usageByOrg: { [orgId: string]: { used: number, limit: number | null } } = {};
        const allOrgIds = [...new Set(usages.map(u => u.organizationId).filter((id): id is string => !!id))];

        for (const usage of usages) {
            if (usage.organizationId) {
                if (!usageByOrg[usage.organizationId]) {
                    usageByOrg[usage.organizationId] = { used: 0, limit: null };
                }
                usageByOrg[usage.organizationId].used += usage.totalTokens;
            }
        }
        
        if (allOrgIds.length === 0) return res.json(usageByOrg);
        
        const orgPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < allOrgIds.length; i += 30) {
            orgPromises.push(organizationsCollection.where(admin.firestore.FieldPath.documentId(), 'in', allOrgIds.slice(i, i + 30)).get());
        }
        const orgSnapshots = await Promise.all(orgPromises);
        const orgMap = new Map(orgSnapshots.flatMap(snap => querySnapshotToArray<DBOrganization>(snap)).map(o => [o.id, o]));

        const allPlanIds = [...new Set(Array.from(orgMap.values()).map(o => o.planId).filter((id): id is string => !!id))];
        const planMap = new Map<string, DBPlan>();
        if (allPlanIds.length > 0) {
            const planPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
            for (let i = 0; i < allPlanIds.length; i += 30) {
                planPromises.push(plansCollection.where(admin.firestore.FieldPath.documentId(), 'in', allPlanIds.slice(i, i + 30)).get());
            }
            const planSnapshots = await Promise.all(planPromises);
            planSnapshots.flatMap(snap => querySnapshotToArray<DBPlan>(snap)).forEach(p => planMap.set(p.id, p));
        }

        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;

        const activeUsersCountByOrg: { [orgId: string]: number } = {};
        const membershipPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < allOrgIds.length; i += 30) {
            membershipPromises.push(membershipsCollection.where('entityId', 'in', allOrgIds.slice(i, i + 30)).get());
        }
        const membershipSnapshots = await Promise.all(membershipPromises);
        membershipSnapshots.forEach(snap => {
            snap.forEach(doc => {
                const membership = doc.data();
                activeUsersCountByOrg[membership.entityId] = (activeUsersCountByOrg[membership.entityId] || 0) + 1;
            });
        });

        for (const orgId of allOrgIds) {
            const org = orgMap.get(orgId);
            if (org && org.planId) {
                const plan = planMap.get(org.planId);
                if (plan && plan.planType === 'subscription') {
                    const userCount = activeUsersCountByOrg[orgId] || 0;
                    const maxUsers = plan.maxUsers || userCount; // Fallback to current users if maxUsers not set
                    const limit = maxUsers * settings.subscriptionMonthlyLimit;
                    if (usageByOrg[orgId]) {
                        usageByOrg[orgId].limit = limit;
                    }
                }
            }
        }
        
        res.json(usageByOrg);
    } catch (error) {
        logger.error("Error fetching organization token usage:", error);
        res.status(500).json({ message: "Failed to fetch organization token usage." });
    }
};

export const getAcademyTokenUsage = async (req: Request, res: Response) => {
    const { year, month } = req.query as { year?: string, month?: string };
    const { startDate, endDate } = getStartAndEndDates(year, month);
    const requestingUser = req.user as JwtUserPayload;
    
    try {
        let query: admin.firestore.Query = tokenUsageCollection;

        if (startDate && endDate) {
            query = query.where('createdAt', '>=', startDate).where('createdAt', '<=', endDate);
        }
        
        if (requestingUser.role === UserRole.ACADEMY_ADMIN) {
            query = query.where('academyId', '==', requestingUser.academyId);
        }

        const snapshot = await query.get();
        if (snapshot.empty) return res.json({});
        
        const usages = snapshot.docs.map(doc => doc.data() as DBTokenUsage);
        
        const usageByAcademy: { [academyId: string]: { used: number, limit: number | null } } = {};
        for (const usage of usages) {
            if (usage.academyId) {
                if (!usageByAcademy[usage.academyId]) {
                    usageByAcademy[usage.academyId] = { used: 0, limit: 0 }; // Initialize limit to 0
                }
                usageByAcademy[usage.academyId].used += usage.totalTokens;
            }
        }
        
        const allAcademyIds = Object.keys(usageByAcademy);
        if (allAcademyIds.length === 0) return res.json(usageByAcademy);

        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;
        
        const orgQueryPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
        for (let i = 0; i < allAcademyIds.length; i += 30) {
            orgQueryPromises.push(organizationsCollection.where('academyId', 'in', allAcademyIds.slice(i, i + 30)).get());
        }
        const orgQuerySnapshots = await Promise.all(orgQueryPromises);
        const allOrgs = orgQuerySnapshots.flatMap(snap => querySnapshotToArray<DBOrganization>(snap));
        const allOrgIds = allOrgs.map(o => o.id);

        const allPlanIds = [...new Set(allOrgs.map(o => o.planId).filter((id): id is string => !!id))];
        const planMap = new Map<string, DBPlan>();
        if (allPlanIds.length > 0) {
            const planPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
            for (let i = 0; i < allPlanIds.length; i += 30) {
                planPromises.push(plansCollection.where(admin.firestore.FieldPath.documentId(), 'in', allPlanIds.slice(i, i + 30)).get());
            }
            const planSnapshots = await Promise.all(planPromises);
            planSnapshots.flatMap(snap => querySnapshotToArray<DBPlan>(snap)).forEach(p => planMap.set(p.id, p));
        }

        const activeUsersCountByOrg: { [orgId: string]: number } = {};
        if (allOrgIds.length > 0) {
            const membershipPromises: Promise<admin.firestore.QuerySnapshot>[] = [];
            for (let i = 0; i < allOrgIds.length; i += 30) {
                membershipPromises.push(membershipsCollection.where('entityId', 'in', allOrgIds.slice(i, i + 30)).get());
            }
            const membershipSnapshots = await Promise.all(membershipPromises);
            membershipSnapshots.forEach(snap => {
                snap.forEach(doc => {
                    const membership = doc.data();
                    activeUsersCountByOrg[membership.entityId] = (activeUsersCountByOrg[membership.entityId] || 0) + 1;
                });
            });
        }
        
        for (const org of allOrgs) {
            let orgLimit = 0;
            if (org.planId) {
                const plan = planMap.get(org.planId);
                if (plan && plan.planType === 'subscription') {
                    const userCount = activeUsersCountByOrg[org.id] || 0;
                    const maxUsers = plan.maxUsers || userCount;
                    orgLimit = maxUsers * settings.subscriptionMonthlyLimit;
                }
            }
            if (usageByAcademy[org.academyId]) {
                (usageByAcademy[org.academyId].limit as number) += orgLimit;
            }
        }
        
        res.json(usageByAcademy);
    } catch (error) {
        logger.error("Error fetching academy token usage:", error);
        res.status(500).json({ message: "Failed to fetch academy token usage." });
    }
};
