import { Router } from 'express';
import * as provisionController from '../controllers/provision.controller.js';
import { authenticateApiKey } from '../middleware/apiKey.middleware.js';
import { provisionLimiter } from '../middleware/rateLimit.middleware.js';

export const provisionRouter = Router();

provisionRouter.get('/check-org-name', provisionLimiter, authenticateApiKey, provisionController.checkOrganizationName);
