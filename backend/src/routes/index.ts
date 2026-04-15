

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authenticatedLimiter } from '../middleware/rateLimit.middleware.js';

import { authRouter } from './auth.routes.js';
import { organizationRouter } from './organization.routes.js';
import { academyRouter } from './academy.routes.js';
import { userRouter } from './user.routes.js';
import { appConfigRouter } from './appConfig.routes.js';
import { provisionRouter } from './provision.routes.js';
import { systemRouter } from './system.routes.js';
import { publicRouter } from './public.routes.js';
import { emailTemplatesRouter } from './emailTemplates.routes.js';

export const mainRouter = Router();

// --- PUBLIC ROUTES ---
mainRouter.use('/auth', authRouter);
mainRouter.use('/provision', provisionRouter);
mainRouter.use('/public', publicRouter);

// --- AUTHENTICATED ROUTES ---
mainRouter.use(authenticateToken);
mainRouter.use(authenticatedLimiter);

mainRouter.use('/app-config', appConfigRouter);
mainRouter.use('/academies', academyRouter);
mainRouter.use('/organizations', organizationRouter);
mainRouter.use('/users', userRouter);
mainRouter.use('/system-settings', systemRouter);
mainRouter.use('/email-templates', emailTemplatesRouter);
