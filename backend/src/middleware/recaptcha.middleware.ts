import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import * as logger from 'firebase-functions/logger';

/**
 * Middleware to verify Google reCAPTCHA Enterprise tokens.
 * If RECAPTCHA_API_KEY, RECAPTCHA_PROJECT_ID, and RECAPTCHA_SITE_KEY are not
 * configured, the middleware is bypassed so development/testing environments
 * are not affected.
 */
export const verifyRecaptcha = async (req: Request, res: Response, next: NextFunction) => {
    if (!env.RECAPTCHA_API_KEY || !env.RECAPTCHA_PROJECT_ID || !env.RECAPTCHA_SITE_KEY) {
        return next();
    }

    const token = req.body?.recaptchaToken;
    if (!token) {
        return res.status(400).json({ message: 'reCAPTCHA verification is required.' });
    }

    try {
        const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(env.RECAPTCHA_PROJECT_ID)}/assessments?key=${encodeURIComponent(env.RECAPTCHA_API_KEY)}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: {
                    token,
                    siteKey: env.RECAPTCHA_SITE_KEY,
                },
            }),
        });

        const data = await response.json() as {
            tokenProperties?: { valid: boolean; action?: string };
            riskAnalysis?: { score?: number };
            error?: { message: string };
        };

        if (data.error) {
            logger.error('reCAPTCHA Enterprise API error:', data.error);
            // Fail open to avoid locking out users during configuration issues.
            return next();
        }

        const valid = data.tokenProperties?.valid === true;
        const score = data.riskAnalysis?.score;

        if (!valid || (score !== undefined && score < 0.5)) {
            logger.warn('reCAPTCHA Enterprise verification failed', {
                valid,
                score,
                action: data.tokenProperties?.action,
            });
            return res.status(403).json({ message: 'reCAPTCHA verification failed. Please try again.' });
        }

        next();
    } catch (error) {
        logger.error('reCAPTCHA service error:', error);
        // Fail open: allow the request through if the reCAPTCHA service is unreachable,
        // rather than locking out all users due to a third-party outage.
        next();
    }
};
