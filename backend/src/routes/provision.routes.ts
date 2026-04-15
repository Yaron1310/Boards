import { Router } from 'express';
import * as provisionController from '../controllers/provision.controller.js';
import { authenticateApiKey } from '../middleware/apiKey.middleware.js';
import { provisionLimiter } from '../middleware/rateLimit.middleware.js';

export const provisionRouter = Router();

provisionRouter.get('/plans', provisionLimiter, authenticateApiKey, provisionController.getAcademyPlans);
provisionRouter.get('/check-org-name', provisionLimiter, authenticateApiKey, provisionController.checkOrganizationName);
provisionRouter.post('/woocommerce', provisionLimiter, authenticateApiKey, provisionController.handleWoocommerceProvision);
provisionRouter.post('/connect', provisionLimiter, authenticateApiKey, provisionController.connectWordPress);
provisionRouter.post('/subscription-status', provisionLimiter, authenticateApiKey, provisionController.updateSubscriptionStatus);