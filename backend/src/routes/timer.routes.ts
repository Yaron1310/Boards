import { Router } from 'express';
import * as timerController from '../controllers/timer.controller.js';

export const timerRouter = Router();

// Hours Log stop-clock — one running timer per user.
timerRouter.get('/active', timerController.getActiveTimer);
timerRouter.post('/start', timerController.startTimer);
timerRouter.post('/stop', timerController.stopTimer);
timerRouter.post('/discard', timerController.discardTimer);
