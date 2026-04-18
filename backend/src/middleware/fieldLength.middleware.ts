import type { Request, Response, NextFunction } from 'express';

const DEFAULT_MAX_LENGTH = 500;

/**
 * Fields that are legitimately large and are exempt from the default 500-char limit.
 * Key: field name, Value: max allowed length (use Infinity for no practical limit beyond bodyParser).
 */
const LARGE_FIELD_LIMITS: Record<string, number> = {
    customHtml:           200_000,  // Custom code assignments — structural HTML
    customCss:            200_000,  // Custom code assignments — CSS part
    customJs:             200_000,  // Custom code assignments — JS part
    html:                 200_000,  // Email template HTML (system admin email templates)
    htmlContent:          200_000,  // Marketing email HTML
    mediaData:            Infinity, // Base64-encoded media uploads (guard is Express 10MB body limit)
    customInstructions:   2_000,    // Custom AI image generation instructions from admin (pre-populated with name+description)
    systemPrompt:         50_000,   // Chat persona AI system prompts
    aiInsightPrompt:      50_000,   // Chat persona AI insight generation prompts
    personaPreamble:      50_000,   // Chat persona preamble definitions
    globalSystemPrompt:   50_000,   // System-wide AI instruction (system settings)
    message:              5_000,    // Individual chat messages
    userMessage:          5_000,    // AI chat messages
    mainText:             10_000,   // Marketing email main body text
    description:          2_000,    // Item/board descriptions and instructions
    summaryInstructions:  2_000,    // Chat persona summary instructions
    initialMessage:       2_000,    // Chat persona initial welcome message
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
