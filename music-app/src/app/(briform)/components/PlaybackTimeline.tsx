// music-app/src/app/briform/[id]/PlaybackTimeline.tsx
"use client";

import { useEffect, useRef } from "react";

declare global {
	interface Window {
		onYouTubeIframeAPIReady: () => void;
		YT: any;
	}
}

interface PlaybackTimelineProps {
    videoId: string;
    // Callbacks to update Parent State
    onDurationChange: (d: number) => void;
    onTimeUpdate: (t: number) => void;
    onStateChange: (isPlaying: boolean) => void;
    onReady: () => void;
    // Pass the ref back to parent so Canvas can use it
    setPlayerRef: (ref: any) => void;
}

export function PlaybackTimeline({
    videoId,
    onDurationChange,
    onTimeUpdate,
    onStateChange,
    onReady,
    setPlayerRef,
}: PlaybackTimelineProps) {
    const internalPlayerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial Load
    useEffect(() => {
        if (!videoId) return;

        const loadPlayer = () => {
            if (!containerRef.current) return;
            // Clean up existing
            if (internalPlayerRef.current) {
                try { internalPlayerRef.current.destroy(); } catch {}
            }

            const newPlayer = new window.YT.Player(containerRef.current, {
                height: "100%",
                width: "100%",
                videoId: videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 0, // We control it via Canvas
                    modestbranding: 1,
                    rel: 0,
                },
                events: {
                    onReady: (event: any) => {
                        const d = event.target.getDuration();
                        onDurationChange(d);
                        onReady();
                        // Share ref with parent
                        setPlayerRef(internalPlayerRef);
                    },
                    onStateChange: (event: any) => {
                        onStateChange(event.data === window.YT.PlayerState.PLAYING);
                    },
                },
            });
            internalPlayerRef.current = newPlayer;
        };

        if (!window.YT) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            document.body.appendChild(tag);
            window.onYouTubeIframeAPIReady = loadPlayer;
        } else {
            loadPlayer();
        }

        return () => {
            try { internalPlayerRef.current?.destroy(); } catch {}
        };
    }, [videoId]);

    // Polling for Time (YouTube doesn't emit continuous events)
    useEffect(() => {
        const interval = setInterval(() => {
            if (internalPlayerRef.current && typeof internalPlayerRef.current.getCurrentTime === 'function') {
                const t = internalPlayerRef.current.getCurrentTime();
                onTimeUpdate(t);
            }
        }, 100); // 100ms for smoother playhead
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full max-w-5xl mx-auto">
             <div className="mb-4 aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
                <div ref={containerRef} className="w-full h-full" />
            </div>
        </div>
    );
}