import { Router } from 'express';
import * as academyController from '../controllers/academy.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { authenticateToken, authenticatePartialToken } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const academyRouter = Router();

// --- Workspace Self-Setup Routes ---
// These are authenticated with a special partial token.
academyRouter.post('/setup', authenticatePartialToken, academyController.setupAcademy);
academyRouter.post('/activate-subscription', authenticatePartialToken, academyController.activateSubscription);
// This is authenticated with a full token, but available to a 'pending_setup' user.
academyRouter.get('/check-name', authenticateToken, academyController.checkNameUniqueness);


// --- System Admin Management Routes ---
// These routes are only accessible by a System Administrator.
academyRouter.get('/', requireRole([UserRole.SYSTEM_ADMIN]), academyController.getAllAcademies);
academyRouter.post('/', requireRole([UserRole.SYSTEM_ADMIN]), academyController.createAcademy);
academyRouter.post('/:orgId/admins', academyController.addAcademyAdmin);
academyRouter.delete('/:orgId/admins/:userId', academyController.removeAcademyAdmin);
academyRouter.put('/:id', requireRole([UserRole.SYSTEM_ADMIN]), academyController.updateAcademy);
academyRouter.delete('/:id', requireRole([UserRole.SYSTEM_ADMIN]), academyController.deleteAcademy);