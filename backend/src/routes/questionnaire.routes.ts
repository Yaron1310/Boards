import { Router } from 'express';
import * as questionnaireController from '../controllers/questionnaire.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';
import { verifyActiveSubscription } from '../middleware/billing.middleware.js';

export const questionnaireRouter = Router();

const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];

// --- User-facing routes ---
questionnaireRouter.get('/questionnaires', questionnaireController.getPublishedQuestionnaires);
questionnaireRouter.get('/questionnaires/:questionnaireId', questionnaireController.getQuestionnaireForUser);
questionnaireRouter.post('/questionnaires/:questionnaireId/results', verifyActiveSubscription, questionnaireController.saveQuestionnaireResults);
questionnaireRouter.get('/questionnaires/:questionnaireId/results/latest', questionnaireController.getLatestQuestionnaireResults);
questionnaireRouter.get('/questionnaire-results/my-latest', questionnaireController.getMyLatestResults);
questionnaireRouter.put('/questionnaire-results/:resultId/archive', questionnaireController.archiveQuestionnaireResult);
questionnaireRouter.get('/questionnaire-results/my-archived', questionnaireController.getMyArchivedResults);
questionnaireRouter.put('/questionnaire-results/:resultId/restore', questionnaireController.restoreQuestionnaireResult);


// --- Admin-only management routes ---

// Questionnaires
questionnaireRouter.get('/admin/questionnaires', requireRole(adminRoles), questionnaireController.getQuestionnairesForAdmin);
questionnaireRouter.get('/admin/questionnaires/archived', requireRole(adminRoles), questionnaireController.getArchivedQuestionnaires);
questionnaireRouter.post('/admin/questionnaires', requireRole(adminRoles), questionnaireController.createQuestionnaire);
questionnaireRouter.put('/admin/questionnaires/:questionnaireId', requireRole(adminRoles), questionnaireController.updateQuestionnaire);
questionnaireRouter.put('/admin/questionnaires/:questionnaireId/restore', requireRole(adminRoles), questionnaireController.restoreQuestionnaire);
questionnaireRouter.delete('/admin/questionnaires/:questionnaireId', requireRole(adminRoles), questionnaireController.deleteQuestionnaire);

// Categories
questionnaireRouter.get('/admin/questionnaires/:questionnaireId/categories', requireRole(adminRoles), questionnaireController.getCategories);
questionnaireRouter.post('/admin/questionnaires/:questionnaireId/categories', requireRole(adminRoles), questionnaireController.createCategory);
questionnaireRouter.put('/admin/questionnaires/:questionnaireId/categories/:categoryId', requireRole(adminRoles), questionnaireController.updateCategory);
questionnaireRouter.delete('/admin/questionnaires/:questionnaireId/categories/:categoryId', requireRole(adminRoles), questionnaireController.deleteCategory);

// Questions
questionnaireRouter.get('/admin/questionnaires/:questionnaireId/categories/:categoryId/questions', requireRole(adminRoles), questionnaireController.getQuestions);
questionnaireRouter.post('/admin/questionnaires/:questionnaireId/categories/:categoryId/questions', requireRole(adminRoles), questionnaireController.createQuestion);
questionnaireRouter.put('/admin/questionnaires/:questionnaireId/categories/:categoryId/questions/:questionId', requireRole(adminRoles), questionnaireController.updateQuestion);
questionnaireRouter.delete('/admin/questionnaires/:questionnaireId/categories/:categoryId/questions/:questionId', requireRole(adminRoles), questionnaireController.deleteQuestion);
