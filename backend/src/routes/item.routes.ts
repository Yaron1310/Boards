import { Router } from 'express';
import * as itemController from '../controllers/item.controller.js';

export const itemRouter = Router();

// List & create
itemRouter.get('/', itemController.getItems);
itemRouter.post('/', itemController.createItem);

// Reorder (specific route before parameterised /:id to avoid conflict)
itemRouter.patch('/reorder', itemController.reorderItems);

// Single item — specific action routes before generic /:id
itemRouter.patch('/:id/archive', itemController.archiveItem);
itemRouter.patch('/:id/restore', itemController.restoreItem);

itemRouter.get('/:id', itemController.getItemById);
itemRouter.patch('/:id', itemController.updateItem);
itemRouter.delete('/:id', itemController.deleteItem);
