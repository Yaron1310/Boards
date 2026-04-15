import { Router } from 'express';
import * as marketingController from '../controllers/marketing.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

export const marketingRouter = Router();

const academyAdminOnly = [UserRole.ACADEMY_ADMIN];

// --- Public routes (no auth) ---
marketingRouter.post('/unsubscribe', marketingController.unsubscribe);

// --- Campaign routes ---
marketingRouter.get('/campaigns', requireRole(academyAdminOnly), marketingController.getCampaigns);
marketingRouter.post('/campaigns', requireRole(academyAdminOnly), marketingController.createCampaign);
marketingRouter.put('/campaigns/:id', requireRole(academyAdminOnly), marketingController.updateCampaign);
marketingRouter.put('/campaigns/:id/status', requireRole(academyAdminOnly), marketingController.updateCampaignStatus);
marketingRouter.delete('/campaigns/:id', requireRole(academyAdminOnly), marketingController.deleteCampaign);

// --- Edition routes ---
marketingRouter.get('/campaigns/:campaignId/editions', requireRole(academyAdminOnly), marketingController.getEditions);
marketingRouter.post('/campaigns/:campaignId/editions', requireRole(academyAdminOnly), marketingController.createEdition);
// ai-generate and preview-html must come before /:id routes to avoid Express param collision
marketingRouter.post('/campaigns/:campaignId/editions/ai-generate', requireRole(academyAdminOnly), marketingController.aiGenerateEdition);
marketingRouter.post('/campaigns/:campaignId/editions/preview-html', requireRole(academyAdminOnly), marketingController.previewEditionHtml);
marketingRouter.get('/campaigns/:campaignId/editions/:id', requireRole(academyAdminOnly), marketingController.getEdition);
marketingRouter.put('/campaigns/:campaignId/editions/:id', requireRole(academyAdminOnly), marketingController.updateEdition);
marketingRouter.delete('/campaigns/:campaignId/editions/:id', requireRole(academyAdminOnly), marketingController.deleteEdition);
marketingRouter.post('/campaigns/:campaignId/editions/:id/duplicate', requireRole(academyAdminOnly), marketingController.duplicateEdition);
marketingRouter.put('/campaigns/:campaignId/editions/:id/reorder', requireRole(academyAdminOnly), marketingController.reorderEdition);
marketingRouter.post('/campaigns/:campaignId/editions/:id/test-send', requireRole(academyAdminOnly), marketingController.testSendEdition);
marketingRouter.post('/campaigns/:campaignId/editions/:id/send', requireRole(academyAdminOnly), marketingController.sendEditionNow);
