
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { JwtUserPayload, UserRole, JwtMultiOrgPayload, DBUser } from '../types/index.js';
import { usersCollection } from '../db/collections.js';
import { snapshotToData } from '../services/firestore.service.js';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
    // Read token from __session httpOnly cookie first (the only cookie Firebase Hosting forwards),
    // fall back to Authorization header for mobile apps (Capacitor).
    const token = req.cookies?.__session || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "No authentication token provided." });
    }

    let decoded: any;
    try {
        decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }

    // Ensure the token has the required fields for a full session
    const payload = decoded as JwtUserPayload;

    // Allow full user tokens
    if (payload.id && payload.role && payload.selectedWorkspaceId && payload.orgId) {
        // Check if this user's session was forcibly revoked (e.g. removed from org)
        try {
            const userDoc = await usersCollection.doc(payload.id).get();
            if (userDoc.exists) {
                const userData = snapshotToData<DBUser>(userDoc);
                if (userData?.forceLogoutAt) {
                    const revokedAtMs = userData.forceLogoutAt instanceof Date
                        ? userData.forceLogoutAt.getTime()
                        : (userData.forceLogoutAt as any).toMillis();
                    const tokenIssuedAtMs = (payload as any).iat * 1000;
                    if (tokenIssuedAtMs < revokedAtMs) {
                        return res.status(401).json({ message: "Session revoked. Please log in again." });
                    }
                }
            }
        } catch {
            // If the DB check fails, allow the request through rather than blocking all traffic
        }
        req.user = payload as Express.User;
        return next();
    }

    // Check for partial tokens (Context Selection or Workspace Setup)
    const partialPayload = decoded as JwtMultiOrgPayload;
    if (partialPayload.id && (partialPayload.action === 'workspace-setup' || partialPayload.action === 'select-workspace')) {
         // For select-workspace tokens, we allow access but the controller must handle the missing org/role data
         req.user = partialPayload as Express.User;
         return next();
    }

    return res.status(401).json({ message: "Invalid token type for this request." });
};

export const requireRole = (roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role || !roles.includes(req.user.role as UserRole)) {
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
    }
    next();
};

// Middleware specifically for routes that use the partial, multi-org selection token
export const authenticatePartialToken = (req: Request, res: Response, next: NextFunction) => {
    // Read partial token from cookie first, fall back to Authorization header
    const token = req.cookies?.partialAuthToken || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "No authentication token provided." });
    }

    jwt.verify(token, env.JWT_SECRET, (err: any, user: any) => {
        if (err) {
            return res.status(401).json({ message: "Invalid or expired session token." });
        }
        if (user.action !== 'select-workspace' && user.action !== 'workspace-setup') {
            return res.status(401).json({ message: "Invalid token action." });
        }
        req.user = user;
        next();
    });
};
