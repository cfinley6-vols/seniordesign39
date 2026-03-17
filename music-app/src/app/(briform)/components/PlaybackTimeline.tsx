// src/app/briform/[id]/PlaybackTimeline.tsx
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
	currentTime: number;
	duration: number;
	onDurationChange: (d: number) => void;
	onTimeUpdate: (t: number) => void;
	onStateChange: (isPlaying: boolean) => void;
	onReady: () => void;
	setPlayerRef: (ref: any) => void;
}

export function PlaybackTimeline({
	videoId,
	currentTime,
	duration,
	onDurationChange,
	onTimeUpdate,
	onStateChange,
	onReady,
	setPlayerRef,
}: PlaybackTimelineProps) {
	const internalPlayerRef = useRef<any>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!videoId) return;

		const loadPlayer = () => {
			if (!containerRef.current) return;
			if (internalPlayerRef.current) {
				try { internalPlayerRef.current.destroy(); } catch { }
			}

			const newPlayer = new window.YT.Player(containerRef.current, {
				height: "100%",
				width: "100%",
				videoId: videoId,
				playerVars: {
					autoplay: 0,
					controls: 0,
					modestbranding: 1,
					rel: 0,
				},
				events: {
					onReady: (event: any) => {
						const d = event.target.getDuration();
						onDurationChange(d);
						onReady();
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
			try { internalPlayerRef.current?.destroy(); } catch { }
		};
	}, [videoId]);

	useEffect(() => {
		const interval = setInterval(() => {
			if (internalPlayerRef.current && typeof internalPlayerRef.current.getCurrentTime === 'function') {
				const t = internalPlayerRef.current.getCurrentTime();
				onTimeUpdate(t);
			}
		}, 100);
		return () => clearInterval(interval);
	}, []);

	const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!duration || !internalPlayerRef.current) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const ratio = Math.max(0, Math.min(1, x / rect.width));
		const newTime = ratio * duration;

		internalPlayerRef.current.seekTo(newTime, true);
		onTimeUpdate(newTime);
	};

	return (
		<div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
			{/* The Custom Separately Displayed Timeline */}
			<section className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow-lg border border-gray-200 dark:border-gray-700">
				{/* The Scrubber Bar Track Wrapper (Matching the p-1 layout of the Canvas) */}
				<div className="relative w-full h-12 bg-gray-100 dark:bg-gray-900 rounded-lg p-1">

					<div
						className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer group flex items-center shadow-inner border border-gray-300 dark:border-gray-700"
						onClick={handleTimelineClick}
					>
						{/* Background Progress Fill */}
						<div
							className="absolute top-0 bottom-0 left-0 bg-red-500/30 rounded-l transition-all duration-75 ease-linear pointer-events-none"
							style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
						/>

						{/* Thin solid line through the middle (optional, but looks nice like YouTube) */}
						<div className="absolute w-full h-1 bg-gray-400 dark:bg-gray-500 rounded-full mx-1 pointer-events-none overflow-hidden">
							<div
								className="h-full bg-red-500 transition-all duration-75 ease-linear"
								style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
							/>
						</div>

						{/* Playhead Marker */}
						<div
							className="absolute z-10 w-0.5 top-0 bottom-0 bg-red-600 shadow-sm transition-all duration-75 ease-linear pointer-events-none"
							style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
						/>
					</div>

				</div>
			</section>

			{/* The Clean Video Container */}
			<div className="aspect-video bg-black rounded-lg overflow-hidden shadow-lg">
				<div ref={containerRef} className="w-full h-full pointer-events-none" />
			</div>
		</div>
	);
}