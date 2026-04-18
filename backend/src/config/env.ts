
import * as logger from "firebase-functions/logger";

const REQUIRED_SECRETS = [
    "JWT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "FRONTEND_URL",
];

export function validateEnvironment() {
    const missingSecrets = REQUIRED_SECRETS.filter(secretName => !process.env[secretName]);

    if (missingSecrets.length > 0) {
        const message = `CRITICAL: The server cannot start. The following required secrets are not set in the environment: ${missingSecrets.join(', ')}`;
        logger.error(message, { missingSecrets });
        throw new Error(message);
    }
}

export const env = {
    // Required
    JWT_SECRET: process.env.JWT_SECRET!,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL!,
    FRONTEND_URL: (process.env.FRONTEND_URL || '').replace(/\/$/, ''),

    // Optional for Microsoft Auth
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
    MICROSOFT_CALLBACK_URL: process.env.MICROSOFT_CALLBACK_URL,

    // Optional for Native Auth
    GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID,
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID,

    // Optional for email service
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,

    // Optional — reCAPTCHA Enterprise (bot protection on auth forms)
    RECAPTCHA_API_KEY: process.env.RECAPTCHA_API_KEY,
    RECAPTCHA_PROJECT_ID: process.env.RECAPTCHA_PROJECT_ID,
    RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,

    // Optional — Field-level encryption key (AES-256-GCM).
    // Must be a 64-character hex string (32 bytes). Generate with:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    // Required in production for GDPR/compliance; if absent, encryption is skipped with a warning.
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};