
import { Router } from 'express';
import { mentorWizard } from '../controllers/ai.controller.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { UserRole } from '../types/index.js';

const router = Router();

// Only admins can create mentors
router.post(
  '/mentor-wizard',
  requireRole([UserRole.ACADEMY_ADMIN, UserRole.SYSTEM_ADMIN]),
  mentorWizard
);

export default router;
