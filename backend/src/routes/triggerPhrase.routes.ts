import { Router } from 'express';
import * as triggerPhraseController from '../controllers/triggerPhrase.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const triggerPhraseRouter = Router();

// GET is accessible by all authenticated users
triggerPhraseRouter.get('/', triggerPhraseController.getAllTriggerPhrases);

// POST, PUT, DELETE are admin-only
triggerPhraseRouter.post('/', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), triggerPhraseController.createTriggerPhrase);
triggerPhraseRouter.put('/:id', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), triggerPhraseController.updateTriggerPhrase);
triggerPhraseRouter.delete('/:id', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), triggerPhraseController.deleteTriggerPhrase);