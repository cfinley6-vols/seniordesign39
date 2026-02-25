// src/app/briform/[id]/ProjectWorkspace.tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import YouTubeEmbedWithSearch from "./YouTubeEmbedWithSearch";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { saveProject } from "@/app/(briform)/briform/actions"
import BriformCanvas, { Region } from "./BriformCanvas";

type Track = {
	id: string;
	name: string;
	duration_ms: number;
};

interface ProjectWorkspaceProps {
	projectId: string;
	initialVideoId?: string | null;
}

export default function ProjectWorkspace({ projectId, initialVideoId }: ProjectWorkspaceProps) {
	// Initialize state based on whether we already have a video ID
	const [track, setTrack] = useState<Track | null>(
		initialVideoId ? { id: initialVideoId, name: "Project Video", duration_ms: 0 } : null
	);
	const [regions, setRegions] = useState<Region[]>([]);

	// Player State
	const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

	// We hold the ref here to pass to both children
    const playerRef = useRef<any>(null);

	const [isSaving, setIsSaving] = useState(false);
	const isLoadedRef = useRef(false);

	const handleSaveVideo = useCallback(async (videoId: string) => {
        setIsSaving(true);
        try {
            await saveProject(projectId, { video_id: videoId });
        } catch (error) {
            console.error("Error saving project:", error);
        } finally {
            setIsSaving(false);
        }
    }, [projectId]);

	const handleVideoLoaded = (videoId: string) => {
        setTrack({ id: videoId, name: "Project Video", duration_ms: 0 });
        handleSaveVideo(videoId);
        // Reset state
        setRegions([]);
        setCurrentTime(0);
    };

	const togglePlay = () => {
        if (!playerRef.current) return;
        
        if (isPlaying) {
            playerRef.current.pauseVideo();
            setIsPlaying(false);
        } else {
            playerRef.current.playVideo();
            setIsPlaying(true);
        }
    };

	useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if the user is typing in an input or textarea
            if (
                e.target instanceof HTMLInputElement || 
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            // Listen for the Spacebar
            if (e.code === "Space") {
                e.preventDefault(); // Prevents the page from scrolling down
                togglePlay();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isPlaying]);
	
    // ===== 1. LOAD REGIONS =====
    useEffect(() => {
        if (!track) return;
        
        let isMounted = true;
        const loadRegions = async () => {
            try {
                // Note: Make sure this URL points to an API route returning JSON, not the page HTML!
                const response = await fetch(`/api/briform/${projectId}`);
                const data = await response.json();
                
                if (isMounted) {
                    if (data && data.regions) {
                        setRegions(data.regions);
                    }
                    
                    // Crucial step: Wait a tiny tick for React to process the setRegions update,
                    // then flip the flag to allow auto-saving.
                    setTimeout(() => {
                        if (isMounted) isLoadedRef.current = true;
                    }, 50);
                }
            } catch (error) {
                console.error("Error loading regions:", error);
                // Even if it fails, allow saving moving forward so new work isn't lost
                if (isMounted) isLoadedRef.current = true; 
            }
        };

        // Reset the flag whenever the track changes (like loading a new video)
        isLoadedRef.current = false; 
        loadRegions();

        // Cleanup function to prevent state updates if the component unmounts
        return () => { isMounted = false; };
    }, [track, projectId]);

    // ===== 2. AUTO-SAVE REGIONS =====
    useEffect(() => {
        // Prevent saving if there is no track, OR if we haven't finished the initial load yet
        if (!track || !isLoadedRef.current) return; 

        const saveRegions = async () => {
            setIsSaving(true);
            try {
                // Ensure your database schema expects '{ data: ... }' and not '{ regions: ... }'
                await saveProject(projectId, { data: regions });
            } catch (error) {
                console.error("Error saving regions:", error);
            } finally {
                setIsSaving(false);
            }
        }
        
        // Debounce: Wait 750ms after the user stops making changes before saving.
        // This prevents spamming the database while dragging bubbles.
        const timeoutId = setTimeout(() => {
            saveRegions();
        }, 750);

        return () => clearTimeout(timeoutId);
    }, [regions, track, projectId]);

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900" >
			<div className="fixed bottom-4 right-4 text-xs text-gray-400">
				{isSaving ? "Saving..." : "All changes saved"}
			</div>

			{!track ? (
                <div className="flex items-center justify-center h-full w-full">
                    <YouTubeEmbedWithSearch onVideoLoaded={handleVideoLoaded} />
                </div>
            ) : (
                <div className="w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-end mb-4">
                        <h2 className="text-xl font-semibold">Workspace</h2>
                        <button
                            onClick={() => {
                                if(confirm("Change video? Current regions will be lost.")) {
                                    setTrack(null);
                                }
                            }}
                            className="text-xs text-red-500 hover:underline"
                        >
                            Change Video
                        </button>
                    </div>

                    {/* The Canvas (Visuals + Controls) */}
                    <BriformCanvas 
                        regions={regions}
                        setRegions={setRegions}
                        currentTime={currentTime}
                        duration={duration}
                        isPlaying={isPlaying}
                        isReady={isPlayerReady}
                        playerRef={playerRef}
                        togglePlay={togglePlay}
                    />

                    {/* The Engine (Video Player) */}
                    <PlaybackTimeline 
                        videoId={track.id}
						currentTime={currentTime}
                        duration={duration}
                        onDurationChange={setDuration}
                        onTimeUpdate={setCurrentTime}
                        onStateChange={setIsPlaying}
                        onReady={() => setIsPlayerReady(true)}
                        setPlayerRef={(ref) => (playerRef.current = ref.current)}
                    />
                </div>
            )}
        </div>
	);
}