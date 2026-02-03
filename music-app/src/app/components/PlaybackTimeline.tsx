// music-app/src/app/components/PlaybackTimeline.tsx
// Legacy Code
"use client";
import { useEffect, useRef, useState } from "react";

interface PlaybackTimelineProps {
	accessToken: string;
	selectedTrack: {
		id: string;
		name: string;
		uri?: string;
		duration_ms: number;
		preview_url?: string;
	};
}

export function PlaybackTimeline({ accessToken, selectedTrack }: PlaybackTimelineProps) {
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [isReady, setIsReady] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const timelineRef = useRef<HTMLDivElement>(null);
	const totalDuration = selectedTrack.duration_ms / 1000;

	// --- Fetch user's available devices ---
	useEffect(() => {
		const fetchDevices = async () => {
			try {
				const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
					headers: { Authorization: `Bearer ${accessToken}` },
				});
				const data = await res.json();
				if (data.devices && data.devices.length > 0) {
					const active = data.devices.find((d: any) => d.is_active);
					setDeviceId(active ? active.id : data.devices[0].id);
					setIsReady(true);
				} else {
					setErrorMsg("No active Spotify device found. Open Spotify on any device first.");
				}
			} catch (err) {
				console.error("Error fetching devices:", err);
				setErrorMsg("Failed to fetch Spotify devices.");
			}
		};
		fetchDevices();
	}, [accessToken]);

	// --- Poll current playback progress ---
	useEffect(() => {
		if (!isPlaying) return;
		const interval = setInterval(async () => {
			try {
				const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
					headers: { Authorization: `Bearer ${accessToken}` },
				});
				if (res.ok) {
					const data = await res.json();
					if (data?.progress_ms) setCurrentTime(data.progress_ms / 1000);
				}
			} catch (err) {
				console.error("Error polling playback:", err);
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [isPlaying, accessToken]);

	// --- Queue + skip approach (Free-friendly) ---
	const playTrack = async () => {
		setErrorMsg(null);
		try {
			const trackUri = selectedTrack.uri ?? `spotify:track:${selectedTrack.id}`;

			// Add to queue
			const queueRes = await fetch(
				`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${accessToken}` },
				}
			);

			if (!queueRes.ok) {
				const msg = await queueRes.text();
				console.error("Queue error:", msg);
				setErrorMsg("Couldn't add track to Spotify queue. Make sure Spotify is open and playing.");
				return;
			}

			// Skip to the newly queued track
			const nextRes = await fetch("https://api.spotify.com/v1/me/player/next", {
				method: "POST",
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			if (!nextRes.ok) {
				const msg = await nextRes.text();
				console.error("Skip error:", msg);
				setErrorMsg("Couldn't skip to the queued track.");
				return;
			}

			setIsPlaying(true);
		} catch (err) {
			console.error("Play error:", err);
			setErrorMsg("Something went wrong starting playback.");
		}
	};

	// --- Pause ---
	const pauseTrack = async () => {
		try {
			await fetch("https://api.spotify.com/v1/me/player/pause", {
				method: "PUT",
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			setIsPlaying(false);
		} catch (err) {
			console.error("Pause error:", err);
		}
	};

	// --- Seek playback ---
	const handleSeek = async (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = Math.max(0, Math.min((x / rect.width) * totalDuration, totalDuration));
		try {
			await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${time * 1000}`, {
				method: "PUT",
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			setCurrentTime(time);
		} catch (err) {
			console.error("Seek error:", err);
		}
	};

	return (
		<div className="mt-10">

			{errorMsg && <p className="text-red-400 mb-3">{errorMsg}</p>}
			{!isReady && !errorMsg && (
				<p className="text-yellow-400 mb-3">Checking for Spotify devices…</p>
			)}

			{/* Playback timeline bar */}
			<div
				ref={timelineRef}
				className="w-full h-8 bg-gray-800 relative rounded-md overflow-hidden cursor-pointer"
				onClick={handleSeek}
			>
				<div
					className="absolute top-0 bottom-0 w-[2px] bg-red-500"
					style={{ left: `${(currentTime / totalDuration) * 100}%` }}
				></div>
			</div>

			{/* Playback controls */}
			<div className="flex items-center space-x-4 mt-4">
				<button
					className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
					disabled={!isReady}
					onClick={isPlaying ? pauseTrack : playTrack}
				>
					{isPlaying ? "Pause" : "Play"}
				</button>

				<p className="text-gray-300">
					{Math.floor(currentTime)}s / {Math.floor(totalDuration)}s
				</p>
			</div>
		</div>
	);
}