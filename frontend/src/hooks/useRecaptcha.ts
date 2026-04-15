import { useCallback, useEffect } from 'react';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

let scriptLoaded = false;

const loadRecaptchaScript = () => {
    if (scriptLoaded || !RECAPTCHA_SITE_KEY) return;
    scriptLoaded = true;

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    document.head.appendChild(script);
};

/**
 * Hook that provides reCAPTCHA Enterprise token generation.
 * If VITE_RECAPTCHA_SITE_KEY is not set, executeRecaptcha resolves to null
 * and no script is loaded — keeping dev environments unaffected.
 */
export const useRecaptcha = () => {
    useEffect(() => {
        loadRecaptchaScript();
    }, []);

    const executeRecaptcha = useCallback(async (action: string): Promise<string | null> => {
        if (!RECAPTCHA_SITE_KEY) return null;

        try {
            await new Promise<void>((resolve) => {
                if (window.grecaptcha?.enterprise?.ready) {
                    window.grecaptcha.enterprise.ready(() => resolve());
                } else {
                    const checkInterval = setInterval(() => {
                        if (window.grecaptcha?.enterprise?.ready) {
                            clearInterval(checkInterval);
                            window.grecaptcha.enterprise.ready(() => resolve());
                        }
                    }, 100);
                    // Give the script up to 5 seconds to load
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        resolve();
                    }, 5000);
                }
            });

            if (!window.grecaptcha?.enterprise?.execute) return null;

            const token = await window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
            return token;
        } catch (error) {
            console.error('reCAPTCHA execution failed:', error);
            return null;
        }
    }, []);

    return { executeRecaptcha };
};
