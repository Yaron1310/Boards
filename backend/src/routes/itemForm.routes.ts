import { Router } from 'express';
import {
  listItemForms,
  attachFormToItem,
  saveItemFormResponse,
  detachFormFromItem,
} from '../controllers/itemForm.controller.js';

export const itemFormRouter = Router({ mergeParams: true });

itemFormRouter.get('/', listItemForms);
itemFormRouter.post('/', attachFormToItem);
itemFormRouter.patch('/:formId', saveItemFormResponse);
itemFormRouter.delete('/:formId', detachFormFromItem);
