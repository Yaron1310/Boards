import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { db } from '../services/firestore.service.js';
import {
    questionnairesCollection,
    userQuestionnaireResultsCollection,
    systemSettingsCollection,
    plansCollection
} from '../db/collections.js';
import { querySnapshotToArray, snapshotToData } from '../services/firestore.service.js';
import { JwtUserPayload, DBQuestionnaire, DBCategory, DBQuestion, DBUserQuestionnaireResult, DBSystemSettings, DBPlan, PaginatedResponse } from '../types/index.js';
import { sanitizeText, sanitizeUrl, normalizeVideoUrl } from '../utils/sanitizer.js';
import { parsePaginationParams } from '../utils/pagination.js';
import { getAi } from '../services/gemini.service.js';
import { env } from '../config/env.js';
import { Type } from '@google/genai';
import { logTokenUsage } from '../services/analytics.service.js';

// --- User-facing Controllers ---

// GET /questionnaires
export const getPublishedQuestionnaires = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const { limit, cursor, search } = parsePaginationParams(req);

        let query: admin.firestore.Query = questionnairesCollection
            .where('academyId', '==', user.academyId)
            .where('status', '!=', 'archived')
            .orderBy('createdAt', 'desc');

        if (cursor) {
            const startDoc = await questionnairesCollection.doc(cursor).get();
            if (startDoc.exists) {
                query = query.startAfter(startDoc);
            }
        }

        query = query.limit(limit + 1);

        const snapshot = await query.get();
        let questionnaires = querySnapshotToArray<DBQuestionnaire>(snapshot);

        // Apply search filter on name
        if (search) {
            questionnaires = questionnaires.filter(q => q.name.toLowerCase().includes(search));
        }

        const questionnairesWithCounts = questionnaires.map(q => ({
            ...q,
            categoryCount: q.categoryCount ?? 0,
        }));

        const hasMore = questionnairesWithCounts.length > limit;
        const data = hasMore ? questionnairesWithCounts.slice(0, limit) : questionnairesWithCounts;
        const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

        res.json({ data, cursor: nextCursor, hasMore } as PaginatedResponse<any>);
    } catch (error) {
        logger.error("Error fetching published questionnaires:", error);
        res.status(500).json({ message: 'Failed to fetch questionnaires.' });
    }
};

// GET /questionnaires/:questionnaireId
export const getQuestionnaireForUser = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { questionnaireId } = req.params;
    try {
        const questionnaireDoc = await questionnairesCollection.doc(questionnaireId).get();
        if (!questionnaireDoc.exists || questionnaireDoc.data()?.academyId !== user.academyId) {
            return res.status(404).json({ message: 'Questionnaire not found.' });
        }
        const questionnaire = snapshotToData<DBQuestionnaire>(questionnaireDoc)!;

        const categoriesSnapshot = await questionnairesCollection.doc(questionnaireId).collection('categories').orderBy('order').get();
        const categories = querySnapshotToArray<DBCategory>(categoriesSnapshot);

        // Fetch all questions for this questionnaire in one collection group query instead of N+1
        const allQuestionsSnapshot = await db.collectionGroup('questions')
            .where('questionnaireId', '==', questionnaireId)
            .orderBy('order')
            .get();
        const allQuestions = querySnapshotToArray<DBQuestion>(allQuestionsSnapshot);

        // Group questions by categoryId
        const questionsByCategory = new Map<string, Omit<DBQuestion, 'correctAnswerText'>[]>();
        for (const q of allQuestions) {
            const { correctAnswerText, ...rest } = q;
            const catId = q.categoryId;
            if (!questionsByCategory.has(catId)) questionsByCategory.set(catId, []);
            questionsByCategory.get(catId)!.push(rest);
        }

        const categoriesWithQuestions = categories.map(cat => ({
            ...cat,
            questions: questionsByCategory.get(cat.id) || [],
        }));

        res.json({ ...questionnaire, categories: categoriesWithQuestions });
    } catch (error) {
        logger.error(`Error fetching questionnaire ${questionnaireId} for user:`, error);
        res.status(500).json({ message: 'Failed to fetch questionnaire details.' });
    }
};

// POST /questionnaires/:questionnaireId/results
export const saveQuestionnaireResults = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { questionnaireId } = req.params;
    const { categoryScores, topCategories, responses, source } = req.body;
    const resultSource: 'standalone' | 'assignment' = source === 'assignment' ? 'assignment' : 'standalone';

    if (!categoryScores && !responses) {
        return res.status(400).json({ message: 'Results data is required.' });
    }

    try {
        const questionnaireDoc = await questionnairesCollection.doc(questionnaireId).get();
        if (!questionnaireDoc.exists) {
            return res.status(404).json({ message: 'Questionnaire not found.' });
        }
        const questionnaireData = snapshotToData<DBQuestionnaire>(questionnaireDoc)!;
        const questionnaireName = questionnaireData.name || 'Untitled Questionnaire';

        let finalScore = 0;
        let isPassed = false;
        let processedResponses: any[] = [];
        let totalUsageMetadata = { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
        let proModel = env.GEMINI_PRO_MODEL; // Default value

        // --- Custom Quiz Grading Logic ---
        if (questionnaireData.type === 'custom' && responses && Array.isArray(responses)) {
            // 1. Fetch full question data in one collection group query (for correct answers/weights)
            const allQuestionsSnapshot = await db.collectionGroup('questions')
                .where('questionnaireId', '==', questionnaireId)
                .get();
            const allQuestions: DBQuestion[] = allQuestionsSnapshot.docs.map(q => snapshotToData<DBQuestion>(q)!);

            const questionMap = new Map(allQuestions.map(q => [q.id, q]));
            
            // Fetch model from settings
            const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
            const settings = snapshotToData<DBSystemSettings>(settingsDoc);
            proModel = settings?.geminiProModelName || env.GEMINI_PRO_MODEL;

            // Calculate weights
            const totalFixedScore = allQuestions.reduce((sum, q) => sum + (q.customScore || 0), 0);
            const autoQuestionsCount = allQuestions.filter(q => !q.customScore).length;
            const remainingPct = Math.max(0, 100 - totalFixedScore);
            const autoScorePerQuestion = autoQuestionsCount > 0 ? remainingPct / autoQuestionsCount : 0;

            let totalPointsEarned = 0;
            const ai = getAi();

            // 2. Grade each response
            for (const resp of responses) {
                const questionDef = questionMap.get(resp.questionId);
                if (!questionDef) continue; // Skip if question no longer exists

                const weight = questionDef.customScore || autoScorePerQuestion;
                let pointsEarned = 0;
                let isCorrect = false;
                let correctAnswerText = '';
                let feedback = '';

                if (questionDef.type === 'open_text') {
                    // --- AI Grading for Open Text ---
                    const userAnswer = resp.answerText || '';
                    correctAnswerText = questionDef.correctAnswerText || '';

                    // DEBUG LOGGING START
                    logger.info(`[Grading Debug] Open Text Question ID: ${questionDef.id}`);
                    logger.info(`[Grading Debug] User Answer: "${userAnswer}"`);
                    logger.info(`[Grading Debug] Admin Ideal Answer: "${correctAnswerText}"`);
                    // DEBUG LOGGING END

                    if (correctAnswerText && userAnswer.trim().length > 0) {
                        try {
                            const gradingSystemInstruction = `You are an automated grading assistant for an educational platform. Your task is to evaluate a student's answer against a provided ideal answer.
                            
Analyze the "Ideal Answer" and identify distinct key facts or concepts required.
Compare the "Student Answer" against these facts.
1. Calculate the percentage of key facts correctly included in the student answer (0 to 100).
2. Provide concise, constructive feedback explaining why the score was given.
   - If points were deducted, explain clearly what was missing or incorrect based on the Ideal Answer.
   - If full points were awarded, confirm they captured the key concepts.
   - Keep feedback direct and helpful for the student.

Return ONLY a valid JSON object with the properties "percentage" (integer) and "feedback" (string).`;

                            const gradingPrompt = `Question: "${questionDef.text}"
Ideal Answer: "${correctAnswerText}"
Student Answer: "${userAnswer}"`;

                            logger.info(`[Grading Debug] Sending to AI for grading...`);

                            const gradingResponse = await ai.models.generateContent({
                                model: proModel,
                                contents: [{ role: "user", parts: [{ text: gradingPrompt }] }],
                                config: { 
                                    responseMimeType: "application/json", 
                                    systemInstruction: gradingSystemInstruction,
                                    responseSchema: {
                                        type: Type.OBJECT,
                                        properties: { 
                                            percentage: { type: Type.INTEGER },
                                            feedback: { type: Type.STRING }
                                        },
                                        required: ["percentage", "feedback"]
                                    }
                                }
                            });

                            if (gradingResponse.usageMetadata) {
                                totalUsageMetadata.promptTokenCount += gradingResponse.usageMetadata.promptTokenCount ?? 0;
                                totalUsageMetadata.candidatesTokenCount += gradingResponse.usageMetadata.candidatesTokenCount ?? 0;
                                totalUsageMetadata.totalTokenCount += gradingResponse.usageMetadata.totalTokenCount ?? 0;
                            }

                            const jsonStr = (gradingResponse.text ?? '').trim();
                            logger.info(`[Grading Debug] Raw AI Response: ${jsonStr}`);

                            const parsed = JSON.parse(jsonStr);
                            const percent = Math.min(100, Math.max(0, parsed.percentage || 0));
                            feedback = parsed.feedback || '';
                            
                            logger.info(`[Grading Debug] Parsed Percentage: ${percent}%`);
                            
                            pointsEarned = (percent / 100) * weight;
                            isCorrect = percent >= 70; // Arbitrary threshold for "Correct" flag, though score is granular

                        } catch (aiError) {
                            logger.error(`AI Grading failed for question ${questionDef.id}:`, aiError);
                            // Fallback: Participation points if AI fails but user answered
                            pointsEarned = weight; 
                            isCorrect = true;
                            feedback = "Grading service unavailable. Full points awarded for participation.";
                            logger.info(`[Grading Debug] Fallback triggered due to AI Error. Full points awarded.`);  
                        }
                    } else if (userAnswer.trim().length > 0) {
                        // Fallback if no correct answer set by admin but user answered
                        pointsEarned = weight;
                        isCorrect = true;
                        feedback = "Full points awarded.";
                        logger.info(`[Grading Debug] Fallback triggered: No ideal answer set by admin. Full points awarded.`);
                    } else {
                        logger.info(`[Grading Debug] Empty answer or no text provided. 0 points.`);
                        feedback = "No answer provided.";
                    }
                } else {
                    // --- Multiple Choice Grading ---
                    if (resp.answerId === questionDef.correctAnswerId) {
                        pointsEarned = weight;
                        isCorrect = true;
                    }
                    // For MC, correctAnswerText in response can be the text of the correct option
                    if (questionDef.correctAnswerId) {
                        correctAnswerText = questionDef.answers.find(a => a.id === questionDef.correctAnswerId)?.text || '';
                    }
                }

                totalPointsEarned += pointsEarned;
                
                processedResponses.push({
                    questionId: resp.questionId,
                    questionText: questionDef.text,
                    answerId: resp.answerId || null,
                    answerText: resp.answerText || null,
                    correctAnswerText: correctAnswerText || null,
                    isCorrect,
                    pointsEarned: parseFloat(pointsEarned.toFixed(2)),
                    feedback: feedback || null
                });
            }

            finalScore = Math.min(100, Math.round(totalPointsEarned));
            const passingScore = questionnaireData.passingScore || 0;
            isPassed = finalScore >= passingScore;
        }

        // --- Log Token Usage ---
        if (totalUsageMetadata.totalTokenCount > 0) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId,
                user.academyId,
                proModel,
                { totalTokens: totalUsageMetadata.totalTokenCount },
                '/api/questionnaires/grade'
            );
        }

        const existingResultSnapshot = await userQuestionnaireResultsCollection
            .where('userId', '==', user.id)
            .where('questionnaireId', '==', questionnaireId)
            .where('source', '==', resultSource)
            .limit(1)
            .get();

        const resultData: any = {
            userId: user.id,
            questionnaireId,
            questionnaireName,
            source: resultSource,
            completedAt: new Date(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (questionnaireData.type === 'custom') {
            resultData.score = finalScore;
            resultData.passed = isPassed;
            resultData.responses = processedResponses;
            // Clear categorical fields if any exist
            resultData.categoryScores = [];
            resultData.topCategories = [];
        } else {
            // Categorical - trust frontend calc as logic is deterministic and simple math
            if (categoryScores) resultData.categoryScores = categoryScores;
             // Check the flag before saving topCategories
            if (topCategories && questionnaireData.resultSettings?.saveToInsights === true) {
                resultData.topCategories = topCategories;
            } else {
                resultData.topCategories = []; // Save empty array if flag is false or undefined
            }
        }
        
        if (existingResultSnapshot.empty) {
            const newResultRef = userQuestionnaireResultsCollection.doc();
            await newResultRef.set({ ...resultData, id: newResultRef.id });
            res.status(201).json(snapshotToData(await newResultRef.get()));
        } else {
            const existingResultRef = existingResultSnapshot.docs[0].ref;
            await existingResultRef.update(resultData);
            res.status(200).json(snapshotToData(await existingResultRef.get()));
        }
    } catch (error) {
        logger.error(`Error saving questionnaire results for user ${user.id}:`, error);
        res.status(500).json({ message: 'Failed to save results.' });
    }
};

// GET /questionnaires/:questionnaireId/results/latest
export const getLatestQuestionnaireResults = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { questionnaireId } = req.params;
    const { source } = req.query as { source?: string };
    try {
        let query = userQuestionnaireResultsCollection
            .where('userId', '==', user.id)
            .where('questionnaireId', '==', questionnaireId);

        if (source === 'standalone' || source === 'assignment') {
            query = query.where('source', '==', source) as any;
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return res.status(200).json(null);
        }

        const results = querySnapshotToArray<DBUserQuestionnaireResult>(snapshot);
        // Sort descending by completedAt
        results.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

        res.json(results[0]);
    } catch (error) {
        logger.error(`Error fetching latest result for questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to fetch latest result.' });
    }
};

// GET /questionnaire-results/my-latest
export const getMyLatestResults = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    try {
        // Use Firestore filter instead of in-memory filter for isArchivedByUser
        const snapshot = await userQuestionnaireResultsCollection
            .where('userId', '==', userId)
            .where('isArchivedByUser', '!=', true)
            .orderBy('completedAt', 'desc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        const allResults = querySnapshotToArray<DBUserQuestionnaireResult>(snapshot);
        const latestResults = Array.from(
            allResults.reduce((map, result) => {
                const key = `${result.questionnaireId}_${result.source || 'standalone'}`;
                if (!map.has(key) || map.get(key)!.completedAt < result.completedAt) {
                    map.set(key, result);
                }
                return map;
            }, new Map<string, DBUserQuestionnaireResult>()).values()
        );

        res.json(latestResults);
    } catch (error) {
        logger.error(`Error fetching all latest results for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to fetch results.' });
    }
};

// PUT /questionnaire-results/:resultId/archive
export const archiveQuestionnaireResult = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    const { resultId } = req.params;
    try {
        const docRef = userQuestionnaireResultsCollection.doc(resultId);
        const doc = await docRef.get();
        if (!doc.exists || doc.data()?.userId !== userId) {
            return res.status(404).json({ message: 'Result not found.' });
        }
        await docRef.update({ isArchivedByUser: true });
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving questionnaire result ${resultId}:`, error);
        res.status(500).json({ message: 'Failed to archive result.' });
    }
};

// GET /questionnaire-results/my-archived
export const getMyArchivedResults = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    try {
        const snapshot = await userQuestionnaireResultsCollection
            .where('userId', '==', userId)
            .where('isArchivedByUser', '==', true)
            .orderBy('completedAt', 'desc')
            .get();
        res.json(querySnapshotToArray<DBUserQuestionnaireResult>(snapshot));
    } catch (error) {
        logger.error(`Error fetching archived results for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to fetch archived results.' });
    }
};

// PUT /questionnaire-results/:resultId/restore
export const restoreQuestionnaireResult = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    const { resultId } = req.params;
    try {
        const docRef = userQuestionnaireResultsCollection.doc(resultId);
        const doc = await docRef.get();
        if (!doc.exists || doc.data()?.userId !== userId) {
            return res.status(404).json({ message: 'Result not found.' });
        }
        await docRef.update({ isArchivedByUser: false });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring questionnaire result ${resultId}:`, error);
        res.status(500).json({ message: 'Failed to restore result.' });
    }
};


// --- Admin-only Controllers ---

// GET /admin/questionnaires
export const getQuestionnairesForAdmin = async (req: Request, res: Response) => {
    return getPublishedQuestionnaires(req, res);
};

// POST /admin/questionnaires
export const createQuestionnaire = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { name, description, resultSettings, type, passingScore } = req.body;
    try {
        const newDocRef = questionnairesCollection.doc();
        const data: Omit<DBQuestionnaire, 'createdAt' | 'updatedAt'> = {
            id: newDocRef.id,
            academyId: user.academyId,
            name: sanitizeText(name),
            description: sanitizeText(description),
            type: type || 'categorical',
            ...(passingScore !== undefined && passingScore !== null && { passingScore: Number(passingScore) }),
            status: 'active',
            categoryCount: 0,
            resultSettings: {
                showGraph: resultSettings?.showGraph ?? true,
                numberOfTopCategories: resultSettings?.numberOfTopCategories ?? 2,
                includeTies: resultSettings?.includeTies ?? false,
                saveToInsights: resultSettings?.saveToInsights ?? false,
            }
        };
        const timestamp = admin.firestore.FieldValue.serverTimestamp();
        await newDocRef.set({ ...data, createdAt: timestamp, updatedAt: timestamp });
        res.status(201).json(snapshotToData(await newDocRef.get()));
    } catch (error) {
        logger.error("Error creating questionnaire:", error);
        res.status(500).json({ message: 'Failed to create questionnaire.' });
    }
};

// PUT /admin/questionnaires/:questionnaireId
export const updateQuestionnaire = async (req: Request, res: Response) => {
    const { questionnaireId } = req.params;
    const { name, description, resultSettings, type, passingScore } = req.body;
    try {
        const docRef = questionnairesCollection.doc(questionnaireId);
        const data: any = {
            name: sanitizeText(name),
            description: sanitizeText(description),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if(type) data.type = type;
        if(passingScore !== undefined) data.passingScore = Number(passingScore);
        if(resultSettings) data.resultSettings = resultSettings;

        await docRef.update(data);
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to update questionnaire.' });
    }
};

// DELETE /admin/questionnaires/:questionnaireId
export const deleteQuestionnaire = async (req: Request, res: Response) => {
    const { questionnaireId } = req.params;
    const { force } = req.query;
    const user = req.user as JwtUserPayload;

    try {
        const plansSnapshot = await plansCollection
            .where('academyId', '==', user.academyId)
            .where('accessibleQuestionnaireIds', 'array-contains', questionnaireId)
            .get();

        if (!plansSnapshot.empty) {
            if (force !== 'true') {
                const planNames = querySnapshotToArray<DBPlan>(plansSnapshot).map(p => ({ id: p.id, name: p.name }));
                return res.status(409).json({
                    message: `This questionnaire is currently used in ${planNames.length} plan(s). Archiving it will not remove it from these plans.`,
                    dependencies: { plans: planNames }
                });
            }
        }
        
        if (force === 'true') {
            await questionnairesCollection.doc(questionnaireId).update({
                status: 'archived',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to archive questionnaire.' });
    }
};

export const getArchivedQuestionnaires = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await questionnairesCollection
            .where('academyId', '==', user.academyId)
            .where('status', '==', 'archived')
            .orderBy('updatedAt', 'desc')
            .get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error("Error fetching archived questionnaires:", error);
        res.status(500).json({ message: "Failed to fetch archived questionnaires." });
    }
};

export const restoreQuestionnaire = async (req: Request, res: Response) => {
    const { questionnaireId } = req.params;
    try {
        const docRef = questionnairesCollection.doc(questionnaireId);
        await docRef.update({
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error restoring questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to restore questionnaire.' });
    }
};

// GET /admin/questionnaires/:questionnaireId/categories
export const getCategories = async (req: Request, res: Response) => {
    const { questionnaireId } = req.params;
    try {
        const snapshot = await questionnairesCollection.doc(questionnaireId).collection('categories').orderBy('order').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error(`Error fetching categories for questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to fetch categories.' });
    }
};

// POST /admin/questionnaires/:questionnaireId/categories
export const createCategory = async (req: Request, res: Response) => {
    const { questionnaireId } = req.params;
    const { name, description, videoUrl, order, showNameInQuiz } = req.body;
    try {
        const newDocRef = questionnairesCollection.doc(questionnaireId).collection('categories').doc();
        const data: Omit<DBCategory, 'questionnaireId'> = {
            id: newDocRef.id,
            name: sanitizeText(name),
            description: sanitizeText(description),
            videoUrl: normalizeVideoUrl(videoUrl),
            order: order || 1,
            showNameInQuiz: !!showNameInQuiz
        };
        const batch = db.batch();
        batch.set(newDocRef, data);
        batch.update(questionnairesCollection.doc(questionnaireId), {
            categoryCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        res.status(201).json({ ...data, questionnaireId });
    } catch (error) {
        logger.error(`Error creating category for questionnaire ${questionnaireId}:`, error);
        res.status(500).json({ message: 'Failed to create category.' });
    }
};

// PUT /admin/questionnaires/:questionnaireId/categories/:categoryId
export const updateCategory = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId } = req.params;
    const { name, description, videoUrl, order, showNameInQuiz } = req.body;
    try {
        const docRef = questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId);
        const data: Partial<DBCategory> = {
            name: sanitizeText(name),
            description: sanitizeText(description),
            videoUrl: normalizeVideoUrl(videoUrl),
            order,
        };
        if (showNameInQuiz !== undefined) {
            data.showNameInQuiz = !!showNameInQuiz;
        }
        await docRef.update(data);
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating category ${categoryId}:`, error);
        res.status(500).json({ message: 'Failed to update category.' });
    }
};

// DELETE /admin/questionnaires/:questionnaireId/categories/:categoryId
export const deleteCategory = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId } = req.params;
    try {
        const batch = db.batch();
        batch.delete(questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId));
        batch.update(questionnairesCollection.doc(questionnaireId), {
            categoryCount: admin.firestore.FieldValue.increment(-1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        res.status(204).send();
    } catch (error) {
        logger.error(`Error deleting category ${categoryId}:`, error);
        res.status(500).json({ message: 'Failed to delete category.' });
    }
};

// GET /admin/questionnaires/:questionnaireId/categories/:categoryId/questions
export const getQuestions = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId } = req.params;
    try {
        const snapshot = await questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId).collection('questions').orderBy('order').get();
        res.json(querySnapshotToArray(snapshot));
    } catch (error) {
        logger.error(`Error fetching questions for category ${categoryId}:`, error);
        res.status(500).json({ message: 'Failed to fetch questions.' });
    }
};

// POST /admin/questionnaires/:questionnaireId/categories/:categoryId/questions
export const createQuestion = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId } = req.params;
    logger.info(`[DEBUG Backend] createQuestion called for Q:${questionnaireId} C:${categoryId}`, { body: req.body });
    const { text, order, answers, type, correctAnswerId, customScore, correctAnswerText } = req.body;
    try {
        const newDocRef = questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId).collection('questions').doc();

        // Define data object without explicitly setting undefined values
        const data: any = {
            id: newDocRef.id,
            questionnaireId,
            categoryId,
            text: sanitizeText(text),
            order,
            type: type || 'multiple_choice',
            answers: (answers || []).map((a: any) => ({ ...a, text: sanitizeText(a.text) })),
        };

        // Conditionally add optional fields
        if (correctAnswerId) data.correctAnswerId = correctAnswerId;
        if (customScore) data.customScore = Number(customScore);
        if (correctAnswerText) data.correctAnswerText = sanitizeText(correctAnswerText);

        await newDocRef.set(data);
        res.status(201).json({ ...data, categoryId });
    } catch (error) {
        logger.error(`Error creating question for category ${categoryId}:`, error);
        res.status(500).json({ message: 'Failed to create question.' });
    }
};

// PUT /admin/questionnaires/:questionnaireId/categories/:categoryId/questions/:questionId
export const updateQuestion = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId, questionId } = req.params;
    logger.info(`[DEBUG Backend] updateQuestion called for Q:${questionnaireId} C:${categoryId} Qu:${questionId}`, { body: req.body });
    const { text, order, answers, type, correctAnswerId, customScore, correctAnswerText } = req.body;
    try {
        const docRef = questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId).collection('questions').doc(questionId);
        const data: any = {
            text: sanitizeText(text),
            order,
            answers: (answers || []).map((a: any) => ({ ...a, text: sanitizeText(a.text) }))
        };
        if(type) data.type = type;
        if(correctAnswerId !== undefined) data.correctAnswerId = correctAnswerId;
        if(customScore !== undefined) data.customScore = customScore === null || customScore === '' ? admin.firestore.FieldValue.delete() : Number(customScore);
        if(correctAnswerText !== undefined) data.correctAnswerText = correctAnswerText ? sanitizeText(correctAnswerText) : admin.firestore.FieldValue.delete();

        await docRef.update(data);
        res.json(snapshotToData(await docRef.get()));
    } catch (error) {
        logger.error(`Error updating question ${questionId}:`, error);
        res.status(500).json({ message: 'Failed to update question.' });
    }
};

// DELETE /admin/questionnaires/:questionnaireId/categories/:categoryId/questions/:questionId
export const deleteQuestion = async (req: Request, res: Response) => {
    const { questionnaireId, categoryId, questionId } = req.params;
    try {
        await questionnairesCollection.doc(questionnaireId).collection('categories').doc(categoryId).collection('questions').doc(questionId).delete();
        res.status(204).send();
    } catch (error) {
        logger.error(`Error deleting question ${questionId}:`, error);
        res.status(500).json({ message: 'Failed to delete question.' });
    }
};