import { Router } from 'express';
import * as userGroupController from '../controllers/userGroup.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const userGroupRouter = Router();

const readRoles = [UserRole.ORGANIZATION_ADMIN, UserRole.ORG_EDITOR, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN];
const writeRoles = [UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN];

userGroupRouter.get('/', requireRole(readRoles), userGroupController.getUserGroups);
userGroupRouter.post('/', requireRole(writeRoles), userGroupController.createUserGroup);
userGroupRouter.put('/:groupId', requireRole(writeRoles), userGroupController.updateUserGroup);
userGroupRouter.delete('/:groupId', requireRole(writeRoles), userGroupController.deleteUserGroup);
