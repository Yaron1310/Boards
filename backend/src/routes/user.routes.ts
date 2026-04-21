import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const userRouter = Router();

// --- Pre-approval routes ---
userRouter.post('/pre-approve-bulk', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), userController.preApproveUsersInBulk);
userRouter.get('/pre-approved', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getPreApprovedUsers);
userRouter.delete('/pre-approved/:id', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), userController.deletePreApprovedUser);


// --- User's own profile routes ---
userRouter.get('/me/details', userController.getMyUserDetails);
userRouter.put('/me/details', userController.updateMyUserDetails);
userRouter.put('/me/password', userController.updateMyPassword);
userRouter.put('/me/profile-image', userController.updateMyProfileImage);


// --- General user management (Admin/Manager) ---
userRouter.get('/', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getAllUsers);
userRouter.get('/:userId', requireRole([UserRole.ORGANIZATION_ADMIN, UserRole.WORKSPACE_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getUserById);
userRouter.delete('/:userId', userController.deleteUser); // Auth logic is inside controller
