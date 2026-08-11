import { Router } from 'express';
import {
  listForms,
  getForm,
  createForm,
  updateForm,
  archiveForm,
  restoreForm,
  deleteForm,
} from '../controllers/form.controller.js';

export const formRouter = Router();

formRouter.get('/', listForms);
formRouter.post('/', createForm);
formRouter.get('/:id', getForm);
formRouter.patch('/:id', updateForm);
formRouter.patch('/:id/archive', archiveForm);
formRouter.patch('/:id/restore', restoreForm);
formRouter.delete('/:id', deleteForm);
