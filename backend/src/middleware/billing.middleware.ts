import type { Request, Response, NextFunction } from 'express';

// Billing enforcement is temporarily disabled (Phase 2 of migration).
// This middleware is a no-op pass-through until billing is re-implemented.
export const verifyActiveSubscription = (_req: Request, _res: Response, next: NextFunction) => {
    next();
};
