
import { Router } from 'express';
import passport from 'passport';
import * as authController from '../controllers/auth.controller.js';
import { authenticatePartialToken, authenticateToken } from '../middleware/auth.middleware.js';
import { authStrictLimiter, authModerateLimiter } from '../middleware/rateLimit.middleware.js';
import { verifyRecaptcha } from '../middleware/recaptcha.middleware.js';
import { env } from '../config/env.js';

export const authRouter = Router();

// Local Registration & Login — strict rate limiting + reCAPTCHA v3
authRouter.post('/register', authStrictLimiter, verifyRecaptcha, authController.register);
authRouter.post('/register-organization-admin', authStrictLimiter, verifyRecaptcha, authController.registerAcademyAdmin);
authRouter.post('/login', authStrictLimiter, verifyRecaptcha, authController.login);
authRouter.post('/logout', authModerateLimiter, authController.logout);
authRouter.post('/select-context', authModerateLimiter, authenticatePartialToken, authController.selectContext);
authRouter.put('/switch-context', authModerateLimiter, authenticateToken, authController.switchContext);
authRouter.post('/forgot-password', authStrictLimiter, verifyRecaptcha, authController.forgotPassword);
authRouter.post('/reset-password', authModerateLimiter, authController.resetPassword);

// Email Verification Route
authRouter.get('/verify-account', authModerateLimiter, authController.verifyAccount);

// Google OAuth (Web)
authRouter.get('/google', authModerateLimiter, (req, res, next) => {
    const state = req.query.state as string;
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        prompt: 'select_account',
        state: state || undefined
    })(req, res, next);
});

authRouter.get('/google/callback', authModerateLimiter, passport.authenticate('google', {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/login?google_auth_failed=true&error_message=Access%20denied.%20Your%20email%20is%20not%20pre-approved.`

}), authController.googleCallback);

// Microsoft OAuth (Web) - Conditionally registered
if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_CALLBACK_URL) {
    authRouter.get('/microsoft', authModerateLimiter, passport.authenticate('microsoft', { session: false }));
    authRouter.get('/microsoft/callback', authModerateLimiter, passport.authenticate('microsoft', {
        session: false,
        failureRedirect: `${env.FRONTEND_URL}/login?error_message=Microsoft%20login%20failed`
    }), authController.googleCallback); // Can reuse the same finalization controller
}

// Google Auth (Native)
authRouter.post('/google/native', authStrictLimiter, authController.nativeGoogleLogin);

// Microsoft Auth (Native) - Conditionally registered
if (env.MICROSOFT_CLIENT_ID) {
    authRouter.post('/microsoft/native', authStrictLimiter, authController.nativeMicrosoftLogin);
}

// Endpoint for frontend to get final token after Google redirect if multi-org
authRouter.get('/google/finalize', authModerateLimiter, authenticatePartialToken, authController.getGoogleLoginFinalization);

// Endpoint for frontend to get final token after organization verification redirect
authRouter.get('/organization/finalize', authModerateLimiter, authenticatePartialToken, authController.finalizeAcademySetup);
