import { Router } from 'express';
import * as planController from '../controllers/plan.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const planRouter = Router();

const adminRoles = [UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];
const managerRoles = [UserRole.ORGANIZATION_ADMIN, UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN];

// Allow Organization Managers (and admins) to view active plans
planRouter.get('/', requireRole(managerRoles), planController.getAllPlansForAcademy);

// All other operations require Academy or System Admin
planRouter.use(requireRole(adminRoles));

planRouter.get('/archived', planController.getArchivedPlans);
planRouter.post('/', planController.createPlan);
planRouter.put('/:id', planController.updatePlan);
planRouter.put('/:id/restore', planController.restorePlan);
planRouter.delete('/:id', planController.deletePlan);
