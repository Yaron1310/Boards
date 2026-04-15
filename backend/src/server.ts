
import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import * as logger from "firebase-functions/logger";

import { validateEnvironment } from './config/env.js';
import { env } from './config/env.js';
import { configurePassport } from './config/passport.js';
import { seedDefaultData } from './db/seed.js';
import { mainRouter } from './routes/index.js';
import { normalizeApiPath } from './middleware/path.middleware.js';
import { enforceFieldLength } from './middleware/fieldLength.middleware.js';

export const createApp = async (): Promise<Application> => {
    // 1. Validate Environment
    validateEnvironment();

    // 2. Initialize Express
    const app = express();

    // Trust the first proxy hop (Firebase Hosting / Cloud Run load balancer).
    // This makes `req.ip` resolve to the real client IP from X-Forwarded-For,
    // so the rate limiters key per-client rather than treating all traffic as
    // coming from Google's internal load balancer IP.
    app.set('trust proxy', 1);

    // 3. Middlewares
    const allowedOrigins = [env.FRONTEND_URL, 'https://studio.gymind.app', 'http://localhost:5173'];
    app.use(cors((req: Request, callback: any) => {
        const origin = req.header('Origin');
        const path = req.url;
        
        // Disable CORS check for payment callback/notify routes (webhooks)
        const isPaymentPath = path.includes('/payments/callback') || path.includes('/payments/notify');

        if (isPaymentPath || !origin || allowedOrigins.includes(origin)) {
            callback(null, { origin: true, credentials: true });
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }));
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(enforceFieldLength);
    app.use(passport.initialize());

    // 4. Configure Passport Strategies
    configurePassport(passport);

    // 5. Seed Default Data (idempotent)
    try {
        await seedDefaultData();
        logger.info("Database seeding check completed.");
    } catch (error) {
        logger.error("Database seeding failed:", error);
    }

    // 6. Path Normalization for Firebase Hosting
    app.use(normalizeApiPath);

    // 7. Routes
    app.use('/', mainRouter);

    // 8. Error Handling
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        logger.error('Unhandled Error:', err);
        res.status(500).json({ 
            message: 'Internal Server Error', 
            error: process.env.NODE_ENV === 'development' ? err.message : undefined 
        });
    });

    return app;
};
