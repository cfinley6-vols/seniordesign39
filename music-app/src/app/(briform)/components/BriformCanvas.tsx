import { useState, useRef } from "react";

interface PlaybackTimelineProps {
	selectedTrack: {
		id: string;          // YouTube videoId
		name: string;
		duration_ms: number; // may be 0; we’ll read from player
	};
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, n));
}

type Region = { start: number; end: number; label: string };
type DragMode = "none" | "move" | "resize-start" | "resize-end";

export default function BriformCanvas({ selectedTrack }: PlaybackTimelineProps) {
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(
		selectedTrack.duration_ms > 0 ? selectedTrack.duration_ms / 1000 : 0
	);
	const [hasBubble, setHasBubble] = useState(false);

	// Briform Regions State
	const [regions, setRegions] = useState<Region[]>([]);
	const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
	const [hoverTime, setHoverTime] = useState<number | null>(null);

	// Drag behavior
	const [dragStart, setDragStart] = useState<number | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [activeRegion, setActiveRegion] = useState<number | null>(null);
	const [dragMode, setDragMode] = useState<DragMode>("none");

	// Refs
	const playerRef = useRef<any>(null);
	const diagramRef = useRef<HTMLDivElement>(null);
	const playerContainerRef = useRef<HTMLDivElement>(null);

	// Utility checks
	const isOverlapping = (start: number, end: number, excludeIndex: number | null = null) =>
		regions.some((r, i) => {
			if (excludeIndex !== null && i === excludeIndex) return false;
			return start < r.end && end > r.start;
		});

	const timeFromMouse = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!diagramRef.current) return null;
		const rect = diagramRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const ratio = rect.width > 0 ? x / rect.width : 0;
		return clamp(ratio * (duration || 1), 0, duration || 1);
	};

	const seekTo = (seconds: number) => {
		if (!playerRef.current) return;
		const t = clamp(seconds, 0, duration || seconds);
		playerRef.current.seekTo(t, true);
		setCurrentTime(t);
	};



	return (
		<div className="mt-8 p-12 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-400" >
			[Diagram Canvas Area]
		</div >
	);
}