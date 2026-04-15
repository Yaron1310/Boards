import { useState, useEffect, useRef } from 'react';

type Provider = 'youtube' | 'vimeo';

function parseVideoUrl(url: string): { provider: Provider; id: string } | null {
    if (!url) return null;
    const ytMatch = url.match(
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]+)/
    );
    if (ytMatch) return { provider: 'youtube', id: ytMatch[1] };
    const vimeoMatch = url.match(
        /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/
    );
    if (vimeoMatch) return { provider: 'vimeo', id: vimeoMatch[1] };
    return null;
}

// YouTube IFrame API singleton loader
let ytState: 'idle' | 'loading' | 'ready' = 'idle';
const ytCallbacks: Array<() => void> = [];

function loadYouTubeApi(): Promise<void> {
    return new Promise((resolve) => {
        if (ytState === 'ready') { resolve(); return; }
        ytCallbacks.push(resolve);
        if (ytState === 'idle') {
            ytState = 'loading';
            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(script);
            (window as any).onYouTubeIframeAPIReady = () => {
                ytState = 'ready';
                ytCallbacks.forEach(cb => cb());
                ytCallbacks.length = 0;
            };
        }
    });
}

// Vimeo Player SDK singleton loader
let vimeoState: 'idle' | 'loading' | 'ready' = 'idle';
const vimeoCallbacks: Array<() => void> = [];

function loadVimeoApi(): Promise<void> {
    return new Promise((resolve) => {
        if (vimeoState === 'ready') { resolve(); return; }
        vimeoCallbacks.push(resolve);
        if (vimeoState === 'idle') {
            vimeoState = 'loading';
            const script = document.createElement('script');
            script.src = 'https://player.vimeo.com/api/player.js';
            script.onload = () => {
                vimeoState = 'ready';
                vimeoCallbacks.forEach(cb => cb());
                vimeoCallbacks.length = 0;
            };
            document.head.appendChild(script);
        }
    });
}

/**
 * Fetches the duration (in seconds) of a YouTube or Vimeo video using their
 * respective Player SDKs via a hidden off-screen iframe.
 *
 * Works with domain-restricted private videos because the iframe loads on
 * the current origin, which must be whitelisted by the video owner.
 *
 * @param videoUrl - YouTube or Vimeo URL. Pass an empty string to skip.
 * @returns duration in seconds (null if unavailable) and an isLoading flag.
 */
export function useVideoDuration(videoUrl: string): { duration: number | null; isLoading: boolean } {
    const [duration, setDuration] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const cancelledRef = useRef(false);
    const cleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const parsed = parseVideoUrl(videoUrl);
        if (!parsed) {
            setDuration(null);
            setIsLoading(false);
            return;
        }

        cancelledRef.current = false;
        setDuration(null);
        setIsLoading(true);

        // Debounce: wait 600ms after the user stops typing
        const timeoutId = setTimeout(async () => {
            cleanupRef.current?.();
            cleanupRef.current = null;

            try {
                if (parsed.provider === 'youtube') {
                    await loadYouTubeApi();
                    if (cancelledRef.current) return;

                    const container = document.createElement('div');
                    container.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
                    document.body.appendChild(container);

                    let player: any;
                    cleanupRef.current = () => {
                        try { player?.destroy(); } catch { /* ignore */ }
                        container.remove();
                    };

                    player = new (window as any).YT.Player(container, {
                        videoId: parsed.id,
                        playerVars: { autoplay: 0 },
                        events: {
                            onReady: () => {
                                if (cancelledRef.current) { cleanupRef.current?.(); cleanupRef.current = null; return; }
                                const d: number = player.getDuration?.() ?? 0;
                                setDuration(d > 0 ? d : null);
                                setIsLoading(false);
                                cleanupRef.current?.();
                                cleanupRef.current = null;
                            },
                            onError: () => {
                                if (!cancelledRef.current) setIsLoading(false);
                                cleanupRef.current?.();
                                cleanupRef.current = null;
                            },
                        },
                    });
                } else {
                    // Vimeo
                    await loadVimeoApi();
                    if (cancelledRef.current) return;

                    const VimeoPlayer = (window as any).Vimeo?.Player;
                    if (!VimeoPlayer) {
                        if (!cancelledRef.current) setIsLoading(false);
                        return;
                    }

                    const container = document.createElement('div');
                    container.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
                    document.body.appendChild(container);

                    const player = new VimeoPlayer(container, { id: Number(parsed.id), width: 1 });
                    cleanupRef.current = () => {
                        try { player.destroy(); } catch { /* ignore */ }
                        container.remove();
                    };

                    const d: number = await player.getDuration();
                    if (cancelledRef.current) { cleanupRef.current?.(); cleanupRef.current = null; return; }
                    setDuration(d > 0 ? d : null);
                    setIsLoading(false);
                    cleanupRef.current?.();
                    cleanupRef.current = null;
                }
            } catch {
                if (!cancelledRef.current) setIsLoading(false);
                cleanupRef.current?.();
                cleanupRef.current = null;
            }
        }, 600);

        return () => {
            clearTimeout(timeoutId);
            cancelledRef.current = true;
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [videoUrl]);

    return { duration, isLoading };
}
