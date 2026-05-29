import { Router } from 'express';
import * as boardController from '../controllers/board.controller.js';

export const boardRouter = Router();

// List & create
boardRouter.get('/', boardController.getBoards);
boardRouter.post('/', boardController.createBoard);

// Single board — specific action routes before generic /:id
boardRouter.get('/:id/version', boardController.getBoardVersion);
boardRouter.patch('/:id/archive', boardController.archiveBoard);
boardRouter.patch('/:id/restore', boardController.restoreBoard);
boardRouter.post('/:id/duplicate', boardController.duplicateBoard);
boardRouter.post('/:id/save-as-template', boardController.saveAsTemplate);

boardRouter.get('/:id', boardController.getBoardById);
boardRouter.patch('/:id', boardController.updateBoard);
boardRouter.delete('/:id', boardController.deleteBoard);
