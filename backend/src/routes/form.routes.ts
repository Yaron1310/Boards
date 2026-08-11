import { Router } from 'express';
import {
  listForms,
  getForm,
  createForm,
  updateForm,
  archiveForm,
  restoreForm,
  deleteForm,
  listFormResponses,
} from '../controllers/form.controller.js';

export const formRouter = Router();

formRouter.get('/', listForms);
formRouter.post('/', createForm);
formRouter.get('/:id', getForm);
formRouter.get('/:id/responses', listFormResponses);
formRouter.patch('/:id', updateForm);
formRouter.patch('/:id/archive', archiveForm);
formRouter.patch('/:id/restore', restoreForm);
formRouter.delete('/:id', deleteForm);
