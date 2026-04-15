

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { authenticatedLimiter } from '../middleware/rateLimit.middleware.js';
import * as appConfigController from '../controllers/appConfig.controller.js';

import { authRouter } from './auth.routes.js';
import { organizationRouter } from './organization.routes.js';
import { academyRouter } from './academy.routes.js';
import { userRouter } from './user.routes.js';
import { chatRouter } from './chat.routes.js';
import { chatPersonaRouter } from './chatPersona.routes.js';
import { triggerPhraseRouter } from './triggerPhrase.routes.js';
import { questionnaireRouter } from './questionnaire.routes.js';
import { conversationRouter } from './conversation.routes.js';
import { courseRouter } from './course.routes.js';
import { appConfigRouter } from './appConfig.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { provisionRouter } from './provision.routes.js';
import { planRouter } from './plan.routes.js';
import { systemRouter } from './system.routes.js';
import { paymentRouter } from './payment.routes.js';
import { publicRouter } from './public.routes.js';
import { billingRouter } from './billing.routes.js';
import aiRouter from './ai.routes.js';
import { marketingRouter } from './marketing.routes.js';
import { unsubscribe as marketingUnsubscribe } from '../controllers/marketing.controller.js';
import { emailTemplatesRouter } from './emailTemplates.routes.js';

export const mainRouter = Router();

// --- PUBLIC ROUTES ---
mainRouter.use('/auth', authRouter);
mainRouter.use('/provision', provisionRouter);
mainRouter.use('/public', publicRouter);
mainRouter.get('/bridge/download', appConfigController.downloadBridge);
mainRouter.get('/bridge/install/:platform', appConfigController.downloadBridgeZip);


// New public payment routes for checkout
mainRouter.use('/payments', paymentRouter);

// Public marketing routes (unsubscribe)
mainRouter.post('/marketing/unsubscribe', marketingUnsubscribe);


// --- AUTHENTICATED ROUTES ---
mainRouter.use(authenticateToken);
mainRouter.use(authenticatedLimiter);

mainRouter.use('/app-config', appConfigRouter);
mainRouter.use('/academies', academyRouter);
mainRouter.use('/organizations', organizationRouter); 
mainRouter.use('/users', userRouter);
mainRouter.use('/chat', chatRouter);
mainRouter.use('/chat-personas', chatPersonaRouter);
mainRouter.use('/trigger-phrases', triggerPhraseRouter);
mainRouter.use('/conversations', conversationRouter);
mainRouter.use('/courses', courseRouter);
mainRouter.use('/analytics', analyticsRouter);
mainRouter.use('/plans', planRouter);
mainRouter.use('/system-settings', systemRouter);
mainRouter.use('/billing', billingRouter);
mainRouter.use('/ai', aiRouter);
mainRouter.use('/marketing', marketingRouter);
mainRouter.use('/email-templates', emailTemplatesRouter);
mainRouter.use('/', questionnaireRouter);
