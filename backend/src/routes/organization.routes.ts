import { Router } from 'express';
import * as organizationController from '../controllers/organization.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { authenticateToken, authenticatePartialToken } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

// --- Workspace Self-Setup Routes (mounted at /workspaces) ---
// These handle the new-organization onboarding flow.
export const organizationRouter = Router();

organizationRouter.post('/setup', authenticatePartialToken, organizationController.setupOrganization);
organizationRouter.post('/activate-subscription', authenticatePartialToken, organizationController.activateSubscription);
organizationRouter.get('/check-name', authenticateToken, organizationController.checkNameUniqueness);


// --- Academy (Organization) Management Routes (mounted at /organizations) ---
// CRUD is System Admin only. Org-admin management allows ORGANIZATION_ADMIN for their own org.
export const academyRouter = Router();

academyRouter.get('/', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.getAllOrganizations);
academyRouter.post('/', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.createOrganization);
academyRouter.post('/:orgId/admins', organizationController.addOrganizationAdmin);
academyRouter.delete('/:orgId/admins/:userId', organizationController.removeOrganizationAdmin);
academyRouter.put('/:id', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.updateOrganization);
academyRouter.delete('/:id', requireRole([UserRole.SYSTEM_ADMIN]), organizationController.deleteOrganization);
