

import { Router } from 'express';
import * as publicController from '../controllers/public.controller.js';
import { publicLimiter } from '../middleware/rateLimit.middleware.js';

export const publicRouter = Router();

// Apply rate limiting to all public routes
publicRouter.use(publicLimiter);

// Publicly accessible route to get academy details for landing page
publicRouter.get('/academy/:academyName', publicController.getPublicAcademyDetails);

// Single-plan view page (used by plan payment links)
publicRouter.get('/academy/:academyName/plan/:planId', publicController.getPublicSinglePlanPage);

// New public route for fetching a single plan's details for the checkout page
publicRouter.get('/plan/:planId', publicController.getPublicPlanDetails);

// Public route to fetch available single-user plans for an academy
publicRouter.get('/academy/:academyId/single-user-plans', publicController.getPublicSingleUserPlans);

// New public route to fetch temp form data after email verification
publicRouter.get('/checkout-session/:sessionId', publicController.getCheckoutSessionData);
