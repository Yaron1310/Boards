

import { Router } from 'express';
import * as systemController from '../controllers/system.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const systemRouter = Router();

// Routes accessible by Academy Admin (Read Only for Tutorials and Token Limits for cost calculation)
systemRouter.get('/tutorials', requireRole([UserRole.SYSTEM_ADMIN, UserRole.ACADEMY_ADMIN]), systemController.getTutorialSettings);
systemRouter.get('/token-limits', requireRole([UserRole.SYSTEM_ADMIN, UserRole.ACADEMY_ADMIN]), systemController.getTokenLimits);


// System Admin Only Routes for UPDATING settings
systemRouter.put('/token-limits', requireRole([UserRole.SYSTEM_ADMIN]), systemController.updateTokenLimits);
systemRouter.put('/tutorials', requireRole([UserRole.SYSTEM_ADMIN]), systemController.updateTutorialSettings);
