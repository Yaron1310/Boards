import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { organizationsCollection } from '../db/collections.js';

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
