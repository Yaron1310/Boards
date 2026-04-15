
import sanitizeHtml from 'sanitize-html';
import * as logger from 'firebase-functions/logger';

// A simple decoder for common HTML entities produced by sanitize-html.
const decodeEntities = (text: string): string => {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
};

/**
 * Strips all HTML tags from a string, but preserves the original text content,
 * including characters like '&' that might otherwise be HTML-encoded.
 * @param dirty The string to sanitize.
 * @returns A sanitized string with no HTML.
 */
export const sanitizeText = (dirty: string | undefined | null): string => {
    if (!dirty) return '';
    // sanitize-html strips all tags but also encodes entities by default.
    const sanitized = sanitizeHtml(dirty, {
        allowedTags: [],
        allowedAttributes: {},
    });
    // We decode the most common entities to get the plain text back as intended,
    // solving issues where characters like '&' were saved as '&amp;'.
    return decodeEntities(sanitized);
};


/**
 * Sanitizes a URL, allowing only http and https protocols.
 * This function first strips any potential HTML wrappers from the URL.
 * @param dirty The URL string to sanitize.
 * @returns A sanitized URL or an empty string if invalid.
 */
export const sanitizeUrl = (dirty: string | undefined | null): string => {
    if (!dirty) return '';
    // First, strip any potential HTML wrapper that might hide a malicious link
    const textContent = sanitizeHtml(dirty, { allowedTags: [], allowedAttributes: {} });
    const trimmed = textContent.trim();
    // Only allow URLs that explicitly start with http:// or https://
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return '';
};

/**
 * Sanitizes and normalizes a video URL.
 * It converts standard Vimeo and YouTube links to their embeddable player formats.
 * @param dirty The video URL string to sanitize.
 * @returns A normalized and sanitized video URL.
 */
export const normalizeVideoUrl = (dirty: string | undefined | null): string => {
    logger.info(`[VIDEO_DEBUG] normalizeVideoUrl: Input URL is "${dirty}"`);
    let url = sanitizeUrl(dirty);
    if (!url) {
        logger.info(`[VIDEO_DEBUG] normalizeVideoUrl: Sanitized URL is empty. Returning empty string.`);
        return '';
    }
    
    let finalUrl = url;

    const youtubeEmbedRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/([^/?&]+)/;
    if (youtubeEmbedRegex.test(url)) {
        finalUrl = url;
        logger.info(`[VIDEO_DEBUG] Matched existing YouTube embed URL.`);
    } else {
        const vimeoEmbedRegex = /^(https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/;
        if (vimeoEmbedRegex.test(url)) {
            finalUrl = url;
            logger.info(`[VIDEO_DEBUG] Matched existing Vimeo embed URL.`);
        } else {
            const vimeoRegex = /^(https?:\/\/)?(www\.)?vimeo\.com\/(\d+)/;
            const vimeoMatch = url.match(vimeoRegex);
            if (vimeoMatch && vimeoMatch[3]) {
                finalUrl = `https://player.vimeo.com/video/${vimeoMatch[3]}`;
                logger.info(`[VIDEO_DEBUG] Converted standard Vimeo URL.`);
            } else {
                const ytWatchRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=([^&]+)/;
                const ytWatchMatch = url.match(ytWatchRegex);
                if (ytWatchMatch && ytWatchMatch[3]) {
                    finalUrl = `https://www.youtube.com/embed/${ytWatchMatch[3]}`;
                    logger.info(`[VIDEO_DEBUG] Converted YouTube watch URL.`);
                } else {
                    const ytShortRegex = /^(https?:\/\/)?(www\.)?youtu\.be\/([^?]+)/;
                    const ytShortMatch = url.match(ytShortRegex);
                    if (ytShortMatch && ytShortMatch[3]) {
                        finalUrl = `https://www.youtube.com/embed/${ytShortMatch[3]}`;
                        logger.info(`[VIDEO_DEBUG] Converted YouTube short URL.`);
                    } else {
                         logger.info(`[VIDEO_DEBUG] No conversion match. Returning original sanitized URL.`);
                    }
                }
            }
        }
    }
    
    logger.info(`[VIDEO_DEBUG] normalizeVideoUrl: Final output URL is "${finalUrl}"`);
    return finalUrl;
};

/**
 * Sanitizes an image URL, allowing http, https, and data URIs for common image types.
 * It explicitly blocks 'data:image/svg' to prevent XSS via malicious SVGs.
 * @param dirty The image URL string to sanitize.
 * @returns A sanitized image URL or an empty string if invalid.
 */
export const sanitizeImageUrl = (dirty: string | undefined | null): string => {
    if (!dirty) return '';
    
    const textContent = sanitizeHtml(dirty, { allowedTags: [], allowedAttributes: {} });
    const trimmed = textContent.trim();

    // Explicitly block SVG data URIs, which can contain executable scripts.
    if (/^data:image\/svg/i.test(trimmed)) {
        return '';
    }
    
    // Allow http, https, and specific safe data URI image types
    if (/^(https?:\/\/|data:image\/(png|jpeg|webp|gif|bmp))/i.test(trimmed)) {
        return trimmed;
    }

    return '';
};

/**
 * Sanitizes a CSS color value. Allows 3, 6, or 8 digit hex codes (for alpha/opacity).
 * @param dirty The color string to sanitize.
 * @returns A sanitized color string or a default color if invalid.
 */
export const sanitizeColor = (dirty: string | undefined | null): string => {
    const safeDefault = '#004e89';
    if (!dirty) return safeDefault;
    const trimmed = dirty.trim();
    // Regex for valid 3, 4, 6, or 8 digit hex color codes (supporting alpha)
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
        return trimmed;
    }
    return safeDefault;
};
