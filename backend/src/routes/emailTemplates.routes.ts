import { Router } from 'express';
import * as emailTemplatesController from '../controllers/emailTemplates.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const emailTemplatesRouter = Router();

// All routes restricted to system admin only
emailTemplatesRouter.get('/', requireRole([UserRole.SYSTEM_ADMIN]), emailTemplatesController.getEmailTemplates);
emailTemplatesRouter.get('/:templateId', requireRole([UserRole.SYSTEM_ADMIN]), emailTemplatesController.getEmailTemplate);
emailTemplatesRouter.put('/:templateId', requireRole([UserRole.SYSTEM_ADMIN]), emailTemplatesController.updateEmailTemplate);
emailTemplatesRouter.post('/:templateId/reset', requireRole([UserRole.SYSTEM_ADMIN]), emailTemplatesController.resetEmailTemplate);
emailTemplatesRouter.post('/:templateId/test', requireRole([UserRole.SYSTEM_ADMIN]), emailTemplatesController.sendTestEmail);
