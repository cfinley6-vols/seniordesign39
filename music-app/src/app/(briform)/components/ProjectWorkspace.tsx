// src/app/briform/[id]/ProjectWorkspace.tsx
"use client";

import { useState, useCallback } from "react";
import YouTubeEmbed from "./YouTubeEmbed";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { saveProject } from "@/app/(briform)/briform/actions"
import BriformCanvas from "./BriformCanvas";

// Define the track type internally or import it
type Track = {
	id: string;
	name: string;
	duration_ms: number;
};

interface ProjectWorkspaceProps {
	projectId: string;
	// If you saved a video ID in the DB previously, you can pass it here to auto-load
	initialVideoId?: string | null;
}

export default function ProjectWorkspace({ projectId, initialVideoId }: ProjectWorkspaceProps) {
	// Initialize state based on whether we already have a video ID
	const [track, setTrack] = useState<Track | null>(
		initialVideoId ? { id: initialVideoId, name: "Project Video", duration_ms: 0 } : null
	);

	const [isSaving, setIsSaving] = useState(false);

	const handleSave = useCallback(async (videoId: string) => {
		setIsSaving(true);
		try {
			await saveProject(projectId, { video_id: videoId });
			console.log("Auto-saved video to Supabase");
		} catch (error) {
			console.error("Error saving project:", error);
		} finally {
			setIsSaving(false);
		}
	}, [projectId]);

	const handleVideoLoaded = (videoId: string) => {
		setTrack({
			id: videoId,
			name: "Project Video",
			duration_ms: 0, // Player will auto-detect
		});

		handleSave(videoId);
	};

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900" >
			<div className="fixed bottom-4 right-4 text-xs text-gray-400">
				{isSaving ? "Saving..." : "All changes saved"}
			</div>

			{!track ? (
				// State 1: No Video -> Show Input
				<YouTubeEmbed onVideoLoaded={handleVideoLoaded} />
			) : (
				// State 2: Video Loaded -> Show Timeline
				<div className="w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500" >

					<div className="flex justify-between items-end mb-4" >
						<h2 className="text-xl font-semibold" > Timeline </h2>
						< button
							onClick={() => setTrack(null)
							}
							className="text-xs text-red-500 hover:underline"
						>
							Change Video
						</button>
					</div>

					{/* Form Diagram */}
					<BriformCanvas selectedTrack={track} />

					{/* This is the component we built earlier */}
					<PlaybackTimeline selectedTrack={track} />
				</div>
			)}
		</div>
	);
}