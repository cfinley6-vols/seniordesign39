// src/app/briform/[id]/ProjectWorkspace.tsx
"use client";

import { useState } from "react";
import YouTubeEmbed from "./YouTubeEmbed";
import { PlaybackTimeline } from "./PlaybackTimeline";

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

	const handleVideoLoaded = (videoId: string) => {
		setTrack({
			id: videoId,
			name: "Project Video",
			duration_ms: 0, // Player will auto-detect
		});

		// TODO: Ideally, you would trigger a Server Action here to save 
		// this videoId to your Supabase 'bri_projects' table so it loads next time.
	};

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900" >

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

					{/* This is the component we built earlier */}
					<PlaybackTimeline selectedTrack={track} />

					{/* Add your Diagram Canvas or other tools below here */}
					<div className="mt-8 p-12 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-400" >
						[Diagram Canvas Area]
					</div>
				</div>
			)}
		</div>
	);
}