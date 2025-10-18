"use client";
import { useState, useRef } from "react";
import { TrackSelector } from "./TrackSelector";

interface Project {
	id: string;
	name: string;
	updated_at?: string;
	[key: string]: any;
}

interface ProjectInterfaceProps {
	project: Project;
	accessToken: string;
}

interface Track {
	id: string;
	name: string;
	artists: { name: string }[];
	album: { images: { url: string }[] };
	duration_ms: number;
}

interface Region {
	start: number;
	end: number;
	label: string;
}

export function ProjectInterface({ project, accessToken }: ProjectInterfaceProps) {
	const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
	const [regions, setRegions] = useState<Region[]>([]);
	const [hoverTime, setHoverTime] = useState<number | null>(null);
	const [dragStart, setDragStart] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const timelineRef = useRef<HTMLDivElement>(null);

	// totalDuration uses actual selected track if available
	const totalDuration = selectedTrack ? selectedTrack.duration_ms / 1000 : 180;

	// --- Timeline mouse handlers ---
	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = (x / rect.width) * totalDuration;
		setHoverTime(time);
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = (x / rect.width) * totalDuration;
		setDragStart(time);
		setIsDragging(true);
	};

	const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current || dragStart === null) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const endTime = (x / rect.width) * totalDuration;
		setIsDragging(false);

		const start = Math.min(dragStart, endTime);
		const end = Math.max(dragStart, endTime);
		
		const input = prompt("Enter region label");
		if (input === null) return;
		const label = input.trim() === "" ? "Unnamed" : input;

		setRegions((prev) => [...prev, { start, end, label }]);
		setDragStart(null);
	};

	// --- Render ---
	return (
		<div className="p-6 text-gray-700 dark:text-gray-300">
			<h1 className="text-3xl font-bold mb-4">{project.name}</h1>
			<p className="text-gray-400 mb-6">
				Last updated{" "}
				{project.updated_at
					? new Date(project.updated_at).toLocaleString()
					: "Unknown"}
			</p>

			{/* Track selector only visible before a track is chosen */}
			{!selectedTrack && (
				<TrackSelector
					accessToken={accessToken}
					onSelectTrack={(track) => setSelectedTrack(track)}
				/>
			)}

			{/* Timeline only shown after selecting a track */}
			{selectedTrack && (
				<div className="mt-6">
					<h2 className="text-xl font-bold mb-2">
						Timeline for {selectedTrack.name}
					</h2>

					{hoverTime !== null && (
						<p className="text-sm text-gray-400 mb-2">
							Hovering at: {hoverTime.toFixed(2)}s
						</p>
					)}

					<div
						ref={timelineRef}
						className="w-full h-16 bg-gray-800 relative rounded-md cursor-crosshair"
						onMouseMove={handleMouseMove}
						onMouseDown={handleMouseDown}
						onMouseUp={handleMouseUp}
					>
						{regions.map((r, i) => (
							<div
								key={i}
								className="absolute top-0 h-16 bg-blue-500 bg-opacity-60 border border-blue-300"
								style={{
									left: `${(r.start / totalDuration) * 100}%`,
									width: `${((r.end - r.start) / totalDuration) * 100}%`,
								}}
								title={`${r.label}: ${r.start.toFixed(1)}s - ${r.end.toFixed(1)}s`}
							/>
						))}
					</div>

					<ul className="mt-3">
						{regions.map((r, i) => (
							<li key={i}>
								{r.label} – {r.start.toFixed(2)}s to {r.end.toFixed(2)}s
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}