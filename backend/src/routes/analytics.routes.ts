import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const analyticsRouter = Router();

analyticsRouter.get(
    '/users', 
    requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN]), 
    analyticsController.getUserTokenUsage
);

analyticsRouter.get(
    '/organizations', 
    requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN, UserRole.ORGANIZATION_ADMIN]), 
    analyticsController.getOrgTokenUsage
);

analyticsRouter.get(
    '/academies',
    requireRole([UserRole.SYSTEM_ADMIN, UserRole.ACADEMY_ADMIN]),
    analyticsController.getAcademyTokenUsage
);