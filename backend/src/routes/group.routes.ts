import { Router } from 'express';
import * as groupController from '../controllers/group.controller.js';

// Groups are always nested under boards: /boards/:boardId/groups/...
// This router is mounted at /boards in index.ts.
export const groupRouter = Router({ mergeParams: true });

// List & create
groupRouter.get('/', groupController.getGroups);
groupRouter.post('/', groupController.createGroup);

// Reorder (specific route before parameterised /:groupId to avoid conflict)
groupRouter.patch('/reorder', groupController.reorderGroups);

// Single group CRUD
groupRouter.patch('/:groupId', groupController.updateGroup);
groupRouter.delete('/:groupId', groupController.deleteGroup);
