import { Router } from 'express';
import { uploadChatFiles } from '../middleware/upload.middleware.js';
import * as itemChatController from '../controllers/itemChat.controller.js';

export const itemChatRouter = Router({ mergeParams: true });

itemChatRouter.get('/', itemChatController.getChatMessages);
itemChatRouter.post('/', uploadChatFiles, itemChatController.postChatMessage);
