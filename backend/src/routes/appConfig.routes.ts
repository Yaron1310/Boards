import { Router } from 'express';
import * as appConfigController from '../controllers/appConfig.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const appConfigRouter = Router();

appConfigRouter.use(authenticateToken);

const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];

appConfigRouter.get('/theme', appConfigController.getThemeSettings);
appConfigRouter.put('/theme', requireRole(adminRoles), appConfigController.updateThemeSettings);
appConfigRouter.post('/api-key/regenerate', requireRole(adminRoles), appConfigController.regenerateApiKey);
