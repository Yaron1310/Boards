import type { Request, Response, NextFunction } from 'express';
import * as logger from "firebase-functions/logger";

import { academySettingsCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { DBAcademySettings } from '../types/index.js';

export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const key = authHeader?.split(' ')[1];

    if (!key) {
        return res.status(401).json({ message: "API key is missing from Authorization header." });
    }

    try {
        const snapshot = await academySettingsCollection.where('apiKey', '==', key).limit(1).get();
        if (snapshot.empty) {
            logger.warn("Invalid API key received.", { key });
            return res.status(401).json({ message: "Invalid API key." });
        }
        const settings = snapshotToData<DBAcademySettings>(snapshot.docs[0])!;
        req.academyId = settings.id; // Academy ID is the document ID of settings
        next();
    } catch (error) {
        logger.error("Server error during API key authentication:", error);
        res.status(500).json({ message: "Server error during API key authentication." });
    }
};
