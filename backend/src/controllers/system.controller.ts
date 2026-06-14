import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';

import { systemSettingsCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { DBTutorialSettings } from '../types/index.js';
import { sanitizeUrl } from '../utils/sanitizer.js';

const SETTINGS_DOC_ID = 'settings';
const TUTORIALS_DOC_ID = 'tutorials';

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

// --- TUTORIAL SETTINGS ---

export const getTutorialSettings = async (_req: Request, res: Response) => {
    try {
        const doc = await systemSettingsCollection.doc(TUTORIALS_DOC_ID).get();
        if (!doc.exists) {
            return res.json({});
        }
        res.json(snapshotToData(doc));
    } catch (error) {
        logger.error("Error fetching tutorial settings:", error);
        res.status(500).json({ message: 'Failed to fetch tutorial settings.' });
    }
};

export const updateTutorialSettings = async (req: Request, res: Response) => {
    const settings = req.body as DBTutorialSettings;

    try {
        const docRef = systemSettingsCollection.doc(TUTORIALS_DOC_ID);

        const sanitizedSettings: any = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value && typeof value === 'object' && 'videoUrl' in value) {
                sanitizedSettings[key] = {
                    enabled: !!value.enabled,
                    videoUrl: sanitizeUrl(value.videoUrl),
                };
            }
        }

        await docRef.set(sanitizedSettings, { merge: true });
        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));
    } catch (error) {
        logger.error("Error updating tutorial settings:", error);
        res.status(500).json({ message: 'Failed to update tutorial settings.' });
    }
};
