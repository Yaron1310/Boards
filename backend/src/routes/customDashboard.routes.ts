import { Router } from 'express';
import {
  listCustomDashboards,
  createCustomDashboard,
  updateCustomDashboard,
  deleteCustomDashboard,
  getCustomDashboardData,
} from '../controllers/customDashboard.controller.js';

export const customDashboardRouter = Router();

customDashboardRouter.get('/', listCustomDashboards);
customDashboardRouter.post('/', createCustomDashboard);
customDashboardRouter.patch('/:id', updateCustomDashboard);
customDashboardRouter.delete('/:id', deleteCustomDashboard);
customDashboardRouter.get('/:id/data', getCustomDashboardData);
