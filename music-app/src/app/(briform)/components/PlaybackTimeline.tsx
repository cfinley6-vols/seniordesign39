// music-app/src/app/briform/[id]/PlaybackTimeline.tsx
"use client";
import { useEffect, useRef, useState } from "react";

declare global {
	interface Window {
		onYouTubeIframeAPIReady: () => void;
		YT: any;
	}
}

interface PlaybackTimelineProps {
	selectedTrack: {
		id: string;
		name: string;
		duration_ms: number;
	}
}

export function PlaybackTimeline({ selectedTrack }: PlaybackTimelineProps) {
	// State: Player
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(selectedTrack.duration_ms / 1000);
	const [isReady, setIsReady] = useState(false);

	// Refs
	const playerRef = useRef<any>(null); // Player instance
	const timelineRef = useRef<HTMLDivElement>(null);
	const playerContainerRef = useRef<HTMLDivElement>(null); // Actual <iframe> container

	// Initialize YouTube Player
	useEffect(() => {
		if (!selectedTrack.id) return;

		const loadPlayer = () => {
			// If player already exists for this ID, just don't re-init
			if (playerRef.current) {
				playerRef.current.destroy();
			}

			playerRef.current = new window.YT.Player(playerContainerRef.current, {
				height: "100%",
				width: "100%",
				videoId: selectedTrack.id,
				playerVars: {
					autoplay: 0,
					controls: 0, // Hide default controls
					modestbranding: 1,
					rel: 0,
				},
				events: {
					onReady: (event: any) => {
						setIsReady(true);
						const d = event.target.getDuration();
						if (d > 0) setDuration(d);
					},
					onStateChange: (event: any) => {
						setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
					},
				},
			});
		};

		if (!window.YT) {
			const tag = document.createElement("script");
			tag.src = "https://www.youtube.com/iframe_api";
			const firstScriptTag = document.getElementsByTagName("script")[0];
			firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
			window.onYouTubeIframeAPIReady = loadPlayer;
		} else {
			loadPlayer();
		}

	}, [selectedTrack.id]);

	// Poll for time
	useEffect(() => {
		if (!isPlaying || !playerRef.current) return;

		const interval = setInterval(() => {
			try {
				const time = playerRef.current.getCurrentTime();
				if (time !== undefined) setCurrentTime(time);
			} catch (err) {
				console.error("Polling error", err);
			}
		}, 500);

		return () => clearInterval(interval);
	}, [isPlaying]);

	// Handlers
	const togglePlay = () => {
		if (!playerRef.current) return;

		if (isPlaying) {
			playerRef.current.pauseVideo();
		} else {
			playerRef.current.playVideo();
		}
	};

	const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current || !playerRef.current) return;

		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const clickRatio = x / rect.width;

		const newTime = clickRatio * duration;

		playerRef.current.seekTo(newTime, true);
		setCurrentTime(newTime);
	};

	return (
		<div className="w-full max-w-4xl mx-auto mt-6">

			{/* Timeline Bar */}
			<div ref={timelineRef} className="w-full h-8 bg-gray-700 relative rounded cursor-pointer mb-4" onClick={handleSeek}>
				<div className="absolute top-0 bottom-0 bg-blue-500 transition-all duration-100" style={{ width: `${(currentTime / duration) * 100}%` }} />
			</div>

			{/* Controls */}
			<div className="flex justify-between items-center">
				<button
					onClick={togglePlay}
					disabled={!isReady}
					className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
				>
					{isPlaying ? "Pause" : "Play"}
				</button>
				<span className="text-gray-300 font-mono">
					{Math.floor(currentTime)}s / {Math.floor(duration)}s
				</span>
			</div>

			{/* Hidden Player Container (Required by YouTube API) */}
			<div className="mb-4 aspect-video bg-black rounded overflow-hidden">
				<div ref={playerContainerRef} />
			</div>
		</div>
	);
}