import { Router } from 'express';
import { webhookLimiter } from '../middleware/rateLimit.middleware.js';
import { receiveWebhook } from '../controllers/webhook.controller.js';

// Public — no auth middleware. Mounted at /webhook in index.ts.
export const webhookRouter = Router();

webhookRouter.post('/:webhookId', webhookLimiter, receiveWebhook);
