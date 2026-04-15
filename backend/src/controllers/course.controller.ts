import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Type, GenerateContentResponse } from '@google/genai';

import jwt from 'jsonwebtoken';
import {
    coursesCollection,
    userCourseProgressCollection,
    organizationsCollection,
    plansCollection,
    systemSettingsCollection,
    usersCollection,
    membershipsCollection,
    academySettingsCollection
} from '../db/collections.js';
import { db, querySnapshotToArray, snapshotToData, storage } from '../services/firestore.service.js';
import { getAi } from '../services/gemini.service.js';
import { DBLesson, DBCourse, DBUserCourseProgress, JwtUserPayload, DBOrganization, DBCourseQuestion, UserRole, DBPlan, DBInsightField, DBLessonAssignment, DBSystemSettings, DBAcademySettings, PaginatedResponse } from '../types/index.js';
import { env } from '../config/env.js';
import { enrollUserInTriggerCampaigns } from '../services/trigger.service.js';
import { logTokenUsage } from '../services/analytics.service.js';
import { sanitizeText, sanitizeUrl, normalizeVideoUrl } from '../utils/sanitizer.js';
import { parsePaginationParams } from '../utils/pagination.js';

// Helper for recursive deletion
async function deleteCollection(collectionPath: string, batchSize: number) {
    const collectionRef = db.collection(collectionPath);
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(query: admin.firestore.Query, resolve: (value: unknown) => void) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve(true);
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, resolve);
    });
}

// Helper to upload a course cover image (base64 data URI) to Firebase Storage
async function uploadCourseCoverImageToStorage(dataUri: string, academyId: string, courseId: string): Promise<string> {
    const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URI format for cover image');
    const buffer = Buffer.from(match[2], 'base64');
    const bucket = storage.bucket();
    const filePath = `courseCoverImages/${academyId}/${courseId}.jpg`;
    const file = bucket.file(filePath);
    await file.save(buffer, {
        metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' },
        public: true,
    });
    return `${file.publicUrl()}?v=${Date.now()}`;
}

// Helper to recalculate and persist a course's total lesson duration
async function recalculateCourseTotalDuration(courseId: string): Promise<number> {
    const lessonsSnapshot = await coursesCollection.doc(courseId).collection('lessons').get();
    let total = 0;
    for (const doc of lessonsSnapshot.docs) {
        const dur = doc.data().videoDuration;
        if (typeof dur === 'number' && dur > 0) total += dur;
    }
    await coursesCollection.doc(courseId).update({ totalDuration: total, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return total;
}

// Helper to add lesson counts from denormalized field (fallback to 0)
const addLessonCounts = (courses: DBCourse[]): (DBCourse & { lessonCount: number })[] => {
    return courses.map(course => ({
        ...course,
        lessonCount: course.lessonCount ?? 0,
    }));
};

// Helper to map and sanitize assignment data, removing undefined values.
const mapAssignmentData = (assignment: any): DBLessonAssignment => {
    const data: Partial<DBLessonAssignment> = {
        type: assignment.type,
        id: assignment.id,
        name: sanitizeText(assignment.name),
        isMandatory: !!assignment.isMandatory,
        autoOpenEnabled: !!assignment.autoOpenEnabled,
        isInsightsPrivate: assignment.isInsightsPrivate !== undefined ? !!assignment.isInsightsPrivate : undefined,
    };

    if (assignment.customHtml !== undefined && assignment.customHtml !== null) {
        // Not sanitized, assumed to be safe from trusted admins
        data.customHtml = assignment.customHtml;
    }

    if (assignment.customCss !== undefined && assignment.customCss !== null) {
        data.customCss = assignment.customCss;
    }

    if (assignment.customJs !== undefined && assignment.customJs !== null) {
        data.customJs = assignment.customJs;
    }

    if (assignment.insightFields && Array.isArray(assignment.insightFields)) {
        data.insightFields = assignment.insightFields.map((f: DBInsightField) => ({
            htmlElementId: sanitizeText(f.htmlElementId),
            key: sanitizeText(f.key),
            label: sanitizeText(f.label),
        })).filter((f: DBInsightField) => f.htmlElementId && f.key && f.label);
    }

    if (assignment.endButtonId) {
        data.endButtonId = sanitizeText(assignment.endButtonId);
    }
    
    // Check for 0 as a valid timestamp
    if (assignment.autoOpenEnabled && (assignment.autoOpenTimestamp !== undefined && assignment.autoOpenTimestamp !== null)) {
        data.autoOpenTimestamp = Number(assignment.autoOpenTimestamp);
    }

    return data as DBLessonAssignment;
};


// Course Controllers
export const createCourse = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const name = sanitizeText(req.body.name);
    const description = sanitizeText(req.body.description);
    const coverImageInput: string | undefined = req.body.coverImage;
    const promoVideoUrlInput: string | undefined = req.body.promoVideoUrl;
    if (!name || !description) {
        return res.status(400).json({ message: 'Name and description are required.' });
    }
    const newCourseRef = coursesCollection.doc();
    const courseData: Omit<DBCourse, 'createdAt' | 'updatedAt'> = {
        id: newCourseRef.id,
        academyId: user.academyId,
        name,
        description,
        status: 'active',
        lessonCount: 0,
        totalDuration: 0,
        ...(promoVideoUrlInput ? { promoVideoUrl: sanitizeUrl(promoVideoUrlInput) } : {}),
    };
    await newCourseRef.set({
        ...courseData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // Upload cover image to Storage after course doc is created
    if (coverImageInput && coverImageInput.startsWith('data:image')) {
        try {
            const publicUrl = await uploadCourseCoverImageToStorage(coverImageInput, user.academyId, newCourseRef.id);
            await newCourseRef.update({ coverImage: publicUrl });
        } catch (uploadErr) {
            logger.error('Failed to upload course cover image:', uploadErr);
        }
    }
    const newCourseDoc = await newCourseRef.get();
    res.status(201).json(snapshotToData(newCourseDoc));
};

export const getAllCourses = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;

    try {
        const { limit, cursor, search } = parsePaginationParams(req);

        let baseQuery: admin.firestore.Query;

        if (user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.ACADEMY_ADMIN) {
            baseQuery = coursesCollection
                .where('academyId', '==', user.academyId)
                .where('status', '!=', 'archived')
                .orderBy('createdAt', 'desc');
        } else {
            if (!user.selectedOrganizationId) {
                return res.json({ data: [], cursor: null, hasMore: false });
            }

            const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
            if (!orgDoc.exists) {
                return res.json({ data: [], cursor: null, hasMore: false });
            }

            const org = snapshotToData<DBOrganization>(orgDoc)!;
            let hasAllCoursesAccess = false;

            if (org.planId) {
                const planDoc = await plansCollection.doc(org.planId).get();
                if (planDoc.exists) {
                    const plan = snapshotToData<DBPlan>(planDoc)!;
                    hasAllCoursesAccess = plan.hasAllCoursesAccess ?? false;

                    if (plan.planType === 'one-time' && plan.accessRules?.revokeChat === 'after_duration') {
                        const days = plan.accessRules.revokeChatAfterDays || 0;
                        if (days > 0 && org.createdAt) {
                            const startDate = (org.createdAt instanceof admin.firestore.Timestamp) ? org.createdAt.toDate() : new Date(org.createdAt);
                            const expirationDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

                            if (new Date() > expirationDate && plan.accessRules.postAccessBehavior === 'revoke_all') {
                                hasAllCoursesAccess = false;
                                return res.json({ data: [], cursor: null, hasMore: false });
                            }
                        }
                    }
                }
            }

            if (hasAllCoursesAccess) {
                baseQuery = coursesCollection.where('academyId', '==', user.academyId).orderBy('createdAt', 'desc');
            } else if (org.planId) {
                baseQuery = coursesCollection
                    .where('academyId', '==', user.academyId)
                    .where('planIds', 'array-contains', org.planId)
                    .orderBy('createdAt', 'desc');
            } else {
                return res.json({ data: [], cursor: null, hasMore: false });
            }
        }

        // Apply cursor
        if (cursor) {
            const startDoc = await coursesCollection.doc(cursor).get();
            if (startDoc.exists) {
                baseQuery = baseQuery.startAfter(startDoc);
            }
        }

        baseQuery = baseQuery.limit(limit + 1);

        const snapshot = await baseQuery.get();
        let courses = querySnapshotToArray<DBCourse>(snapshot);

        // Apply search filter on name
        if (search) {
            courses = courses.filter(c => c.name.toLowerCase().includes(search));
        }

        const coursesWithCount = addLessonCounts(courses);
        const hasMore = coursesWithCount.length > limit;
        const data = hasMore ? coursesWithCount.slice(0, limit) : coursesWithCount;
        const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

        res.json({ data, cursor: nextCursor, hasMore } as PaginatedResponse<any>);

    } catch (error) {
        logger.error("Error getting courses:", error);
        res.status(500).json({ message: "An error occurred while fetching courses." });
    }
};

export const getCourseWithLessons = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { courseId } = req.params;
    const courseDoc = await coursesCollection.doc(courseId).get();
    if (!courseDoc.exists) return res.status(404).json({ message: 'Course not found' });

    const courseData = snapshotToData<DBCourse>(courseDoc)!;
    
    // --- Access Check Logic ---
    let accessMode: 'full' | 'read_only' = 'full';

    // Admins bypass checks
    if (user.role !== UserRole.ACADEMY_ADMIN && user.role !== UserRole.SYSTEM_ADMIN) {
        if (!user.selectedOrganizationId) return res.status(403).json({ message: "No organization selected." });
        
        const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
        if (!orgDoc.exists) return res.status(403).json({ message: "Organization not found." });
        const org = snapshotToData<DBOrganization>(orgDoc)!;

        if (org.planId) {
            const planDoc = await plansCollection.doc(org.planId).get();
            if (planDoc.exists) {
                const plan = snapshotToData<DBPlan>(planDoc)!;
                
                // 1. Check if course is in plan
                const hasAccess = plan.hasAllCoursesAccess || (plan.accessibleCourseIds?.includes(courseId));
                if (!hasAccess) return res.status(403).json({ message: "This course is not included in your plan." });

                // 2. Check Expiration logic
                if (plan.planType === 'one-time' && plan.accessRules?.revokeChat === 'after_duration') {
                    const days = plan.accessRules.revokeChatAfterDays || 0;
                    if (days > 0 && org.createdAt) {
                        const startDate = (org.createdAt instanceof admin.firestore.Timestamp) ? org.createdAt.toDate() : new Date(org.createdAt);
                        const expirationDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
                        const now = new Date();

                        if (now > expirationDate) {
                            if (plan.accessRules.postAccessBehavior === 'revoke_all') {
                                return res.status(403).json({ message: "Access to this course has expired." });
                            } else if (plan.accessRules.postAccessBehavior === 'content_only') {
                                accessMode = 'read_only';
                            } else {
                                return res.status(403).json({ message: "Access to this course has expired." });
                            }
                        }
                    }
                }
            }
        }
    }

    const lessonsSnapshot = await coursesCollection.doc(courseId).collection('lessons').orderBy('order').get();
    const lessonsData = querySnapshotToArray<DBLesson>(lessonsSnapshot);

    // Fetch all questions for this course in one collection group query instead of N+1
    const allQuestionsSnapshot = await db.collectionGroup('questions')
        .where('courseId', '==', courseId)
        .orderBy('order')
        .get();
    const allQuestions = querySnapshotToArray<DBCourseQuestion & { lessonId: string }>(allQuestionsSnapshot);

    // Group questions by lessonId
    const questionsByLesson = new Map<string, DBCourseQuestion[]>();
    for (const q of allQuestions) {
        const { lessonId: qLessonId, ...question } = q;
        if (!questionsByLesson.has(qLessonId)) questionsByLesson.set(qLessonId, []);
        questionsByLesson.get(qLessonId)!.push(question as DBCourseQuestion);
    }

    const lessonsWithQuestions = lessonsData.map(lesson => ({
        ...lesson,
        questions: questionsByLesson.get(lesson.id) || [],
    }));

    res.json({ ...courseData, lessons: lessonsWithQuestions, accessMode });
};

export const updateCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const user = req.user as JwtUserPayload;
    const name = sanitizeText(req.body.name);
    const description = sanitizeText(req.body.description);
    const coverImageInput: string | undefined = req.body.coverImage;
    const promoVideoUrlInput: string | undefined = req.body.promoVideoUrl;
    const courseRef = coursesCollection.doc(courseId);
    const updatePayload: Record<string, any> = {
        name,
        description,
        promoVideoUrl: promoVideoUrlInput ? sanitizeUrl(promoVideoUrlInput) : admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (coverImageInput && coverImageInput.startsWith('data:image')) {
        try {
            const publicUrl = await uploadCourseCoverImageToStorage(coverImageInput, user.academyId, courseId);
            updatePayload.coverImage = publicUrl;
        } catch (uploadErr) {
            logger.error('Failed to upload course cover image:', uploadErr);
        }
    } else if (coverImageInput !== undefined) {
        // Store URL directly if it's not a data URI (e.g. already a storage URL)
        updatePayload.coverImage = coverImageInput;
    }
    await courseRef.update(updatePayload);
    res.json(snapshotToData(await courseRef.get()));
};

export const deleteCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { force } = req.query;
    const user = req.user as JwtUserPayload;

    try {
        const plansSnapshot = await plansCollection
            .where('academyId', '==', user.academyId)
            .where('accessibleCourseIds', 'array-contains', courseId)
            .get();

        if (!plansSnapshot.empty) {
            if (force !== 'true') {
                const planNames = querySnapshotToArray<DBPlan>(plansSnapshot).map(p => ({ id: p.id, name: p.name }));
                return res.status(409).json({
                    message: `This course is currently used in ${planNames.length} plan(s). Archiving it will not remove it from these plans.`,
                    dependencies: { plans: planNames }
                });
            }
        }
        
        if (force === 'true') {
            await coursesCollection.doc(courseId).update({
                status: 'archived',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        res.status(204).send();
    } catch (error) {
        logger.error(`Error archiving course ${courseId}:`, error);
        res.status(500).json({ message: 'Failed to archive course.' });
    }
};

export const getArchivedCourses = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await coursesCollection
            .where('academyId', '==', user.academyId)
            .where('status', '==', 'archived')
            .orderBy('updatedAt', 'desc')
            .get();
        const courses = querySnapshotToArray<DBCourse>(snapshot);
        res.json(courses);
    } catch (error) {
        logger.error("Error getting archived courses:", error);
        res.status(500).json({ message: "An error occurred while fetching archived courses." });
    }
};

export const restoreCourse = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    try {
        const courseRef = coursesCollection.doc(courseId);
        await courseRef.update({ 
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.json(snapshotToData(await courseRef.get()));
    } catch (error) {
        logger.error(`Error restoring course ${courseId}:`, error);
        res.status(500).json({ message: "Failed to restore course." });
    }
};


// Lesson Controllers
export const createLesson = async (req: Request, res: Response) => {
    const { courseId } = req.params;
    const { questions, assignments, ...data } = req.body;
    logger.info(`[createLesson] START for courseId: ${courseId}`, { lessonName: data.name, questionCount: questions?.length || 0 });

    const order = Number(data.order);
    if (isNaN(order)) {
        logger.error(`[createLesson] ABORT: Invalid order value provided: '${data.order}'`);
        return res.status(400).json({ message: 'Lesson order must be a valid number.' });
    }

    try {
        const newLessonId = await db.runTransaction(async (transaction) => {
            const lessonRef = coursesCollection.doc(courseId).collection('lessons').doc();
            const createdAt = admin.firestore.FieldValue.serverTimestamp();
            logger.info(`[createLesson TX] Generated new lessonRef with ID: ${lessonRef.id}`);

            const newLessonData: any = {
                id: lessonRef.id,
                courseId: courseId,
                name: sanitizeText(data.name),
                description: sanitizeText(data.description),
                transcript: sanitizeText(data.transcript),
                order: order,
                createdAt: createdAt,
                updatedAt: createdAt,
            };

            if (data.isBridgeVideo) {
                newLessonData.isBridgeVideo = true;
                newLessonData.bridgeVideoUrl = sanitizeUrl(data.bridgeVideoUrl);
                newLessonData.videoUrl = '';
            } else {
                newLessonData.videoUrl = normalizeVideoUrl(data.videoUrl);
                newLessonData.isBridgeVideo = false;
            }

            if (data.powerpointUrl) {
                newLessonData.powerpointUrl = sanitizeUrl(data.powerpointUrl);
            }

            if (data.videoDuration !== undefined) {
                const dur = Number(data.videoDuration);
                if (!isNaN(dur) && dur > 0) newLessonData.videoDuration = dur;
            }

            if (assignments && Array.isArray(assignments)) {
                newLessonData.assignments = assignments.map(mapAssignmentData);
            }

            transaction.set(lessonRef, newLessonData);
            transaction.update(coursesCollection.doc(courseId), {
                lessonCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info(`[createLesson TX] Queued lesson creation for ID: ${lessonRef.id}`);

            if (questions && Array.isArray(questions) && questions.length > 0) {
                logger.info(`[createLesson TX] Queuing creation for ${questions.length} questions.`);
                questions.forEach((q: any, index: number) => {
                    const questionRef = lessonRef.collection('questions').doc(); // Generate new server-side ID
                    const questionData = {
                        id: questionRef.id,
                        courseId: courseId,
                        lessonId: lessonRef.id,
                        order: Number(q.order) || index + 1,
                        text: sanitizeText(q.text || ''),
                        answers: (q.answers || []).map((a: any) => ({
                            id: a.id || `ans_${Math.random()}`,
                            text: sanitizeText(a.text || '')
                        })),
                        correctAnswerId: q.correctAnswerId || '',
                        createdAt: createdAt,
                        updatedAt: createdAt
                    };
                    transaction.set(questionRef, questionData);
                    logger.info(`[createLesson TX] Queued question creation for ID: ${questionRef.id}`);
                });
            }
            return lessonRef.id;
        });

        logger.info(`[createLesson] Transaction SUCCESS. New lesson ID is ${newLessonId}. Fetching full data to return.`);

        await recalculateCourseTotalDuration(courseId);

        const finalLessonDoc = await coursesCollection.doc(courseId).collection('lessons').doc(newLessonId).get();
        if (!finalLessonDoc.exists) {
            throw new Error("Failed to refetch the newly created lesson.");
        }
        const finalLessonData = snapshotToData(finalLessonDoc);
        const questionsSnapshot = await finalLessonDoc.ref.collection('questions').orderBy('order').get();
        const questionsData = querySnapshotToArray(questionsSnapshot);

        res.status(201).json({ ...finalLessonData, questions: questionsData });
    } catch (error) {
        logger.error('[createLesson] Transaction FAILED:', error);
        res.status(500).json({ message: 'Failed to create lesson data.' });
    }
};

export const updateLesson = async (req: Request, res: Response) => {
    const { courseId, lessonId } = req.params;
    const { questions, assignments, ...data } = req.body;
    try {
        const lessonRef = coursesCollection.doc(courseId).collection('lessons').doc(lessonId);
        const questionsRef = lessonRef.collection('questions');
        const updatedAt = admin.firestore.FieldValue.serverTimestamp();
        const createdAt = updatedAt; // For new questions

        const batch = db.batch();
        
        const updateData: Record<string, any> = { updatedAt };
        if (data.name !== undefined) updateData.name = sanitizeText(data.name);
        if (data.description !== undefined) updateData.description = sanitizeText(data.description);
        if (data.transcript !== undefined) updateData.transcript = sanitizeText(data.transcript);

        if (data.isBridgeVideo !== undefined) {
            if (data.isBridgeVideo) {
                updateData.isBridgeVideo = true;
                updateData.bridgeVideoUrl = sanitizeUrl(data.bridgeVideoUrl);
                updateData.videoUrl = '';
            } else {
                updateData.isBridgeVideo = false;
                updateData.bridgeVideoUrl = admin.firestore.FieldValue.delete();
                if (data.videoUrl !== undefined) updateData.videoUrl = normalizeVideoUrl(data.videoUrl);
            }
        } else if (data.videoUrl !== undefined) {
            updateData.videoUrl = normalizeVideoUrl(data.videoUrl);
        }

        if (data.order !== undefined) {
             const order = Number(data.order);
             if (isNaN(order)) return res.status(400).json({ message: 'Lesson order must be a valid number.' });
             updateData.order = order;
        }
        if (data.powerpointUrl === '') updateData.powerpointUrl = admin.firestore.FieldValue.delete();
        else if (data.powerpointUrl) updateData.powerpointUrl = sanitizeUrl(data.powerpointUrl);

        if (data.videoDuration !== undefined) {
            const dur = Number(data.videoDuration);
            if (!isNaN(dur) && dur > 0) updateData.videoDuration = dur;
        }

        if (assignments && Array.isArray(assignments)) {
            updateData.assignments = assignments.map(mapAssignmentData);
        } else if (assignments === null || assignments === undefined) {
            // Do nothing if not provided, allowing partial updates
        } else {
            // If passed as empty array
            updateData.assignments = [];
        }
        
        batch.update(lessonRef, updateData);

        const existingQuestionsSnap = await questionsRef.get();
        existingQuestionsSnap.docs.forEach(doc => batch.delete(doc.ref));

        if (questions && Array.isArray(questions)) {
            questions.forEach((q: DBCourseQuestion) => {
                const questionRef = questionsRef.doc(q.id);
                const sanitizedQuestion = {
                    ...q,
                    courseId,
                    lessonId,
                    text: sanitizeText(q.text),
                    answers: q.answers.map(a => ({ ...a, text: sanitizeText(a.text) })),
                    createdAt,
                    updatedAt,
                };
                batch.set(questionRef, sanitizedQuestion);
            });
        }

        await batch.commit();

        await recalculateCourseTotalDuration(courseId);

        res.json(snapshotToData(await lessonRef.get()));
    } catch (error) {
        logger.error('Error updating lesson:', error);
        res.status(500).json({ message: 'Failed to update lesson data.' });
    }
};

export const deleteLesson = async (req: Request, res: Response) => {
    const { courseId, lessonId } = req.params;
    const lessonRef = coursesCollection.doc(courseId).collection('lessons').doc(lessonId);

    await deleteCollection(lessonRef.collection('questions').path, 50);

    await lessonRef.delete();
    await coursesCollection.doc(courseId).update({
        lessonCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await recalculateCourseTotalDuration(courseId);
    res.status(204).send();
};

export const getBridgeToken = async (req: Request, res: Response) => {
    const { courseId, lessonId } = req.params;
    const user = req.user as JwtUserPayload;

    try {
        const lessonDoc = await coursesCollection.doc(courseId).collection('lessons').doc(lessonId).get();
        if (!lessonDoc.exists) {
            return res.status(404).json({ message: 'Lesson not found.' });
        }

        const lesson = snapshotToData<DBLesson>(lessonDoc)!;
        if (!lesson.isBridgeVideo || !lesson.bridgeVideoUrl) {
            return res.status(400).json({ message: 'This lesson does not use bridge video.' });
        }

        const settingsDoc = await academySettingsCollection.doc(user.academyId).get();
        if (!settingsDoc.exists) {
            return res.status(500).json({ message: 'Academy settings not found.' });
        }

        const settings = snapshotToData<DBAcademySettings>(settingsDoc)!;
        if (!settings.bridgeEnabled || !settings.bridgeSecretKey) {
            return res.status(400).json({ message: 'Bridge is not configured for this academy.' });
        }

        const parsedUrl = new URL(lesson.bridgeVideoUrl);
        const videoPath = parsedUrl.pathname;

        const token = jwt.sign(
            {
                videoPath,
                userId: user.id,
                lessonId,
            },
            settings.bridgeSecretKey,
            { expiresIn: '8h' }
        );

        const separator = lesson.bridgeVideoUrl.includes('?') ? '&' : '?';
        const playbackUrl = `${lesson.bridgeVideoUrl}${separator}token=${token}`;

        res.json({ playbackUrl });
    } catch (error) {
        logger.error('Error generating bridge token:', error);
        res.status(500).json({ message: 'Failed to generate bridge token.' });
    }
};

export const generateQuestionWithAI = async (req: Request, res: Response) => {
    const { transcript, existingQuestions } = req.body;
    const user = req.user as JwtUserPayload;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 50) {
        return res.status(400).json({ message: 'A transcript with a minimum length of 50 characters is required.' });
    }

    const systemInstructionTemplate = `You are an expert in creating educational content. Based on the following lesson transcript, generate one new and unique multiple-choice question that is not present in the list of existing questions provided below. The new question should test the user's understanding of a key concept from the transcript. The question must have exactly 4 possible answers, with one correct answer and three plausible but incorrect distractors.

Existing Questions to avoid duplicating:
{ExistingQuestions}

Return your response as a single, valid JSON object. Do not include any other text, explanations, or markdown.`;

    const existingQuestionsText = Array.isArray(existingQuestions) && existingQuestions.length > 0 
        ? existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n') 
        : 'None.';
    
    const systemInstruction = systemInstructionTemplate.replace('{ExistingQuestions}', existingQuestionsText);

    const prompt = `Here is the transcript:
---
${transcript}
---`;

    try {
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc);
        const flashModel = settings?.geminiFlashModelName || env.GEMINI_FLASH_MODEL;
        
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: flashModel,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                systemInstruction,
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questionText: { 
                            type: Type.STRING,
                            description: "The text of the multiple-choice question."
                        },
                        answers: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "An array of exactly 4 possible answer strings."
                        },
                        correctAnswerIndex: { 
                            type: Type.INTEGER,
                            description: "The index (0-3) of the correct answer in the 'answers' array."
                        }
                    },
                    required: ["questionText", "answers", "correctAnswerIndex"]
                }
            }
        });

        if (response.usageMetadata?.totalTokenCount) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                flashModel,
                { totalTokens: response.usageMetadata.totalTokenCount },
                '/api/courses/generate-question'
            );
        }

        let jsonStr = (response.text ?? '').trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        const parsedJson = JSON.parse(jsonStr);

        if (
            !parsedJson.questionText || 
            !Array.isArray(parsedJson.answers) || 
            parsedJson.answers.length !== 4 || 
            typeof parsedJson.correctAnswerIndex !== 'number' ||
            parsedJson.correctAnswerIndex < 0 ||
            parsedJson.correctAnswerIndex > 3
        ) {
            throw new Error('AI response did not match the required schema.');
        }

        res.json(parsedJson);

    } catch (error: any) {
        logger.error('Error generating quiz question with AI:', error);
        res.status(500).json({ message: 'Failed to generate question with AI.', error: error.message });
    }
};

export const transcribeMedia = async (req: Request, res: Response) => {
    const { mediaData, mimeType } = req.body;
    const user = req.user as JwtUserPayload;

    if (!mediaData || !mimeType) {
        return res.status(400).json({ message: 'Media data (base64) and mimeType are required.' });
    }

    try {
        const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
        const settings = snapshotToData<DBSystemSettings>(settingsDoc);
        const flashModel = settings?.geminiFlashModelName || env.GEMINI_FLASH_MODEL;
        
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: flashModel,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: mediaData
                            }
                        },
                        {
                            text: "Please generate a verbatim transcription of this media file. Do not include timestamps, speaker labels, or descriptions of non-speech sounds unless they are crucial for context. Just the spoken text."
                        }
                    ]
                }
            ]
        });

        if (response.usageMetadata?.totalTokenCount) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                flashModel,
                { totalTokens: response.usageMetadata.totalTokenCount },
                '/api/courses/transcribe'
            );
        }

        const transcript = response.text || '';
        res.json({ transcript });

    } catch (error: any) {
        logger.error('Error transcribing media:', error);
        res.status(500).json({ message: 'Failed to transcribe media.', error: error.message });
    }
};


export const sendMessageToLessonChat = async (req: Request, res: Response) => {
    const { lessonId, courseId, message, history } = req.body;
    
    let totalTokens = 0;
    const user = req.user as JwtUserPayload;
    let flashModel = env.GEMINI_FLASH_MODEL;

    // --- Access Control Check for Chat Cost ---
    try {
        if (user.role !== UserRole.ACADEMY_ADMIN && user.role !== UserRole.SYSTEM_ADMIN) {
            if (!user.selectedOrganizationId) return res.status(403).json({ message: "No organization selected." });
            const orgDoc = await organizationsCollection.doc(user.selectedOrganizationId).get();
            if (orgDoc.exists) {
                const org = snapshotToData<DBOrganization>(orgDoc)!;
                if (org.planId) {
                    const planDoc = await plansCollection.doc(org.planId).get();
                    if (planDoc.exists) {
                        const plan = snapshotToData<DBPlan>(planDoc)!;
                        // Check if expiration triggers read-only mode (content_only)
                        if (plan.planType === 'one-time' && plan.accessRules?.revokeChat === 'after_duration') {
                            const days = plan.accessRules.revokeChatAfterDays || 0;
                            if (days > 0 && org.createdAt) {
                                const startDate = (org.createdAt instanceof admin.firestore.Timestamp) ? org.createdAt.toDate() : new Date(org.createdAt);
                                const expirationDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
                                if (new Date() > expirationDate) {
                                    // Expired. Check behavior.
                                    // If postAccessBehavior is 'content_only', users see content but NO AI.
                                    if (plan.accessRules.postAccessBehavior === 'content_only') {
                                        return res.status(403).json({ message: "AI features are disabled in view-only mode." });
                                    }
                                    // If revoke_all, they shouldn't even be here (blocked by getCourseWithLessons), but double check.
                                    return res.status(403).json({ message: "Course access has expired." });
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        logger.error("Error checking access in lesson chat:", err);
        return res.status(500).json({ message: "Server error checking permissions." });
    }
    // --- End Access Control Check ---

    try {
      const settingsDoc = await systemSettingsCollection.doc('tokenLimits').get();
      const settings = snapshotToData<DBSystemSettings>(settingsDoc);
      flashModel = settings?.geminiFlashModelName || env.GEMINI_FLASH_MODEL;

      const lessonDoc = await coursesCollection.doc(courseId).collection('lessons').doc(lessonId).get();
      if (!lessonDoc.exists) return res.status(404).json({ message: 'Lesson not found' });
      
      const lesson = snapshotToData<DBLesson>(lessonDoc)!;
      const systemInstruction = `You are a helpful assistant and an expert on the provided text. Your role is to answer user questions based *only* on the information given in the lesson transcript. Do not use any outside knowledge or deviate from the provided content. If the answer is not in the transcript, say that you don't have information on that topic in this lesson.
---
LESSON TRANSCRIPT:
${lesson.transcript}
---`;

      const ai = getAi();
      const chat = ai.chats.create({ 
          model: flashModel, 
          config: { systemInstruction }, 
          history 
      });
      const stream = await chat.sendMessageStream({ message });
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let lastChunk: GenerateContentResponse | undefined;
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        lastChunk = chunk;
      }
      
      if (lastChunk?.usageMetadata) {
            totalTokens = lastChunk.usageMetadata.totalTokenCount ?? 0;
      }

      res.write(`data: ${JSON.stringify({ event: 'end' })}\n\n`);
      res.end();

    } catch (error: any) {
        logger.error("Lesson chat streaming error:", error);
        if (!res.headersSent) res.status(500);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ event: 'error', error: error.message || 'Error processing chat stream.' })}\n\n`);
          res.end();
        }
    } finally {
        if (totalTokens > 0) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                flashModel,
                { totalTokens },
                '/api/courses/lessons/chat'
            );
        }
    }
};


// Progress Controllers
export const markLessonAsComplete = async (req: Request, res: Response) => {
    const { courseId, lessonId } = req.params;
    const user = req.user as JwtUserPayload;

    try {
        const courseDoc = await coursesCollection.doc(courseId).get();
        if (!courseDoc.exists) {
            return res.status(404).json({ message: 'Course not found' });
        }
        const course = snapshotToData<DBCourse>(courseDoc)!;

        const progressDocId = `${user.id}_${courseId}`;
        const progressRef = userCourseProgressCollection.doc(progressDocId);
        const progressDoc = await progressRef.get();
        
        if (!progressDoc.exists) {
            const newProgress: Omit<DBUserCourseProgress, 'updatedAt'> = {
                id: progressDocId,
                userId: user.id,
                courseId,
                organizationId: user.selectedOrganizationId,
                academyId: course.academyId,
                status: 'in-progress',
                completedLessons: [lessonId],
                startedAt: new Date(),
            };
            await progressRef.set({ ...newProgress, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

            // Enroll in trigger campaigns for course enrollment (fire and forget)
            const userDocForEnroll = await usersCollection.doc(user.id).get();
            const userEmailForEnroll = userDocForEnroll.data()?.email;
            if (userEmailForEnroll) {
                enrollUserInTriggerCampaigns(course.academyId, user.id, userEmailForEnroll, 'course_enrollment', courseId)
                    .catch(err => logger.error('Failed to enroll user in trigger campaigns (course_enrollment):', err));
            }
        } else {
            await progressRef.update({
                completedLessons: admin.firestore.FieldValue.arrayUnion(lessonId),
                status: 'in-progress',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        const totalLessonsCount = course.lessonCount ?? 0;
        const updatedProgressDoc = await progressRef.get();
        const updatedProgressData = snapshotToData<DBUserCourseProgress>(updatedProgressDoc)!;

        if (totalLessonsCount > 0 && updatedProgressData.completedLessons.length >= totalLessonsCount && updatedProgressData.status !== 'completed') {
            const batch = admin.firestore().batch();
            batch.update(progressRef, {
                status: 'completed',
                completedAt: new Date(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Increment counts on User and Membership documents
            const userRef = usersCollection.doc(user.id);
            batch.update(userRef, {
                completedCourseCount: admin.firestore.FieldValue.increment(1)
            });

            const membershipId = `${user.id}_${user.selectedOrganizationId || course.academyId}`;
            const membershipRef = membershipsCollection.doc(membershipId);
            batch.update(membershipRef, {
                completedCourseCount: admin.firestore.FieldValue.increment(1)
            });

            await batch.commit();

            // Enroll in trigger campaigns for course completion (fire and forget)
            // Need user email — fetch from user doc
            const userDocForTrigger = await usersCollection.doc(user.id).get();
            const userEmailForTrigger = userDocForTrigger.data()?.email;
            if (userEmailForTrigger) {
                enrollUserInTriggerCampaigns(course.academyId, user.id, userEmailForTrigger, 'course_completion', courseId)
                    .catch(err => logger.error('Failed to enroll user in trigger campaigns:', err));
            }
        }

        res.status(200).json(snapshotToData(await progressRef.get()));
    } catch (error) {
        logger.error(`Error marking lesson ${lessonId} as complete for user ${user.id}`, error);
        res.status(500).json({ message: "Failed to update lesson progress." });
    }
};

export const getMyProgress = async (req: Request, res: Response) => {
    const userId = (req.user as JwtUserPayload).id;
    const snapshot = await userCourseProgressCollection.where('userId', '==', userId).get();
    res.json(querySnapshotToArray(snapshot));
};

export const aiGenerateAssignmentHtml = async (req: Request, res: Response) => {
    const { conversationHistory, currentHtml, currentCss, currentJs, userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ message: 'userMessage is required.' });

    const systemInstruction = `You are an expert HTML/CSS/JavaScript developer helping an academy admin create interactive learning exercises.
Your job is to generate or refine an interactive assignment split into three separate parts: HTML, CSS, and JavaScript.

HOW THE CODE IS ASSEMBLED:
- The HTML field must be a full structural document (<!DOCTYPE html>...<html><head>...</head><body>...</body></html>) with NO <style> or <script> blocks inside it.
- The CSS field contains all styles. It will be injected into <head> automatically.
- The JS field contains all JavaScript. It will be injected before </body> automatically.

Iframe display size:
- On desktop: up to 1152px wide, ~750–800px tall.
- On mobile: full-screen width and height.
- Design must fit within these bounds with no horizontal scrolling at any viewport.

Guidelines:
- The design MUST be fully responsive — use CSS flexbox, grid, percentage widths, and media queries.
- Keep the UI clean, accessible, and readable.
- If the admin mentions a "close button" or "end button", include a button with id="close-btn" (or the id they specify) in the HTML.
- Do NOT use external CDN links — keep everything self-contained.

PLATFORM CONTEXT — END BUTTON AND INSIGHT SAVING:
This assignment runs inside a sandboxed iframe embedded in the Gymind e-learning platform. The platform injects an additional script into the iframe at runtime. That script intercepts the click on the designated "end button" (the button whose HTML id matches what was configured as "End Button ID"). When the user clicks it, the platform script automatically reads configured data values from the DOM, saves them as personal insights to the user's dashboard profile, and closes the assignment. This means:
- Always include a clearly visible finish/submit button in the HTML, with the exact id specified.
- Do NOT call window.parent.postMessage() yourself — the platform handles all communication.
- Do NOT intercept, stop, or override the end button's click event (no event.stopPropagation(), no replacing it with a custom handler that swallows the event).

HOW THE PLATFORM READS INSIGHT DATA FROM THE DOM:
"Insight Fields" can be configured — each field maps a specific HTML element id to a label that appears in the user's personal dashboard. At the moment the end button is clicked, the platform's injected script looks up each configured element by id and reads its current value using one of two strategies:

  Strategy 1 — Form elements (input, textarea, select): the script reads .value.
    HTML: <input type="hidden" id="configured-id" value="">
    JS:   document.getElementById('configured-id').value = computedResult;

  Strategy 2 — Any other element (div, span, or any container): the script reads a custom DOM attribute called data-gymind-value. This attribute is a platform-specific value carrier: the platform's injected script looks for it by name and reads it as the insight value. Nothing else in the browser uses it — it exists solely so non-form elements can carry a saveable value.
    HTML: <span id="configured-id"></span>
    JS:   document.getElementById('configured-id').dataset.gymindValue = computedResult;

  Both strategies support any data type serialized to a string (comma-separated lists, JSON, plain text, a number, etc.).

IMPORTANT: these values are read at click time, not when the assignment loads. Any time the assignment's internal state changes in a way that should be reflected in the saved insight, immediately update the corresponding element's value or data-gymind-value to keep it in sync — so that whatever the user has done up to the moment they click the end button is accurately captured.

RESPONSE RULES (critical):
- On the FIRST build (no existing code): return all three fields — html, css, and js — fully populated.
- On EDITS (existing code is provided): return ONLY the field(s) that need to change. Omit fields that are unchanged entirely (do not include them in the JSON at all).
- Always return aiResponse.

Return ONLY valid JSON. Examples:
  First build:   { "html": "...", "css": "...", "js": "...", "aiResponse": "..." }
  CSS-only edit: { "css": "...", "aiResponse": "Changed button color to red" }
  JS-only edit:  { "js": "...", "aiResponse": "Fixed the counter logic" }`;

    const hasExistingCode = (currentHtml || currentCss || currentJs);
    const fullMessage = hasExistingCode
        ? `Current HTML:\n\`\`\`html\n${currentHtml || ''}\n\`\`\`\n\nCurrent CSS:\n\`\`\`css\n${currentCss || ''}\n\`\`\`\n\nCurrent JS:\n\`\`\`javascript\n${currentJs || ''}\n\`\`\`\n\nRequest: ${userMessage}`
        : userMessage;

    try {
        const ai = getAi();
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        html: { type: Type.STRING },
                        css: { type: Type.STRING },
                        js: { type: Type.STRING },
                        aiResponse: { type: Type.STRING },
                    },
                    required: ['aiResponse'],
                },
            },
            history: (conversationHistory ?? []).map((m: { role: string; text: string }) => ({
                role: m.role,
                parts: [{ text: m.text }],
            })),
        });

        const result = await chat.sendMessage({ message: fullMessage });
        const responseText = result.text;
        if (!responseText) throw new Error('Empty response from AI');

        const parsed = JSON.parse(responseText);
        res.json(parsed);
    } catch (error: any) {
        logger.error('Error in aiGenerateAssignmentHtml:', error);
        res.status(500).json({ message: 'Failed to generate HTML with AI.', error: error.message });
    }
};

export const getOrganizationProgress = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    if (!user.selectedOrganizationId && user.role === UserRole.ORGANIZATION_ADMIN) {
        return res.status(400).json({ message: "Manager is not in an organization." });
    }
    
    let query = userCourseProgressCollection.where('organizationId', '==', user.selectedOrganizationId);

    if (user.role === UserRole.ACADEMY_ADMIN) {
        query = userCourseProgressCollection.where('academyId', '==', user.academyId);
    }
    
    const snapshot = await query.get();
    res.json(querySnapshotToArray(snapshot));
};

export const generateCourseCoverImage = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    const { customInstructions, imageStyle } = req.body;
    if (!customInstructions?.trim()) {
        return res.status(400).json({ message: 'customInstructions is required.' });
    }
    const styleInstructions = imageStyle === 'illustration'
        ? 'Style: digital vector illustration, graphic art, vibrant colors, clean stylized lines, concept-art aesthetic.'
        : 'Style: photorealistic photography, natural lighting, high-resolution stock-photo quality.';

    try {
        const ai = getAi();
        const prompt = [
            'Generate a professional course cover image.',
            `Instructions: ${customInstructions.trim()}.`,
            styleInstructions,
            'Hard requirements — violating any of these is not acceptable:',
            '- The image MUST be a strict 4:3 landscape canvas, filled edge-to-edge with artwork.',
            '- Do NOT add any frame, border, drop shadow, white margin, rounded corner, or decorative surround.',
            '- Do NOT create a picture-within-a-picture, mock-up, device screen, or presentation slide.',
            '- Do NOT add letterboxing, pillarboxing, blurred padding, or any out-of-focus area at any edge.',
            '- The artwork IS the canvas — every pixel from edge to edge must be part of the scene.',
            '- Do NOT include any text, letters, numbers, or written words anywhere.',
        ].join(' ');

        logger.info('[generateCourseCoverImage] Calling Gemini model: gemini-2.5-flash-image');

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: {
                    aspectRatio: '4:3',
                },
            } as any,
        });

        logger.info('[generateCourseCoverImage] Raw response received', {
            candidatesCount: response.candidates?.length ?? 0,
            finishReason: response.candidates?.[0]?.finishReason,
            partsCount: response.candidates?.[0]?.content?.parts?.length ?? 0,
            partTypes: (response.candidates?.[0]?.content?.parts ?? []).map((p: any) => Object.keys(p).join(',')),
        });

        // Log token usage so the academy is billed
        if (response.usageMetadata?.totalTokenCount) {
            await logTokenUsage(
                user.id,
                user.selectedOrganizationId ?? null,
                user.academyId,
                'gemini-2.5-flash-image',
                { totalTokens: response.usageMetadata.totalTokenCount },
                '/api/courses/generate-cover-image'
            );
        }

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
            if ((part as any).inlineData) {
                const inlineData = (part as any).inlineData;
                logger.info('[generateCourseCoverImage] Image found', { mimeType: inlineData.mimeType, dataLength: inlineData.data?.length });
                return res.json({ imageData: `data:${inlineData.mimeType};base64,${inlineData.data}` });
            }
        }

        logger.warn('[generateCourseCoverImage] No inlineData part found in response', {
            rawParts: JSON.stringify(parts).slice(0, 500),
        });
        return res.status(500).json({ message: 'No image was generated by AI.' });
    } catch (error: any) {
        logger.error('[generateCourseCoverImage] Error:', {
            message: error.message,
            status: error.status,
            stack: error.stack?.slice(0, 500),
            fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1000),
        });
        res.status(500).json({ message: 'Failed to generate course cover image.', error: error.message });
    }
};

// One-time migration: recalculate totalDuration for all existing courses in the academy
export const recalculateAllCourseDurations = async (req: Request, res: Response) => {
    const user = req.user as JwtUserPayload;
    try {
        const snapshot = await coursesCollection
            .where('academyId', '==', user.academyId)
            .get();
        let updated = 0;
        for (const doc of snapshot.docs) {
            await recalculateCourseTotalDuration(doc.id);
            updated++;
        }
        res.json({ message: `Recalculated durations for ${updated} courses.`, updated });
    } catch (error: any) {
        logger.error('Error recalculating course durations:', error);
        res.status(500).json({ message: 'Failed to recalculate course durations.', error: error.message });
    }
};