import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';

export const notificationRouter = Router();

// /read-all must be registered BEFORE /:id/read to avoid route conflict
notificationRouter.patch('/read-all', notificationController.markAllRead);
notificationRouter.get('/', notificationController.listNotifications);
notificationRouter.patch('/:id/read', notificationController.markRead);
