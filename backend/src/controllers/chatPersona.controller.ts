import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';

import { 
    chatPersonasCollection,
    organizationsCollection,
    plansCollection
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { DBChatPersona, DBOrganization, JwtUserPayload, DBPlan, UserRole } from '../types/index.js';

export const createChatPersona = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { 
        name, description, systemPrompt, extractionSettings, aiInsightPrompt, aiInsightSettings,
        includePersonalization, isInitialMessageEnabled, initialMessage, summaryInstructions, personaPreamble
    } = req.body;
    if (!name || !description || !systemPrompt) {
        return res.status(400).json({ message: 'Name, description, and system prompt are required.' });
    }

    try {
        const newDocRef = chatPersonasCollection.doc();
        const newData: Omit<DBChatPersona, 'createdAt' | 'updatedAt'> = {
            id: newDocRef.id,
            academyId: user.academyId,
            name,
            description,
            personaPreamble: personaPreamble || '',
            systemPrompt,
            extractionSettings: extractionSettings || [],
            aiInsightPrompt: aiInsightPrompt || '',
            aiInsightSettings: aiInsightSettings || [],
            status: 'active',
            includePersonalization: includePersonalization ?? false,
            isInitialMessageEnabled: isInitialMessageEnabled ?? false,
            initialMessage: initialMessage || '',
            summaryInstructions: summaryInstructions || 'present your full summary and suggestion for change.'
        };
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        await newDocRef.set({ ...newData, createdAt: timestamp, updatedAt: timestamp });
        res.status(201).json(snapshotToData(await newDocRef.get()));
    } catch (error) {
        logger.error("Error creating chat persona:", error);
        res.status(500).json({ message: "Failed to create chat persona." });
    }
};

export const getAllChatPersonasForAcademy = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await chatPersonasCollection
            .where('academyId', '==', user.academyId)
            .where('status', '!=', 'archived')
            .orderBy('createdAt', 'desc')
            .get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching chat personas:", error);
        res.status(500).json({ message: "Failed to fetch chat personas." });
    }
};

export const getAccessibleChatPersonasForUser = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        // Admins can see all non-archived personas for their academy for assignment purposes.
        if (user.role === UserRole.ACADEMY_ADMIN || user.role === UserRole.SYSTEM_ADMIN) {
             const snapshot = await chatPersonasCollection
                .where('academyId', '==', user.academyId)
                .where('status', '!=', 'archived')
                .orderBy('createdAt', 'desc')
                .get();
            return res.json(querySnapshotToArray(snapshot));
        }


        if (!user.selectedOrganizationId) {
            return res.json([]);
        }
        const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
        if (!orgDoc.exists) {
            return res.json([]);
        }

        const org = snapshotToData<DBOrganization>(orgDoc)!;
        let accessibleIds: string[] | undefined = undefined;
        let hasAllAccess = true;
        
        if (org.planId) {
            const planDoc = await plansCollection.doc(org.planId).get();
            if (planDoc.exists) {
                const plan = snapshotToData<DBPlan>(planDoc)!;
                if (plan.hasAllChatAccess === false) { 
                    hasAllAccess = false;
                    accessibleIds = plan.accessibleChatPersonaIds || [];
                }
            } else {
                 logger.warn(`Organization ${org.id} has a planId ${org.planId} that does not exist. Defaulting to granting all chat access.`);
            }
        }
        
        let personaQuery: admin.firestore.Query = chatPersonasCollection.where('academyId', '==', user.academyId).where('status', '!=', 'archived');

        if (!hasAllAccess) {
            if (org.planId) {
                personaQuery = personaQuery.where('planIds', 'array-contains', org.planId);
            } else {
                return res.json([]); // No access at all
            }
        }

        const snapshot = await personaQuery.orderBy('createdAt', 'desc').get();
        res.json(querySnapshotToArray(snapshot));

    } catch (error) {
        logger.error(`Error fetching accessible chat personas for user ${user.id}:`, error);
        res.status(500).json({ message: "Failed to fetch accessible chat personas." });
    }
};


export const getChatPersona = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const doc = await chatPersonasCollection.doc(id).get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Chat persona not found.' });
        }
        res.json(snapshotToData(doc));
    } catch (error) {
        logger.error(`Error fetching chat persona ${id}:`, error);
        res.status(500).json({ message: 'Failed to fetch chat persona.' });
    }
};

export const updateChatPersona = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const docRef = chatPersonasCollection.doc(id);
        const data = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await docRef.update(data);
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating chat persona ${id}:`, error);
        res.status(500).json({ message: 'Failed to update chat persona.' });
    }
};

export const deleteChatPersona = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { force } = req.query;
    const user = req.user as JwtUserPayload;

    try {
        const plansSnapshot = await plansCollection
            .where('academyId', '==', user.academyId)
            .where('accessibleChatPersonaIds', 'array-contains', id)
            .get();

        if (!plansSnapshot.empty) {
            if (force !== 'true') {
                const planNames = querySnapshotToArray<DBPlan>(plansSnapshot).map(p => ({ id: p.id, name: p.name }));
                return res.status(409).json({
                    message: `This AI Mentor is currently used in ${planNames.length} plan(s). Archiving it will not remove it from these plans.`,
                    dependencies: { plans: planNames }
                });
            }
        }

        if (force === 'true') {
            await chatPersonasCollection.doc(id).update({
                status: 'archived',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving chat persona ${id}:`, error);
        res.status(500).json({ message: 'Failed to archive chat persona.' });
    }
};

export const getArchivedChatPersonasForAcademy = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await chatPersonasCollection
            .where('academyId', '==', user.academyId)
            .where('status', '==', 'archived')
            .orderBy('updatedAt', 'desc')
            .get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching archived chat personas:", error);
        res.status(500).json({ message: "Failed to fetch archived chat personas." });
    }
};

export const restoreChatPersona = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const docRef = chatPersonasCollection.doc(id);
        await docRef.update({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring chat persona ${id}:`, error);
        res.status(500).json({ message: 'Failed to restore chat persona.' });
    }
};