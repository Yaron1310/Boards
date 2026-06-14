import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Rate limiters organized by tier, from strictest to most permissive.
 *
 * All limiters key on IP by default (express-rate-limit v8 default).
 * In production behind a reverse proxy, ensure `app.set('trust proxy', ...)` is
 * configured so `req.ip` resolves to the real client IP.
 */

// ─── Tier 1 — Auth-strict ────────────────────────────────────────────────────
// Login, register, forgot-password — high abuse risk
export const authStrictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 15,                 // 15 requests per window
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});

// ─── Tier 2 — Auth-moderate ──────────────────────────────────────────────────
// Reset-password, verify-account, OAuth callbacks, finalize endpoints
export const authModerateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});

// ─── Tier 3 — Payment ───────────────────────────────────────────────────────
// Payment initiation, webhooks, callbacks
export const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many payment requests, please try again later.' },
});

// ─── Tier 4 — Provision (API-key gated) ──────────────────────────────────────
// WooCommerce/WordPress provisioning endpoints
export const provisionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many provisioning requests, please try again later.' },
});

// ─── Tier 5 — Public ────────────────────────────────────────────────────────
// Unauthenticated read-only public endpoints
export const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});

// ─── Tier 6 — Authenticated (global) ────────────────────────────────────────
// Catch-all for all authenticated routes — generous but prevents runaway clients
export const authenticatedLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' },
});

// ─── Tier 7 — Webhook receiver ──────────────────────────────────────────────
// Per-webhookId rate limit to prevent flooding a single group
export const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    keyGenerator: (req) => (req.params as Record<string, string>).webhookId ?? ipKeyGenerator(req.ip ?? 'unknown'),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many webhook requests, please try again later.' },
});
