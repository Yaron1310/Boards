import { Router } from 'express';
import * as boardController from '../controllers/board.controller.js';

export const boardRouter = Router();

// List & create
boardRouter.get('/', boardController.getBoards);
boardRouter.post('/', boardController.createBoard);

// Single board — specific action routes before generic /:id
boardRouter.patch('/:id/archive', boardController.archiveBoard);
boardRouter.patch('/:id/restore', boardController.restoreBoard);

boardRouter.get('/:id', boardController.getBoardById);
boardRouter.patch('/:id', boardController.updateBoard);
boardRouter.delete('/:id', boardController.deleteBoard);
