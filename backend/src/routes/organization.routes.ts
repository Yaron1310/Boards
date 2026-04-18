import { Router } from 'express';
import * as organizationController from '../controllers/organization.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { authenticateToken, authenticatePartialToken } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const organizationRouter = Router();

// --- Workspace Self-Setup Routes ---
// These are authenticated with a special partial token.
organizationRouter.post('/setup', authenticatePartialToken, organizationController.setupOrganization);
organizationRouter.post('/activate-subscription', authenticatePartialToken, organizationController.activateSubscription);
// This is authenticated with a full token, but available to a 'pending_setup' user.
organizationRouter.get('/check-name', authenticateToken, organizationController.checkNameUniqueness);


// --- System Admin Management Routes ---
// These routes are only accessible by a System Administrator.
organizationRouter.get('/', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.getAllOrganizations);
organizationRouter.post('/', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.createOrganization);
organizationRouter.post('/:orgId/admins', organizationController.addOrganizationAdmin);
organizationRouter.delete('/:orgId/admins/:userId', organizationController.removeOrganizationAdmin);
organizationRouter.put('/:id', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.updateOrganization);
organizationRouter.delete('/:id', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.deleteOrganization);