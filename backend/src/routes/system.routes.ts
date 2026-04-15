import { Router } from 'express';
import * as systemController from '../controllers/system.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const systemRouter = Router();

const adminRoles = [UserRole.SYSTEM_ADMIN, UserRole.ACADEMY_ADMIN];

systemRouter.get('/settings', requireRole(adminRoles), systemController.getSystemSettings);
systemRouter.put('/settings', requireRole([UserRole.SYSTEM_ADMIN]), systemController.updateSystemSettings);

systemRouter.get('/tutorials', requireRole(adminRoles), systemController.getTutorialSettings);
systemRouter.put('/tutorials', requireRole([UserRole.SYSTEM_ADMIN]), systemController.updateTutorialSettings);
