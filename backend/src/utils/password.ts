
/**
 * Validates password complexity requirements.
 * Returns an error message string if the password is invalid, or null if it is valid.
 *
 * Requirements:
 *  - At least 12 characters
 *  - At least one numeric digit (0–9)
 *  - At least one special character
 */
export function validatePasswordComplexity(password: string): string | null {
    if (!password || password.length < 12) {
        return 'Password must be at least 12 characters long.';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one number.';
    }
    if (!/[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]/.test(password)) {
        return 'Password must contain at least one special character (e.g. !@#$%^&*).';
    }
    return null;
}
