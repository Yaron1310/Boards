import { Router } from 'express';
import * as columnController from '../controllers/column.controller.js';

export const columnRouter = Router();

// List & create
columnRouter.get('/', columnController.getColumns);
columnRouter.post('/', columnController.createColumn);

// Reorder (specific route before parameterised /:id to avoid conflict)
columnRouter.patch('/reorder', columnController.reorderColumns);

// Single column CRUD
columnRouter.get('/:id', columnController.getColumnById);
columnRouter.patch('/:id', columnController.updateColumn);
columnRouter.delete('/:id', columnController.deleteColumn);
