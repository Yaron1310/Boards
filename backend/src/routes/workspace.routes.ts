import { Router } from 'express';
import * as orgController from '../controllers/workspace.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const workspaceRouter = Router();

// GET for authenticated users (admins/managers)
workspaceRouter.get('/', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), orgController.getAllWorkspaces);

// Admin-only routes
const adminRoles = [UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN];
const managerAndAdminRoles = [UserRole.WORKSPACE_ADMIN, ...adminRoles];

workspaceRouter.get('/archived', requireRole(adminRoles), orgController.getArchivedWorkspaces);
workspaceRouter.post('/', requireRole(adminRoles), orgController.createWorkspace);
workspaceRouter.put('/:id', requireRole(adminRoles), orgController.updateWorkspace);
workspaceRouter.put('/:id/restore', requireRole(adminRoles), orgController.restoreWorkspace);
workspaceRouter.delete('/:id', requireRole(adminRoles), orgController.deleteWorkspace);

// Workspace Admin routes for managing workspace managers
workspaceRouter.post('/:workspaceId/admins', requireRole(adminRoles), orgController.addWorkspaceManager);
workspaceRouter.delete('/:workspaceId/admins/:userId', requireRole(adminRoles), orgController.removeWorkspaceManager);
workspaceRouter.delete('/:workspaceId/users/:userId', requireRole(managerAndAdminRoles), orgController.removeUserFromWorkspace);