import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';

import {
    academiesCollection,
    organizationsCollection,
    plansCollection,
    systemSettingsCollection,
    academyBillingCyclesCollection,
    membershipsCollection,
    transactionsCollection
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { db } from '../services/firestore.service.js';
import { DBAcademy, DBOrganization, DBPlan, DBSystemSettings, GrowthAllowanceTier, DBAcademyBillingCycle, JwtUserPayload, DBTransaction } from '../types/index.js';

export const createAllBillingCycles = async (req: Request, res: Response) => {
    try {
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        if (!settingsDoc.exists) {
            return res.status(500).json({ message: "System settings for token limits not found." });
        }
        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;
        const growthTiers = settings.growthAllowanceTiers || [];

        const academiesSnapshot = await academiesCollection.get();
        const academies = querySnapshotToArray<DBAcademy>(academiesSnapshot);
        const batch = db.batch();
        let cyclesCreated = 0;

        for (const academy of academies) {
            const now = new Date();
            const cycleId = `${academy.id}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
            const cycleRef = academyBillingCyclesCollection.doc(cycleId);
            const cycleDoc = await cycleRef.get();

            if (cycleDoc.exists) {
                logger.info(`Billing cycle for academy ${academy.id} already exists for this month. Skipping.`);
                continue;
            }
            
            const orgsSnapshot = await organizationsCollection.where('academyId', '==', academy.id).get();
            const orgs = querySnapshotToArray<DBOrganization>(orgsSnapshot);
            const planIds = [...new Set([
                ...orgs.map(o => o.planId).filter(Boolean),
                academy.planId
            ].filter((id): id is string => !!id))];

            let baselineUserCount = 0;
            if (planIds.length > 0) {
                const plansSnapshot = await plansCollection.where(admin.firestore.FieldPath.documentId(), 'in', planIds).get();
                const plansMap = new Map(querySnapshotToArray<DBPlan>(plansSnapshot).map(p => [p.id, p]));

                for (const org of orgs) {
                    if (org.planId) {
                        const plan = plansMap.get(org.planId);
                        if (plan && plan.planType === 'subscription') {
                            baselineUserCount += plan.maxUsers || 0;
                        }
                    }
                }
            }
            
            const tier = growthTiers.find(t => baselineUserCount >= t.minUsers && (t.maxUsers === null || baselineUserCount <= t.maxUsers));
            const growthAllowance = tier ? Math.max(baselineUserCount * tier.percentage, tier.absolute) : 0;
            
            const calculatedTokenLimit = (baselineUserCount + growthAllowance) * settings.subscriptionMonthlyLimit;

            const newCycle: DBAcademyBillingCycle = {
                id: cycleId,
                academyId: academy.id,
                billingCycleStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
                billingCycleEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
                baselineUserCount,
                growthAllowance,
                topUpUserCount: 0,
                calculatedTokenLimit,
                currentTokenUsage: 0,
                notification70Sent: false,
                notification85Sent: false,
                notification95Sent: false,
                createdAt: new Date(),
            };
            batch.set(cycleRef, newCycle);
            cyclesCreated++;
        }
        
        await batch.commit();
        logger.info(`Successfully created ${cyclesCreated} new billing cycles.`);
        res.status(201).json({ message: `Created ${cyclesCreated} new billing cycles.` });

    } catch (error) {
        logger.error("Error creating billing cycles:", error);
        res.status(500).json({ message: 'Failed to create billing cycles.' });
    }
};

export const getCurrentBillingCycle = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const now = new Date();
        const cycleId = `${user.academyId}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const cycleDoc = await academyBillingCyclesCollection.doc(cycleId).get();

        if (!cycleDoc.exists) {
            return res.status(404).json({ message: "Current billing cycle not found for this academy." });
        }
        res.json(snapshotToData(cycleDoc));
    } catch (error) {
        logger.error(`Error fetching current billing cycle for academy ${user.academyId}:`, error);
        res.status(500).json({ message: 'Failed to fetch billing data.' });
    }
};

export const topUpUsage = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { additionalUsers } = req.body as { additionalUsers: number };

    if (!additionalUsers || typeof additionalUsers !== 'number' || additionalUsers <= 0) {
        return res.status(400).json({ message: 'A positive number of additionalUsers is required.' });
    }

    try {
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        if (!settingsDoc.exists) {
            return res.status(500).json({ message: "System settings not found." });
        }
        const settings = snapshotToData<DBSystemSettings>(settingsDoc)!;

        // Cost Calculation (Simulated)
        const additionalTokens = additionalUsers * settings.subscriptionMonthlyLimit;
        const costPro = settings.costPer1000TokensPro || 0;
        const costFlash = settings.costPer1000TokensFlash || 0;
        const estimatedCost = ((additionalTokens / 1000) * ((costPro * 0.7) + (costFlash * 0.3))).toFixed(2);
        
        // In a real app, you would integrate with a payment provider here.
        // For this simulation, we assume payment is successful.
        logger.info(`Simulating successful payment of $${estimatedCost} for ${additionalUsers} additional users for academy ${user.academyId}.`);

        const now = new Date();
        const cycleId = `${user.academyId}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const cycleRef = academyBillingCyclesCollection.doc(cycleId);
        
        await db.runTransaction(async (transaction) => {
            const cycleDoc = await transaction.get(cycleRef);
            if (!cycleDoc.exists) {
                throw new Error("Current billing cycle not found.");
            }
            transaction.update(cycleRef, {
                topUpUserCount: admin.firestore.FieldValue.increment(additionalUsers),
                calculatedTokenLimit: admin.firestore.FieldValue.increment(additionalTokens)
            });
        });
        
        const transactionRef = transactionsCollection.doc();
        const newTransaction: Omit<DBTransaction, 'id'> = {
            academyId: user.academyId,
            billingCycleId: cycleId,
            amount: parseFloat(estimatedCost),
            currency: 'USD',
            description: `Top-up for ${additionalUsers} additional users.`,
            type: 'top-up',
            createdAt: new Date(),
        };
        await transactionRef.set({ ...newTransaction, id: transactionRef.id });

        const updatedCycleDoc = await cycleRef.get();
        res.status(200).json(snapshotToData(updatedCycleDoc));

    } catch (error: any) {
        logger.error(`Error processing top-up for academy ${user.academyId}:`, error);
        res.status(500).json({ message: error.message || 'Failed to process top-up.' });
    }
};