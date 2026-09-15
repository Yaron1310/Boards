import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';

import { systemSettingsCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';

const SETTINGS_DOC_ID = 'settings';

export const getSystemSettings = async (_req: Request, res: Response) => {
    try {
        const doc = await systemSettingsCollection.doc(SETTINGS_DOC_ID).get();
        if (!doc.exists) {
            return res.json({});
        }
        res.json(snapshotToData(doc));
    } catch (error) {
        logger.error("Error fetching system settings:", error);
        res.status(500).json({ message: 'Failed to fetch system settings.' });
    }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
    try {
        const docRef = systemSettingsCollection.doc(SETTINGS_DOC_ID);
        await docRef.set(req.body, { merge: true });
        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error: any) {
        logger.error("Error updating system settings:", error);
        res.status(500).json({ message: 'Failed to update system settings.' });
    }
};

