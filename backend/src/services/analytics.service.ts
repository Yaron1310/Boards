
import admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { tokenUsageCollection, academyBillingCyclesCollection, usersCollection, membershipsCollection } from '../db/collections.js';
import { DBTokenUsage, DBAcademyBillingCycle, UserRole, DBMembership, DBUser } from '../types/index.js';
import { db, querySnapshotToArray, snapshotToData } from './firestore.service.js';
import { sendUsageNotificationEmail } from './email.service.js';

interface TokenUsageData {
    totalTokens: number;
}

export const logTokenUsage = async (
    userId: string,
    organizationId: string | null,
    academyId: string | null,
    model: string,
    usage: TokenUsageData,
    apiEndpoint: string
): Promise<void> => {
    if (!usage || usage.totalTokens <= 0) {
        return; // Don't log empty usage
    }

    try {
        // Log individual usage record
        const usageDocRef = tokenUsageCollection.doc();
        const usageData: Omit<DBTokenUsage, 'id'> = {
            userId,
            organizationId: organizationId || null,
            academyId: academyId || null,
            model,
            apiEndpoint,
            totalTokens: usage.totalTokens,
            createdAt: admin.firestore.Timestamp.now(),
        };
        await usageDocRef.set({ ...usageData, id: usageDocRef.id });

        // Atomically update academy-wide usage and check for notifications
        if (academyId) {
            const now = new Date();
            const cycleId = `${academyId}_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
            const cycleRef = academyBillingCyclesCollection.doc(cycleId);
            
            await db.runTransaction(async (transaction) => {
                const cycleDoc = await transaction.get(cycleRef);
                if (!cycleDoc.exists) {
                    logger.warn(`Billing cycle document ${cycleId} not found for academy ${academyId}. Cannot update usage totals.`);
                    return;
                }
                const cycle = snapshotToData<DBAcademyBillingCycle>(cycleDoc)!;
                
                const newUsage = cycle.currentTokenUsage + usage.totalTokens;
                transaction.update(cycleRef, { currentTokenUsage: admin.firestore.FieldValue.increment(usage.totalTokens) });

                // Check thresholds
                const limit = cycle.calculatedTokenLimit;
                if (limit > 0) {
                    const checkThreshold = async (threshold: number, flag: keyof DBAcademyBillingCycle) => {
                        if (!cycle[flag] && newUsage >= limit * (threshold / 100)) {
                            logger.info(`Academy ${academyId} reached ${threshold}% usage. Sending notification.`);
                            transaction.update(cycleRef, { [flag]: true });

                            // Get academy admins to notify
                            const membershipsSnapshot = await membershipsCollection
                                .where('entityId', '==', academyId)
                                .where('role', '==', UserRole.ACADEMY_ADMIN)
                                .get();
                            
                            const adminUserIds = querySnapshotToArray<DBMembership>(membershipsSnapshot).map(m => m.userId);

                            if (adminUserIds.length > 0) {
                                const adminsSnapshot = await usersCollection.where(admin.firestore.FieldPath.documentId(), 'in', adminUserIds).get();
                                const adminEmails = querySnapshotToArray<DBUser>(adminsSnapshot).map(u => u.email);
                                
                                const academyDoc = await cycleDoc.ref.parent.parent?.collection('academies').doc(academyId).get();
                                const academyName = academyDoc?.data()?.name || 'Your Academy';

                                // Send email outside transaction
                                return () => sendUsageNotificationEmail(adminEmails, academyName, threshold);
                            }
                        }
                        return null;
                    };

                    const notificationActions = await Promise.all([
                        checkThreshold(95, 'notification95Sent'),
                        checkThreshold(85, 'notification85Sent'),
                        checkThreshold(70, 'notification70Sent'),
                    ]);

                    return notificationActions.filter(Boolean); // Return functions to run after transaction
                }
            }).then(actions => {
                // Run email sending actions after the transaction commits
                if (actions && Array.isArray(actions)) {
                    actions.forEach(action => action && action());
                }
            });
        }
    } catch (error) {
        logger.error(`Failed to log token usage for user ${userId} at ${apiEndpoint}`, {
            error,
            usageData: usage,
        });
    }
};
