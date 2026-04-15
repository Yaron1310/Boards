import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { requireRole, authenticateToken } from '../middleware/auth.middleware.js';
import { paymentLimiter } from '../middleware/rateLimit.middleware.js';
import { UserRole } from '../types/index.js';

export const paymentRouter = Router();

// --- PUBLIC ROUTES FOR PAYMENT SIMULATOR FLOW ---

// 1. Frontend requests URL to load in iframe
paymentRouter.post('/initiate', paymentLimiter, paymentController.initiatePaymentSimulator);

// 2. Simulator Server-to-Server Webhook (Async update)
// Note: Simulators usually POST form-data or urlencoded data. Body parsing is handled in server.ts
paymentRouter.post('/notify', paymentLimiter, paymentController.handlePaymentNotify);

// 3. Simulator Browser Redirect (POST from Iframe) -> Redirects to Frontend
paymentRouter.post('/callback/success', paymentLimiter, paymentController.handlePaymentCallback);


// --- AUTHENTICATED USER ROUTE: Self-subscribe to a single-user plan ---
paymentRouter.post(
    '/self-subscribe',
    paymentLimiter,
    authenticateToken,
    paymentController.selfSubscribe
);

// --- SYSTEM ADMIN ONLY ROUTES ---
paymentRouter.get(
    '/payouts',
    authenticateToken,
    requireRole([UserRole.SYSTEM_ADMIN]),
    paymentController.getAcademyPayouts
);
