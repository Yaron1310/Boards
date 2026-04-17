import { Router } from 'express';
import { getDashboardSummary, getDashboardOverdue } from '../controllers/dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', getDashboardSummary);
dashboardRouter.get('/overdue', getDashboardOverdue);
