import { Router } from 'express';
import * as courseController from '../controllers/course.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';
import { verifyActiveSubscription } from '../middleware/billing.middleware.js';

export const courseRouter = Router();

// --- Course Routes ---
courseRouter.get('/', courseController.getAllCourses);
courseRouter.post('/', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.createCourse);
courseRouter.get('/archived', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.getArchivedCourses);
courseRouter.get('/:courseId', courseController.getCourseWithLessons);
courseRouter.put('/:courseId', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.updateCourse);
courseRouter.put('/:courseId/restore', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.restoreCourse);
courseRouter.delete('/:courseId', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.deleteCourse);

// --- AI Cover Image Generation ---
courseRouter.post('/generate-cover-image', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), verifyActiveSubscription, courseController.generateCourseCoverImage);

// --- One-time migration: backfill totalDuration on existing courses ---
courseRouter.post('/recalculate-durations', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.recalculateAllCourseDurations);

// --- AI Question Generation ---
courseRouter.post('/generate-question', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), verifyActiveSubscription, courseController.generateQuestionWithAI);

// --- AI HTML Assignment Generation ---
courseRouter.post('/assignments/ai-generate-html', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), verifyActiveSubscription, courseController.aiGenerateAssignmentHtml);

// --- AI Media Transcription ---
courseRouter.post('/transcribe', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), verifyActiveSubscription, courseController.transcribeMedia);

// --- Lesson Routes ---
courseRouter.post('/:courseId/lessons', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.createLesson);
courseRouter.put('/:courseId/lessons/:lessonId', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.updateLesson);
courseRouter.delete('/:courseId/lessons/:lessonId', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.deleteLesson);
courseRouter.get('/:courseId/lessons/:lessonId/bridge-token', courseController.getBridgeToken);

// --- Lesson Chat ---
courseRouter.post('/lessons/chat', verifyActiveSubscription, courseController.sendMessageToLessonChat);

// --- Progress Routes ---
courseRouter.post('/:courseId/lessons/:lessonId/complete', courseController.markLessonAsComplete);
courseRouter.get('/progress/me', courseController.getMyProgress);
courseRouter.get('/progress/organization', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), courseController.getOrganizationProgress);
