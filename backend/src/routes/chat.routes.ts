
import { Router } from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { verifyActiveSubscription } from '../middleware/billing.middleware.js';

export const chatRouter = Router();

chatRouter.post('/send-message', verifyActiveSubscription, chatController.sendMessage);
chatRouter.post('/extract-insights', verifyActiveSubscription, chatController.extractInsights);