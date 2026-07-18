import { Router } from 'express';
import { getPublicBoardView } from '../controllers/boardViewInvite.controller.js';
import { publicBoardViewLimiter } from '../middleware/rateLimit.middleware.js';

export const publicRouter = Router();

publicRouter.get('/board-view/:token', publicBoardViewLimiter, getPublicBoardView);
