import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const userRouter = Router();

// --- Pre-approval routes ---
userRouter.post('/pre-approve-bulk', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), userController.preApproveUsersInBulk);
userRouter.get('/pre-approved', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getPreApprovedUsers);
userRouter.delete('/pre-approved/:id', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), userController.deletePreApprovedUser);


// --- User's own profile routes ---
userRouter.get('/me/details', userController.getMyUserDetails);
userRouter.put('/me/details', userController.updateMyUserDetails);
userRouter.put('/me/password', userController.updateMyPassword);
userRouter.put('/me/profile-image', userController.updateMyProfileImage);
userRouter.put('/me/seen-chat-notice', userController.markChatNoticeAsSeen);
userRouter.get('/me/insights', userController.getMyPersonalInsights);
userRouter.put('/me/insights', userController.savePersonalInsight);
userRouter.get('/me/insights/archived', userController.getArchivedPersonalInsights);
userRouter.delete('/me/insights/:id', userController.archivePersonalInsight);
userRouter.put('/me/insights/:id/restore', userController.restorePersonalInsight);
userRouter.post('/me/cancel-subscription', userController.cancelSubscription);
userRouter.post('/me/restore-subscription', userController.restoreSubscription);


// --- General user management (Admin/Manager) ---
userRouter.get('/', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getAllUsers);
userRouter.get('/:userId', requireRole([UserRole.ACADEMY_ADMIN, UserRole.ORGANIZATION_ADMIN, UserRole.SYSTEM_ADMIN]), userController.getUserById);
userRouter.delete('/:userId', userController.deleteUser); // Auth logic is inside controller
userRouter.post('/:userId/cancel-subscription', requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]), userController.cancelUserSubscriptionByAdmin);
