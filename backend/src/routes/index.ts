

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authenticatedLimiter } from '../middleware/rateLimit.middleware.js';

import { authRouter } from './auth.routes.js';
import { organizationRouter } from './workspace.routes.js';
import { academyRouter } from './workspace.routes.js';
import { userRouter } from './user.routes.js';
import { appConfigRouter } from './appConfig.routes.js';
import { provisionRouter } from './provision.routes.js';
import { systemRouter } from './system.routes.js';
import { publicRouter } from './public.routes.js';
import { emailTemplatesRouter } from './emailTemplates.routes.js';

// Phase 6 — Work Management routes
import { boardRouter } from './board.routes.js';
import { groupRouter } from './group.routes.js';
import { itemRouter } from './item.routes.js';
import { columnRouter } from './column.routes.js';

export const mainRouter = Router();

// --- PUBLIC ROUTES ---
mainRouter.use('/auth', authRouter);
mainRouter.use('/provision', provisionRouter);
mainRouter.use('/public', publicRouter);

// --- AUTHENTICATED ROUTES ---
mainRouter.use(authenticateToken);
mainRouter.use(authenticatedLimiter);

mainRouter.use('/app-config', appConfigRouter);
mainRouter.use('/workspaces', academyRouter);
mainRouter.use('/workspaces', organizationRouter);
mainRouter.use('/users', userRouter);
mainRouter.use('/system-settings', systemRouter);
mainRouter.use('/email-templates', emailTemplatesRouter);

// Phase 6 — Work Management
mainRouter.use('/boards', boardRouter);
mainRouter.use('/boards/:boardId/groups', groupRouter);
mainRouter.use('/items', itemRouter);
mainRouter.use('/columns', columnRouter);
