import { Router } from 'express';
import * as appConfigController from '../controllers/appConfig.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const appConfigRouter = Router();

// All routes below are protected
appConfigRouter.use(authenticateToken);

// ACADEMY_ADMIN can manage their own academy's settings
const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];

// GET /theme should be accessible by any authenticated user to see their academy's theme.
appConfigRouter.get('/theme', appConfigController.getThemeSettings);
// PUT /theme should remain admin-only and now handles all settings.
appConfigRouter.put('/theme', requireRole(adminRoles), appConfigController.updateThemeSettings);

appConfigRouter.post('/api-key/regenerate', requireRole(adminRoles), appConfigController.regenerateApiKey);

// Bridge (self-hosted video) routes
appConfigRouter.post('/bridge/enable', requireRole(adminRoles), appConfigController.enableBridge);
appConfigRouter.post('/bridge/disable', requireRole(adminRoles), appConfigController.disableBridge);
appConfigRouter.post('/bridge/regenerate-key', requireRole(adminRoles), appConfigController.regenerateBridgeKey);
