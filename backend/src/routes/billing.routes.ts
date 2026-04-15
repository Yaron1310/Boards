import { Router } from 'express';
import * as billingController from '../controllers/billing.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const billingRouter = Router();

// Academy Admin routes
billingRouter.get('/current-cycle', requireRole([UserRole.ACADEMY_ADMIN]), billingController.getCurrentBillingCycle);
billingRouter.post('/top-up', requireRole([UserRole.ACADEMY_ADMIN]), billingController.topUpUsage);

// System Admin routes
billingRouter.post('/create-cycles', requireRole([UserRole.SYSTEM_ADMIN]), billingController.createAllBillingCycles);
