import type { Request, Response, NextFunction } from 'express';

/**
 * Normalizes request paths to handle Firebase Hosting rewrites.
 * If a request path starts with `/api/`, this middleware removes that prefix
 * from `req.url`. The Express router then uses the modified `req.url` to
 * correctly match routes.
 * e.g., a request to `/api/users/me` has its `req.url` changed to `/users/me`.
 */
export const normalizeApiPath = (req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api/')) {
        // Modify `req.url` for the Express router and any subsequent middleware.
        // This is the correct way to handle URL rewriting. `req.path` is a
        // read-only property derived from `req.url` by the router.
        req.url = req.url.substring(4);
        
        // Ensure the path starts with a '/' after stripping the prefix,
        // which is crucial if the original path was just '/api/'.
        if (!req.url) {
            req.url = '/';
        } else if (!req.url.startsWith('/')) {
            req.url = '/' + req.url;
        }
    }
    next();
};
