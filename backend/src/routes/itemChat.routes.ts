import { Router } from 'express';
import express from 'express';
import * as itemChatController from '../controllers/itemChat.controller.js';

export const itemChatRouter = Router({ mergeParams: true });

itemChatRouter.get('/', itemChatController.getChatMessages);
// Raw binary upload — express.raw() reads the buffer; global express.json()
// skips non-JSON content types so the stream is still available here.
itemChatRouter.post('/file', express.raw({ type: () => true, limit: '10mb' }), itemChatController.uploadChatFile);
itemChatRouter.post('/seen', itemChatController.markChatSeen);
itemChatRouter.post('/', itemChatController.postChatMessage);
itemChatRouter.delete('/:messageId', itemChatController.deleteChatMessage);
