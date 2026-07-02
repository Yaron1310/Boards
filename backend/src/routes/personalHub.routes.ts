import { Router } from 'express';
import * as personalHubController from '../controllers/personalHub.controller.js';

export const personalHubRouter = Router();

personalHubRouter.get('/columns', personalHubController.listPersonalColumns);
personalHubRouter.post('/columns', personalHubController.createPersonalColumn);
personalHubRouter.patch('/columns/reorder', personalHubController.reorderPersonalColumns);
personalHubRouter.patch('/columns/:id', personalHubController.updatePersonalColumn);
personalHubRouter.delete('/columns/:id', personalHubController.deletePersonalColumn);

personalHubRouter.get('/item-values', personalHubController.getPersonalItemValues);
personalHubRouter.patch('/item-values/:itemId', personalHubController.updatePersonalItemValue);
