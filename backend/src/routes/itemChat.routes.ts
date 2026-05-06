import { Router } from 'express';
import * as itemChatController from '../controllers/itemChat.controller.js';

export const itemChatRouter = Router({ mergeParams: true });

itemChatRouter.get('/', itemChatController.getChatMessages);
itemChatRouter.post('/upload-url', itemChatController.getChatUploadUrl);
itemChatRouter.post('/', itemChatController.postChatMessage);
