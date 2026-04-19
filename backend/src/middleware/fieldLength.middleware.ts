import type { Request, Response, NextFunction } from 'express';

const DEFAULT_MAX_LENGTH = 500;

/**
 * Fields that are legitimately large and are exempt from the default 500-char limit.
 * Key: field name, Value: max allowed length (use Infinity for no practical limit beyond bodyParser).
 */
const LARGE_FIELD_LIMITS: Record<string, number> = {
    html:                 200_000,  // Email template HTML (system admin email templates)
    htmlContent:          200_000,  // Marketing email HTML
    mediaData:            Infinity, // Base64-encoded media uploads (guard is Express 10MB body limit)
    logoUpload:           Infinity, // Base64-encoded logo image (guard is Express 10MB body limit)
    logoUrl:              Infinity, // Can be a long Firebase Storage URL or data URI
    message:              5_000,    // Individual chat messages
    mainText:             10_000,   // Marketing email main body text
    description:          2_000,    // Item/board descriptions and instructions
    text:                 2_000,    // General text field
    recaptchaToken:       Infinity, // Google reCAPTCHA Enterprise tokens — variable-length JWTs, validated by Google's API not by us
};

/**
 * Recursively checks every string field in an object.
 * Returns the offending { field, length } if a violation is found, otherwise null.
 */
function findViolation(
    obj: unknown,
    path = ''
): { field: string; limit: number } | null {
    if (typeof obj === 'string') {
        const fieldName = path.split('.').pop() ?? path;
        const limit = LARGE_FIELD_LIMITS[fieldName] ?? DEFAULT_MAX_LENGTH;
        if (obj.length > limit) {
            return { field: path, limit };
        }
        return null;
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const violation = findViolation(obj[i], `${path}[${i}]`);
            if (violation) return violation;
        }
        return null;
    }

    if (obj !== null && typeof obj === 'object') {
        for (const key of Object.keys(obj as Record<string, unknown>)) {
            const childPath = path ? `${path}.${key}` : key;
            const violation = findViolation((obj as Record<string, unknown>)[key], childPath);
            if (violation) return violation;
        }
        return null;
    }

    return null;
}

/**
 * Global middleware that enforces a maximum character length on all string fields
 * in req.body. Fields listed in LARGE_FIELD_LIMITS are exempt from the default limit.
 */
export const enforceFieldLength = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body || typeof req.body !== 'object') {
        next();
        return;
    }

    const violation = findViolation(req.body);
    if (violation) {
        res.status(400).json({
            message: `Field "${violation.field}" exceeds the maximum allowed length of ${violation.limit} characters.`,
        });
        return;
    }

    next();
};
