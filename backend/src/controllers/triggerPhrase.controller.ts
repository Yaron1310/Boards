import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { triggerPhrasesCollection } from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';

export const getAllTriggerPhrases = async (req: Request, res: Response) => {
    try {
        const snapshot = await triggerPhrasesCollection.orderBy('language').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching trigger phrases:", error);
        res.status(500).json({ message: "Failed to fetch trigger phrases." });
    }
};

export const createTriggerPhrase = async (req: Request, res: Response) => {
    const { language, phrase } = req.body;
    const newDocRef = triggerPhrasesCollection.doc();
    const newPhrase = { 
        id: newDocRef.id, 
        language, 
        phrase, 
        createdAt: admin.firestore.FieldValue.serverTimestamp() 
    };
    await newDocRef.set(newPhrase);
    res.status(201).json(snapshotToData(await newDocRef.get()));
};

export const updateTriggerPhrase = async (req: Request, res: Response) => {
    const docRef = triggerPhrasesCollection.doc(req.params.id);
    const { language, phrase } = req.body;
    try {
        await docRef.update({ language, phrase });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating trigger phrase ${req.params.id}:`, error);
        res.status(500).json({ message: "Failed to update trigger phrase." });
    }
};

export const deleteTriggerPhrase = async (req: Request, res: Response) => {
    try {
        await triggerPhrasesCollection.doc(req.params.id).delete();
        res.status(204).send();
    } catch (error) {
        logger.error(`Error deleting trigger phrase ${req.params.id}:`, error);
        res.status(500).json({ message: "Failed to delete trigger phrase." });
    }
};
