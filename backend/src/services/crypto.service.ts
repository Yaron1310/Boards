
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as logger from 'firebase-functions/logger';

const ENCRYPTION_PREFIX = 'ENC:';
const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer | null {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) {
        return null;
    }
    if (hex.length !== 64) {
        logger.warn('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Encryption is disabled.');
        return null;
    }
    return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a string value using AES-256-GCM.
 * Returns the original value unchanged if ENCRYPTION_KEY is not configured.
 * Stored format: "ENC:<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 */
export function encryptValue(plaintext: string): string {
    const key = getKey();
    if (!key) return plaintext;

    try {
        const iv = randomBytes(16);
        const cipher = createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
    } catch (error) {
        logger.error('Encryption failed:', error);
        return plaintext;
    }
}

/**
 * Decrypts a value encrypted by encryptValue.
 * Returns the value unchanged if it is not in the expected encrypted format
 * (providing backward compatibility with unencrypted legacy data).
 */
export function decryptValue(value: string): string {
    if (typeof value !== 'string' || !value.startsWith(ENCRYPTION_PREFIX)) {
        return value; // Plaintext or non-string — legacy data, return as-is
    }

    const key = getKey();
    if (!key) {
        logger.warn('Cannot decrypt value: ENCRYPTION_KEY is not configured.');
        return value;
    }

    try {
        const payload = value.slice(ENCRYPTION_PREFIX.length);
        const parts = payload.split(':');
        if (parts.length !== 3) return value;

        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const ciphertext = Buffer.from(parts[2], 'base64');

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
        logger.error('Decryption failed — returning raw value:', error);
        return value;
    }
}

/**
 * Returns true if the given string is an encrypted value produced by encryptValue.
 */
export function isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}
