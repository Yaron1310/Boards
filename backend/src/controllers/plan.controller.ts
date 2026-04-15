import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import admin from 'firebase-admin';

import { plansCollection, organizationsCollection, chatPersonasCollection, coursesCollection } from '../db/collections.js';
import { db } from '../services/firestore.service.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBPlan, DBOrganization } from '../types/index.js';

export const createPlan = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const data: Partial<DBPlan> = req.body;
    
    if (!data.name) {
        return res.status(400).json({ message: 'Plan name is required.' });
    }

    try {
        const newDocRef = plansCollection.doc();
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        const newPlanData: Omit<DBPlan, 'createdAt' | 'updatedAt'> = {
            id: newDocRef.id,
            academyId: user.academyId,
            name: data.name,
            accessibleCourseIds: data.accessibleCourseIds || [],
            hasAllCoursesAccess: data.hasAllCoursesAccess ?? false,
            accessibleChatPersonaIds: data.accessibleChatPersonaIds || [],
            hasAllChatAccess: data.hasAllChatAccess ?? true,
            accessibleQuestionnaireIds: data.accessibleQuestionnaireIds || [],
            hasAllQuestionnairesAccess: data.hasAllQuestionnairesAccess ?? true,
            planType: data.planType || 'subscription',
            isForSingleUser: data.isForSingleUser ?? false,
            maxUsers: data.maxUsers || 1,
            accessRules: data.accessRules || {},
            priceMonthly: data.priceMonthly ? Number(data.priceMonthly) : 0,
            currency: data.currency || 'USD',
            status: 'active',
        };

        await newDocRef.set({ ...newPlanData, createdAt: timestamp, updatedAt: timestamp });

        // Fan-out: add planId to referenced chatPersonas and courses
        const planId = newDocRef.id;
        const personaIds = newPlanData.accessibleChatPersonaIds || [];
        const courseIds = newPlanData.accessibleCourseIds || [];
        if (personaIds.length > 0 || courseIds.length > 0) {
            const fanOutBatch = db.batch();
            for (const personaId of personaIds) {
                fanOutBatch.update(chatPersonasCollection.doc(personaId), {
                    planIds: admin.firestore.FieldValue.arrayUnion(planId)
                });
            }
            for (const courseId of courseIds) {
                fanOutBatch.update(coursesCollection.doc(courseId), {
                    planIds: admin.firestore.FieldValue.arrayUnion(planId)
                });
            }
            await fanOutBatch.commit();
        }

        res.status(201).json(snapshotToData(await newDocRef.get()));
    } catch (error) {
        logger.error("Error creating plan:", error);
        res.status(500).json({ message: "Failed to create plan." });
    }
};

export const getAllPlansForAcademy = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await plansCollection.where('academyId', '==', user.academyId).orderBy('name').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching plans for academy:", error);
        res.status(500).json({ message: "Failed to fetch plans." });
    }
};

export const updatePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const data: Partial<DBPlan> = req.body;
    try {
        const docRef = plansCollection.doc(id);
        const updateData: any = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        
        // Ensure price is stored as number if updated
        if (updateData.priceMonthly !== undefined) {
            updateData.priceMonthly = Number(updateData.priceMonthly);
        }

        // Read old plan to diff accessible IDs for planIds[] fan-out
        const oldPlanDoc = await docRef.get();
        const oldPlan = oldPlanDoc.exists ? snapshotToData<DBPlan>(oldPlanDoc)! : null;

        await docRef.update(updateData);

        // Fan-out: update planIds on chatPersonas and courses
        if (oldPlan) {
            const fanOutBatch = db.batch();
            let hasFanOutChanges = false;

            if (data.accessibleChatPersonaIds !== undefined) {
                const oldIds = new Set(oldPlan.accessibleChatPersonaIds || []);
                const newIds = new Set(data.accessibleChatPersonaIds || []);
                for (const removedId of oldIds) {
                    if (!newIds.has(removedId)) {
                        fanOutBatch.update(chatPersonasCollection.doc(removedId), {
                            planIds: admin.firestore.FieldValue.arrayRemove(id)
                        });
                        hasFanOutChanges = true;
                    }
                }
                for (const addedId of newIds) {
                    if (!oldIds.has(addedId)) {
                        fanOutBatch.update(chatPersonasCollection.doc(addedId), {
                            planIds: admin.firestore.FieldValue.arrayUnion(id)
                        });
                        hasFanOutChanges = true;
                    }
                }
            }

            if (data.accessibleCourseIds !== undefined) {
                const oldIds = new Set(oldPlan.accessibleCourseIds || []);
                const newIds = new Set(data.accessibleCourseIds || []);
                for (const removedId of oldIds) {
                    if (!newIds.has(removedId)) {
                        fanOutBatch.update(coursesCollection.doc(removedId), {
                            planIds: admin.firestore.FieldValue.arrayRemove(id)
                        });
                        hasFanOutChanges = true;
                    }
                }
                for (const addedId of newIds) {
                    if (!oldIds.has(addedId)) {
                        fanOutBatch.update(coursesCollection.doc(addedId), {
                            planIds: admin.firestore.FieldValue.arrayUnion(id)
                        });
                        hasFanOutChanges = true;
                    }
                }
            }

            if (hasFanOutChanges) {
                await fanOutBatch.commit();
            }
        }

        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating plan ${id}:`, error);
        res.status(500).json({ message: 'Failed to update plan.' });
    }
};

export const deletePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { force } = req.query;

    try {
        // Check for dependent organizations
        const orgsSnapshot = await organizationsCollection.where('planId', '==', id).get();

        if (!orgsSnapshot.empty) {
            if (force !== 'true') {
                const organizations = querySnapshotToArray<DBOrganization>(orgsSnapshot);
                const orgNames = organizations.map(org => ({ id: org.id, name: org.name }));
                logger.warn(`Archive attempt failed for plan ${id}: It is assigned to ${orgNames.length} organization(s).`);
                return res.status(409).json({ 
                    message: `This plan is currently assigned to ${orgNames.length} organization(s).`,
                    dependencies: { organizations: orgNames }
                });
            }
        }

        if (force === 'true') {
            // Perform soft delete (archive)
            await plansCollection.doc(id).update({
                status: 'archived',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Fan-out: remove planId from all referenced chatPersonas and courses
            const planDoc = await plansCollection.doc(id).get();
            if (planDoc.exists) {
                const plan = snapshotToData<DBPlan>(planDoc)!;
                const fanOutBatch = db.batch();
                let hasFanOutChanges = false;
                for (const personaId of (plan.accessibleChatPersonaIds || [])) {
                    fanOutBatch.update(chatPersonasCollection.doc(personaId), {
                        planIds: admin.firestore.FieldValue.arrayRemove(id)
                    });
                    hasFanOutChanges = true;
                }
                for (const courseId of (plan.accessibleCourseIds || [])) {
                    fanOutBatch.update(coursesCollection.doc(courseId), {
                        planIds: admin.firestore.FieldValue.arrayRemove(id)
                    });
                    hasFanOutChanges = true;
                }
                if (hasFanOutChanges) await fanOutBatch.commit();
            }

            logger.info(`Successfully archived plan ${id}.`);
        }
        
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving plan ${id}:`, error);
        res.status(500).json({ message: 'Failed to archive plan.' });
    }
};

export const getArchivedPlans = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await plansCollection
            .where('academyId', '==', user.academyId)
            .where('status', '==', 'archived')
            .orderBy('updatedAt', 'desc')
            .get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching archived plans:", error);
        res.status(500).json({ message: "Failed to fetch archived plans." });
    }
};

export const restorePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const docRef = plansCollection.doc(id);
        await docRef.update({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Fan-out: re-add planId to all referenced chatPersonas and courses
        const planDoc = await docRef.get();
        if (planDoc.exists) {
            const plan = snapshotToData<DBPlan>(planDoc)!;
            const fanOutBatch = db.batch();
            let hasFanOutChanges = false;
            for (const personaId of (plan.accessibleChatPersonaIds || [])) {
                fanOutBatch.update(chatPersonasCollection.doc(personaId), {
                    planIds: admin.firestore.FieldValue.arrayUnion(id)
                });
                hasFanOutChanges = true;
            }
            for (const courseId of (plan.accessibleCourseIds || [])) {
                fanOutBatch.update(coursesCollection.doc(courseId), {
                    planIds: admin.firestore.FieldValue.arrayUnion(id)
                });
                hasFanOutChanges = true;
            }
            if (hasFanOutChanges) await fanOutBatch.commit();
        }

        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring plan ${id}:`, error);
        res.status(500).json({ message: 'Failed to restore plan.' });
    }
};