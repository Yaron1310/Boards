import { Router } from 'express';
import * as orgController from '../controllers/workspace.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const organizationRouter = Router();

// GET for authenticated users (admins/managers)
organizationRouter.get('/', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), orgController.getAllOrganizations);

// Admin-only routes
const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];
const managerAndAdminRoles = [UserRole.ORGANIZATION_ADMIN, ...adminRoles];

organizationRouter.get('/archived', requireRole(adminRoles), orgController.getArchivedOrganizations);
organizationRouter.post('/', requireRole(adminRoles), orgController.createOrganization);
organizationRouter.put('/:id', requireRole(adminRoles), orgController.updateOrganization);
organizationRouter.put('/:id/restore', requireRole(adminRoles), orgController.restoreOrganization);
organizationRouter.delete('/:id', requireRole(adminRoles), orgController.deleteOrganization);

// Workspace Admin routes for managing workspace managers
organizationRouter.post('/:organizationId/admins', requireRole(adminRoles), orgController.addOrganizationManager);
organizationRouter.delete('/:organizationId/admins/:userId', requireRole(adminRoles), orgController.removeOrganizationManager);
organizationRouter.delete('/:organizationId/users/:userId', requireRole(managerAndAdminRoles), orgController.removeUserFromOrganization);