

import { Router } from 'express';
import * as conversationController from '../controllers/conversation.controller.js';

export const conversationRouter = Router();

// These routes are protected by the global `authenticateToken` middleware in `routes/index.ts`

// Route to get conversations (for users, managers, or admins based on their role)
conversationRouter.get('/', conversationController.getUserConversations);

// Route for a user to save their own conversation
conversationRouter.post('/', conversationController.saveUserConversation);

// Route for a user to archive/restore a conversation from their insights view
conversationRouter.put('/:conversationId/archive-insight', conversationController.archiveConversationInsight);
conversationRouter.put('/:conversationId/restore-insight', conversationController.restoreConversationInsight);

// Route to get paginated messages for a conversation
conversationRouter.get('/:conversationId/messages', conversationController.getConversationMessages);

// Route to delete the message history of a conversation
conversationRouter.delete('/:conversationId/messages', conversationController.deleteConversationMessages);
