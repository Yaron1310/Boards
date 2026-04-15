import type { Request, Response, NextFunction } from 'express';
import * as logger from "firebase-functions/logger";
import { academiesCollection, organizationsCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBAcademy, DBOrganization, UserRole } from '../types/index.js';

export const verifyActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as JwtUserPayload;

    // System admins bypass this check entirely
    if (user.role === UserRole.SYSTEM_ADMIN) {
        return next();
    }

    // Regular users and managers are covered by their academy's status
    if (!user.academyId) {
        logger.warn(`User ${user.id} in role ${user.role} attempted an AI action without an academyId in their token.`);
        return res.status(403).json({ message: "You are not part of an academy." });
    }

    try {
        const academyDoc = await academiesCollection.doc(user.academyId).get();

        if (!academyDoc.exists) {
            logger.warn(`Academy ${user.academyId} not found for user ${user.id}.`);
            return res.status(403).json({ message: "Your academy could not be found." });
        }

        const academy = snapshotToData<DBAcademy>(academyDoc)!;

        // The default status is active if the field is missing (for backward compatibility)
        const academyStatus = academy.subscriptionStatus || 'active';

        if (academyStatus !== 'active') {
            logger.warn(`Blocked AI feature for academy ${user.academyId} due to inactive subscription status: '${academyStatus}'.`);
            return res.status(403).json({ message: "AI features are disabled due to a billing issue with your academy. Please contact your administrator." });
        }

        // Check organization-level subscription status
        if (user.selectedOrganizationId) {
            const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
            if (orgDoc.exists) {
                const org = snapshotToData<DBOrganization>(orgDoc)!;
                const orgStatus = org.subscriptionStatus || 'active';
                if (orgStatus !== 'active' && orgStatus !== 'trialing') {
                    logger.warn(`Blocked AI feature for user ${user.id} in org ${user.selectedOrganizationId} due to inactive org subscription: '${orgStatus}'.`);
                    return res.status(403).json({
                        message: "Your organization's subscription is no longer active. AI features are unavailable.",
                        code: 'ORG_SUBSCRIPTION_INACTIVE',
                        academyId: user.academyId
                    });
                }
            }
        }

        // If all checks pass, proceed
        next();

    } catch (error) {
        logger.error(`Error verifying subscription status for academy ${user.academyId}:`, error);
        return res.status(500).json({ message: "An internal error occurred while verifying your subscription." });
    }
};
