

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authenticatedLimiter } from '../middleware/rateLimit.middleware.js';

import { authRouter } from './auth.routes.js';
import { workspaceRouter } from './workspace.routes.js';
import { organizationRouter, academyRouter } from './organization.routes.js';
import { userRouter } from './user.routes.js';
import { appConfigRouter } from './appConfig.routes.js';
import { provisionRouter } from './provision.routes.js';
import { systemRouter } from './system.routes.js';
import { publicRouter } from './public.routes.js';
import { emailTemplatesRouter } from './emailTemplates.routes.js';
import { webhookRouter } from './webhook.routes.js';

// Phase 6 — Work Management routes
import { boardRouter } from './board.routes.js';
import { boardMemberRouter } from './boardMember.routes.js';
import { groupRouter } from './group.routes.js';
import { itemRouter } from './item.routes.js';
import { columnRouter } from './column.routes.js';
// Phase 8 — Dashboard routes
import { dashboardRouter } from './dashboard.routes.js';
import { customDashboardRouter } from './customDashboard.routes.js';
// Phase 9 — Notifications
import { notificationRouter } from './notification.routes.js';
// Item chat
import { itemChatRouter } from './itemChat.routes.js';
// Personal Hub
import { personalHubRouter } from './personalHub.routes.js';

export const mainRouter = Router();

// --- PUBLIC ROUTES ---
mainRouter.use('/auth', authRouter);
mainRouter.use('/provision', provisionRouter);
mainRouter.use('/public', publicRouter);
mainRouter.use('/webhook', webhookRouter);

// --- AUTHENTICATED ROUTES ---
mainRouter.use(authenticateToken);
mainRouter.use(authenticatedLimiter);

mainRouter.use('/app-config', appConfigRouter);
mainRouter.use('/organizations', academyRouter);
mainRouter.use('/workspaces', organizationRouter);
mainRouter.use('/workspaces', workspaceRouter);
mainRouter.use('/users', userRouter);
mainRouter.use('/system-settings', systemRouter);
mainRouter.use('/email-templates', emailTemplatesRouter);

// Phase 6 — Work Management
mainRouter.use('/boards', boardRouter);
mainRouter.use('/boards', boardMemberRouter);
mainRouter.use('/boards/:boardId/groups', groupRouter);
mainRouter.use('/items', itemRouter);
mainRouter.use('/boards/:boardId/columns', columnRouter);
// Phase 8 — Dashboard
mainRouter.use('/dashboard', dashboardRouter);
mainRouter.use('/custom-dashboards', customDashboardRouter);
// Phase 9 — Notifications
mainRouter.use('/notifications', notificationRouter);
// Item chat
mainRouter.use('/items/:itemId/chat', itemChatRouter);
// Personal Hub
mainRouter.use('/personal-hub', personalHubRouter);
