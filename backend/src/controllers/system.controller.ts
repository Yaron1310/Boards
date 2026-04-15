import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';

import { systemSettingsCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';
import { DBSystemSettings, DBTutorialSettings } from '../types/index.js';
import { sanitizeUrl } from '../utils/sanitizer.js';

const TOKEN_LIMITS_DOC_ID = 'tokenLimits';
const TUTORIALS_DOC_ID = 'tutorials';

export const getTokenLimits = async (req: Request, res: Response) => {
    try {
        const doc = await systemSettingsCollection.doc(TOKEN_LIMITS_DOC_ID).get();
        if (!doc.exists) {
            // This should ideally not happen if seeding is correct, but good to handle.
            return res.status(404).json({ message: 'Token limit settings not found.' });
        }
        res.json(snapshotToData(doc));
    } catch (error) {
        logger.error("Error fetching token limits:", error);
        res.status(500).json({ message: 'Failed to fetch token limits.' });
    }
};

export const updateTokenLimits = async (req: Request, res: Response) => {
    const { 
        oneTimeTokensPerLesson, oneTimeGeneralTokens, subscriptionMonthlyLimit,
        geminiProModelName, geminiFlashModelName, costPer1000TokensPro, costPer1000TokensFlash,
        globalSystemPrompt, growthAllowanceTiers,
        rawCostPer1000TokensPro, profitMarginPer1000TokensPro,
        rawCostPer1000TokensFlash, profitMarginPer1000TokensFlash
    } = req.body as DBSystemSettings;

    // Validation: Check types of fields that are present, without requiring them
    if (
        (oneTimeTokensPerLesson !== undefined && typeof oneTimeTokensPerLesson !== 'number') ||
        (oneTimeGeneralTokens !== undefined && typeof oneTimeGeneralTokens !== 'number') ||
        (subscriptionMonthlyLimit !== undefined && typeof subscriptionMonthlyLimit !== 'number') ||
        (costPer1000TokensPro !== undefined && typeof costPer1000TokensPro !== 'number') ||
        (costPer1000TokensFlash !== undefined && typeof costPer1000TokensFlash !== 'number') ||
        (rawCostPer1000TokensPro !== undefined && typeof rawCostPer1000TokensPro !== 'number') ||
        (profitMarginPer1000TokensPro !== undefined && typeof profitMarginPer1000TokensPro !== 'number') ||
        (rawCostPer1000TokensFlash !== undefined && typeof rawCostPer1000TokensFlash !== 'number') ||
        (profitMarginPer1000TokensFlash !== undefined && typeof profitMarginPer1000TokensFlash !== 'number')
    ) {
        return res.status(400).json({ message: 'Numeric token limit fields must be valid numbers.' });
    }
    
    if (typeof geminiProModelName !== 'string' || typeof geminiFlashModelName !== 'string') {
        return res.status(400).json({ message: 'Model names are required and must be strings.' });
    }
    
    try {
        const docRef = systemSettingsCollection.doc(TOKEN_LIMITS_DOC_ID);
        const dataToUpdate: Partial<DBSystemSettings> = {
            oneTimeTokensPerLesson,
            oneTimeGeneralTokens,
            subscriptionMonthlyLimit,
            geminiProModelName,
            geminiFlashModelName,
            costPer1000TokensPro,
            costPer1000TokensFlash,
            globalSystemPrompt,
            growthAllowanceTiers,
            rawCostPer1000TokensPro,
            profitMarginPer1000TokensPro,
            rawCostPer1000TokensFlash,
            profitMarginPer1000TokensFlash
        };

        // FIX: Remove any keys that have an `undefined` value to prevent Firestore errors.
        // The Admin SDK cannot serialize `undefined`.
        Object.keys(dataToUpdate).forEach(key => {
            if (dataToUpdate[key as keyof typeof dataToUpdate] === undefined) {
                delete dataToUpdate[key as keyof typeof dataToUpdate];
            }
        });

        await docRef.set(dataToUpdate, { merge: true });
        
        const updatedDoc = await docRef.get();
        res.json(snapshotToData(updatedDoc));

    } catch (error: any) {
        logger.error("Error updating token limits:", error);
        res.status(500).json({ message: 'Failed to update token limits.' });
    }
};

// --- TUTORIAL SETTINGS ---

export const getTutorialSettings = async (req: Request, res: Response) => {
    try {
        const doc = await systemSettingsCollection.doc(TUTORIALS_DOC_ID).get();
        // If not exists, return empty object/defaults rather than 404 so frontend handles it gracefully
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
        
        // Sanitize URLs in the incoming object
        const sanitizedSettings: any = {};
        for (const [key, value] of Object.entries(settings)) {
            if (value && typeof value === 'object' && 'videoUrl' in value) {
                sanitizedSettings[key] = {
                    enabled: !!value.enabled,
                    videoUrl: sanitizeUrl(value.videoUrl)
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