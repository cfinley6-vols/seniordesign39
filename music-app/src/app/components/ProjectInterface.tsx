// Timeline components are all handled in here
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

type DragMode = "none" | "move" | "resize-start" | "resize-end";

export function ProjectInterface({ project, accessToken }: ProjectInterfaceProps) {
	const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
	const [regions, setRegions] = useState<Region[]>([]);
	const [hoverTime, setHoverTime] = useState<number | null>(null);
	const [dragStart, setDragStart] = useState<number | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [activeRegion, setActiveRegion] = useState<number | null>(null);
	const [dragMode, setDragMode] = useState<DragMode>("none");
	const timelineRef = useRef<HTMLDivElement>(null);

	const totalDuration = selectedTrack ? selectedTrack.duration_ms / 1000 : 180;

	// --- Overlap check ---
	const isOverlapping = (start: number, end: number, excludeIndex: number | null = null) => {
		return regions.some((r, i) => {
			if (excludeIndex !== null && i === excludeIndex) return false;
			return start < r.end && end > r.start;
		});
	};

	// --- Hover and drag logic ---
	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = (x / rect.width) * totalDuration;
		setHoverTime(time);

		if (dragMode !== "none" && activeRegion !== null) {
			setRegions((prev) => {
				const updated = [...prev];
				const region = { ...updated[activeRegion] };

				switch (dragMode) {
					case "move": {
						const regionWidth = region.end - region.start;
						const newStart = time - regionWidth / 2;
						const newEnd = newStart + regionWidth;
						if (
							newStart >= 0 &&
							newEnd <= totalDuration &&
							!isOverlapping(newStart, newEnd, activeRegion)
						) {
							region.start = newStart;
							region.end = newEnd;
						}
						break;
					}
					case "resize-start": {
						if (
							time >= 0 &&
							time < region.end &&
							!isOverlapping(time, region.end, activeRegion)
						)
							region.start = time;
						break;
					}
					case "resize-end": {
						if (
							time <= totalDuration &&
							time > region.start &&
							!isOverlapping(region.start, time, activeRegion)
						)
							region.end = time;
						break;
					}
				}

				updated[activeRegion] = region;
				return updated;
			});
		}
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = (x / rect.width) * totalDuration;
		setDragStart(time);
		setIsCreating(true);
	};

	const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!timelineRef.current) return;
		const rect = timelineRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const endTime = (x / rect.width) * totalDuration;

		if (isCreating && dragStart !== null) {
			const start = Math.min(dragStart, endTime);
			const end = Math.max(dragStart, endTime);
			if (Math.abs(end - start) > 0.1 && !isOverlapping(start, end)) {
				const input = prompt("Enter region label");
				if (input !== null) {
					const label = input.trim() === "" ? "Unnamed" : input;
					setRegions((prev) => [...prev, { start, end, label }]);
				}
			} else if (isOverlapping(start, end)) {
				alert("Regions cannot overlap.");
			}
		}

		setIsCreating(false);
		setDragMode("none");
		setActiveRegion(null);
		setDragStart(null);
	};

	const startRegionDrag = (index: number, mode: DragMode) => {
		setActiveRegion(index);
		setDragMode(mode);
	};

	// --- Delete region ---
	const deleteRegion = (index: number) => {
		setRegions((prev) => prev.filter((_, i) => i !== index));
	};

	// --- Rename region ---
	const renameRegion = (index: number) => {
		const currentLabel = regions[index].label;
		const input = prompt("Rename region:", currentLabel);
		if (input === null) return;
		const newLabel = input.trim() === "" ? currentLabel : input;
		setRegions((prev) => {
			const updated = [...prev];
			updated[index] = { ...updated[index], label: newLabel };
			return updated;
		});
	};

	return (
		<div className="p-6 text-gray-700 dark:text-gray-300">
			<h1 className="text-3xl font-bold mb-4">{project.name}</h1>
			<p className="text-gray-400 mb-6">
				Last updated{" "}
				{project.updated_at
					? new Date(project.updated_at).toLocaleString()
					: "Unknown"}
			</p>

			{/* Track selector */}
			{!selectedTrack && (
				<TrackSelector
					accessToken={accessToken}
					onSelectTrack={(track) => setSelectedTrack(track)}
				/>
			)}

			{/* Timeline */}
			{selectedTrack && (
				<div className="mt-6 select-none">
					<h2 className="text-xl font-bold mb-2">
						Timeline for {selectedTrack.name}
					</h2>

					{hoverTime !== null && (
						<p className="text-sm text-gray-400 mb-2">
							Hovering at: {Math.round(hoverTime)}s
						</p>
					)}

					{/* Timeline bar */}
					<div
						ref={timelineRef}
						className="w-full h-16 bg-gray-800 relative rounded-md cursor-crosshair overflow-hidden"
						onMouseMove={handleMouseMove}
						onMouseDown={handleMouseDown}
						onMouseUp={handleMouseUp}
					>
						{regions.map((r, i) => (
							<div
								key={i}
								className={`absolute top-1/2 -translate-y-1/2 h-8 flex items-center justify-center
								bg-blue-500 bg-opacity-70 border border-blue-300 rounded-full shadow-md transition-transform
								${activeRegion === i ? "ring-2 ring-blue-400" : ""}
								`}
								style={{
									left: `${(r.start / totalDuration) * 100}%`,
									width: `${((r.end - r.start) / totalDuration) * 100}%`,
								}}
								onMouseDown={(e) => {
									e.stopPropagation();
									startRegionDrag(i, "move");
								}}
								onDoubleClick={() => renameRegion(i)}
								onContextMenu={(e) => {
									e.preventDefault();
									deleteRegion(i);
								}} // ✅ Right-click to delete
								title={`${r.label}: ${Math.round(r.start)}s – ${Math.round(r.end)}s`}
							>
								{/* Left resize handle */}
								<div
									className="absolute left-0 top-0 bottom-0 w-2 bg-blue-300 opacity-70 hover:bg-blue-200 cursor-ew-resize rounded-l-full"
									onMouseDown={(e) => {
										e.stopPropagation();
										startRegionDrag(i, "resize-start");
									}}
								></div>

								{/* Label */}
								<span className="text-xs text-white px-2 truncate pointer-events-none">
									{r.label}
								</span>

								{/* Right resize handle */}
								<div
									className="absolute right-0 top-0 bottom-0 w-2 bg-blue-300 opacity-70 hover:bg-blue-200 cursor-ew-resize rounded-r-full"
									onMouseDown={(e) => {
										e.stopPropagation();
										startRegionDrag(i, "resize-end");
									}}
								></div>
							</div>
						))}
					</div>

					{/* Region label list */}
					<ul className="mt-4 space-y-2">
						{regions.map((r, i) => (
							<li
								key={i}
								className="flex items-center justify-between bg-gray-900 rounded-md px-3 py-2"
								onDoubleClick={() => renameRegion(i)}
							>
								<div>
									<span className="font-medium text-white">{r.label}</span>{" "}
									<span className="text-sm text-gray-400">
										({Math.round(r.start)}s → {Math.round(r.end)}s)
									</span>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}