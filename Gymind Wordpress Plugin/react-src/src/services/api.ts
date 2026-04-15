
import type { Settings, WooProduct, GymindPlan, ProvisionLog } from '../types';

// This global variable is created by `wp_localize_script` in the PHP file.
declare const gymindPluginData: {
    nonce: string;
    endpoints: {
        settings: string;
        search: string;
        plans: string;
        logs: string;
    };
};

export interface SaveSettingsResponse {
    success: true;
    webhook_status?: 'success' | 'failed' | 'not_changed';
    webhook_message?: string;
}

/**
 * Fetches the current settings from the WordPress backend.
 */
export const fetchSettings = async (): Promise<Settings> => {
    const response = await fetch(gymindPluginData.endpoints.settings, {
        method: 'GET',
        headers: {
            'X-WP-Nonce': gymindPluginData.nonce,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch settings from WordPress.');
    }
    const settings = await response.json();
    // Ensure mappings is always an array
    if (!settings.mappings) {
        settings.mappings = [];
    }
    return settings;
};

/**
 * Saves the settings to the WordPress backend.
 * @param settings - The complete settings object to save.
 */
export const saveSettings = async (settings: Settings): Promise<SaveSettingsResponse> => {
    const response = await fetch(gymindPluginData.endpoints.settings, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': gymindPluginData.nonce,
        },
        body: JSON.stringify(settings),
    });

    if (!response.ok) {
        try {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save settings to WordPress.');
        } catch (e) {
            throw new Error('An unknown error occurred while saving settings.');
        }
    }
    return response.json();
};

/**
 * Searches for WooCommerce products via the WordPress REST API.
 * @param query - The search term.
 */
export const searchProducts = async (query: string): Promise<WooProduct[]> => {
    if (!query || query.length < 2) {
        return [];
    }

    const searchUrl = new URL(gymindPluginData.endpoints.search);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('_wpnonce', gymindPluginData.nonce);

    const response = await fetch(searchUrl.toString(), {
        method: 'GET',
    });

    if (!response.ok) {
        throw new Error('Failed to search for products.');
    }
    return response.json();
};

/**
 * Fetches the list of available plans from the Gymind API via the WordPress backend proxy.
 * @param apiKey The user's current Gymind API Key.
 * @param apiUrl The user's current Gymind API URL.
 */
export const fetchPlans = async (apiKey: string, apiUrl: string): Promise<GymindPlan[]> => {
    const response = await fetch(gymindPluginData.endpoints.plans, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': gymindPluginData.nonce,
        },
        body: JSON.stringify({ apiKey, apiUrl }),
    });

    if (!response.ok) {
        try {
            const errorData = await response.json();
            throw new Error(errorData.message || `Request failed with status ${response.status}`);
        } catch (e) {
            if (e instanceof Error) {
                throw e;
            }
            throw new Error(`An unknown error occurred while fetching plans. Status: ${response.status}`);
        }
    }

    return response.json();
};

/**
 * Fetches the provisioning logs from the WordPress backend.
 */
export const fetchProvisionLogs = async (): Promise<ProvisionLog[]> => {
    const response = await fetch(gymindPluginData.endpoints.logs, {
        method: 'GET',
        headers: {
            'X-WP-Nonce': gymindPluginData.nonce,
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch provision logs from WordPress.');
    }
    return await response.json();
};
