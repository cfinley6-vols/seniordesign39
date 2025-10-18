"use client";
import { useState } from "react"
import { TrackSelector } from "./TrackSelector"

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

interface Marker {
	time: number;
	label: string;
}

export function ProjectInterface({ project, accessToken }: ProjectInterfaceProps) {
	const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
	const [markers, setMarkers] = useState<Marker[]>([]);

	// Add marker on timeline click
	const addMarker = (time: number) => {
		const label = prompt("Enter marker label") || "Untitled Marker";
		setMarkers((prev) => [...prev, { time, label }]);
	};

	return (
		<div className="p-6 text-gray-300">
			<h1 className="text-3xl font-bold mb-4">{project.name}</h1>
			<p className="text-gray-400 mb-6">
				Last updated {project.updated_at ? new Date(project.updated_at).toLocaleString() : "Unknown"}
			</p>

			{/* Track search & selection */}
			<TrackSelector accessToken={accessToken} onSelectTrack={(track) => setSelectedTrack(track)} />

			{/* Timeline */}
			{selectedTrack && (
				<div className="mt-6">
					<h2 className="text-xl font-bold mb-2">Timeline for {selectedTrack.name}</h2>

					<div
						className="w-full h-16 bg-gray-700 relative cursor-pointer mb-4"
						onClick={(e) => {
							const rect = (e.target as HTMLDivElement).getBoundingClientRect();
							const clickX = e.clientX - rect.left;
							const time = (clickX / rect.width) * (selectedTrack.duration_ms / 1000);
							addMarker(time);
						}}
					>
						{markers.map((m, i) => (
							<div
								key={i}
								className="absolute w-1 h-16 bg-red-500"
								style={{ left: `${(m.time / (selectedTrack.duration_ms / 1000)) * 100}%` }}
								title={m.label}
							/>
						))}
					</div>

					<ul>
						{markers.map((m, i) => (
							<li key={i}>
								{m.label} – {m.time.toFixed(2)}s
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}