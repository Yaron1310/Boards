import { Router } from 'express';
import * as chatPersonaController from '../controllers/chatPersona.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const chatPersonaRouter = Router();

const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];

// User-facing route to get personas they have access to
chatPersonaRouter.get('/accessible', chatPersonaController.getAccessibleChatPersonasForUser);

// Admin-only routes for management
chatPersonaRouter.get('/', requireRole(adminRoles), chatPersonaController.getAllChatPersonasForAcademy);
chatPersonaRouter.get('/archived', requireRole(adminRoles), chatPersonaController.getArchivedChatPersonasForAcademy);
chatPersonaRouter.post('/', requireRole(adminRoles), chatPersonaController.createChatPersona);
chatPersonaRouter.get('/:id', requireRole(adminRoles), chatPersonaController.getChatPersona);
chatPersonaRouter.put('/:id', requireRole(adminRoles), chatPersonaController.updateChatPersona);
chatPersonaRouter.put('/:id/restore', requireRole(adminRoles), chatPersonaController.restoreChatPersona);
chatPersonaRouter.delete('/:id', requireRole(adminRoles), chatPersonaController.deleteChatPersona);
