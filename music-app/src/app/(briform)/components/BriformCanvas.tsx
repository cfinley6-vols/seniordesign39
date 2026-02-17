// src/app/briform/[id]/BriformCanvas.tsx
"use client";

import { useState, useRef, useMemo } from "react";

// Export this type so ProjectWorkspace can use it
export type Region = {
    start: number;
    end: number;
    label: string;
};

type DragMode = "none" | "move" | "resize-start" | "resize-end";

interface BriformCanvasProps {
    regions: Region[];
    setRegions: React.Dispatch<React.SetStateAction<Region[]>>;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    isReady: boolean;
    playerRef: any;
    togglePlay: () => void;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export default function BriformCanvas({
    regions,
    setRegions,
    currentTime,
    duration,
    isPlaying,
    isReady,
    playerRef,
    togglePlay,
}: BriformCanvasProps) {
    const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [activeRegion, setActiveRegion] = useState<number | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>("none");

    const timelineRef = useRef<HTMLDivElement>(null);

    // --- Utilities ---
    const isOverlapping = (start: number, end: number, excludeIndex: number | null = null) =>
        regions.some((r, i) => {
            if (excludeIndex !== null && i === excludeIndex) return false;
            return start < r.end && end > r.start;
        });

    const timeFromMouse = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineRef.current) return null;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = rect.width > 0 ? x / rect.width : 0;
        return clamp(ratio * (duration || 1), 0, duration || 1);
    };

    const seekTo = (seconds: number) => {
        if (playerRef?.current && typeof playerRef.current.seekTo === "function") {
            const t = clamp(seconds, 0, duration || seconds);
            playerRef.current.seekTo(t, true);
        }
    };

    const skip = (deltaSeconds: number) => seekTo(currentTime + deltaSeconds);

    // --- Logic ---
    const handleMark = () => {
        if (!duration || duration <= 0) return;
        const defaultLen = 8;
        const start = clamp(currentTime, 0, duration);
        const end = clamp(start + defaultLen, 0, duration);

        if (end - start < 0.25) return;
        if (isOverlapping(start, end)) {
            alert("Overlap detected.");
            return;
        }
        const label = prompt("Label for this section:", "New Section") || "New Section";
        setRegions((prev) => [...prev, { start, end, label }].sort((a, b) => a.start - b.start));
    };

    const handleSplit = () => {
        const t = currentTime;
        const idx = regions.findIndex((r) => t > r.start && t < r.end);
        if (idx === -1) { alert("Playhead must be inside a bubble to split"); return; }
        const r = regions[idx];
        if (t - r.start < 0.25 || r.end - t < 0.25) { alert("Split point too close to edge."); return; }

        setRegions((prev) => {
            const updated = [...prev];
            updated.splice(idx, 1, { start: r.start, end: t, label: r.label }, { start: t, end: r.end, label: r.label });
            return updated.sort((a, b) => a.start - b.start);
        });
        setSelectedRegionIds(new Set());
    };

    const handleGroup = () => {
        const ids = Array.from(selectedRegionIds.values()).sort((a, b) => a - b);
        if (ids.length < 2) { alert("Select at least 2 regions to group."); return; }
        const selected = ids.map((i) => regions[i]);
        const start = Math.min(...selected.map((r) => r.start));
        const end = Math.max(...selected.map((r) => r.end));
        const remaining = regions.filter((_, i) => !selectedRegionIds.has(i));
        if (remaining.some((r) => start < r.end && end > r.start)) { alert("Group overlaps existing region."); return; }
        const label = prompt("Group label:", "Grouped Section") || "Grouped Section";
        setRegions([...remaining, { start, end, label }].sort((a, b) => a.start - b.start));
        setSelectedRegionIds(new Set());
    };

    const handleClear = () => {
        if (confirm("Clear all regions?")) { setRegions([]); setSelectedRegionIds(new Set()); }
    };

    // --- Mouse Events ---
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e);
        if (t === null) return;
        setHoverTime(t);

        if (dragMode !== "none" && activeRegion !== null) {
            setRegions((prev) => {
                const updated = [...prev];
                const region = { ...updated[activeRegion] };
                if (dragMode === "move") {
                    const width = region.end - region.start;
                    const newStart = t - width / 2;
                    const newEnd = newStart + width;
                    if (newStart >= 0 && newEnd <= duration && !isOverlapping(newStart, newEnd, activeRegion)) {
                        region.start = newStart; region.end = newEnd;
                    }
                } else if (dragMode === "resize-start") {
                    if (t >= 0 && t < region.end && !isOverlapping(t, region.end, activeRegion)) region.start = t;
                } else if (dragMode === "resize-end") {
                    if (t <= duration && t > region.start && !isOverlapping(region.start, t, activeRegion)) region.end = t;
                }
                updated[activeRegion] = region;
                return updated.sort((a, b) => a.start - b.start);
            });
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e); if (t === null) return;
        setDragStart(t); setIsCreating(true);
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e);
        if (t !== null && isCreating && dragStart !== null) {
            const start = Math.min(dragStart, t); const end = Math.max(dragStart, t);
            if (Math.abs(end - start) > 0.25 && !isOverlapping(start, end)) {
                const label = prompt("Enter region label", "New Section") || "New Section";
                setRegions((prev) => [...prev, { start, end, label }].sort((a, b) => a.start - b.start));
            }
        }
        setIsCreating(false); setDragMode("none"); setActiveRegion(null); setDragStart(null);
    };

    const prettyTime = useMemo(() => {
        const s = Math.floor(currentTime);
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, "0")}`;
    }, [currentTime]);

    // --- RENDER ---
    return (
        // REMOVED 'animate-in' and 'fade-in' which often cause invisibility if config is missing
        // ADDED 'border' to debug visibility
        <section className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow-lg mb-6 border border-gray-200 dark:border-gray-700">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-lg">Timeline Canvas</div>
                <div className="text-sm opacity-80 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                    {prettyTime} / {duration ? Math.floor(duration) : 0}s
                </div>
            </div>

            {/* Timeline Bar - ADDED explicit z-index and overflow-visible for debugging */}
            <div className="relative w-full h-16 bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
                <div
                    ref={timelineRef}
                    className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer overflow-hidden shadow-inner"
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onClick={(e) => {
                        const t = timeFromMouse(e);
                        if (t !== null && !isCreating) seekTo(t);
                    }}
                >
                    {/* Playhead */}
                    <div
                        className="absolute top-0 bottom-0 z-30 w-1 bg-red-500 shadow-sm pointer-events-none transition-all duration-75 ease-linear"
                        style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />

                    {/* Regions */}
                    {regions.map((r, i) => {
                        const selected = selectedRegionIds.has(i);
                        return (
                            <div
                                key={i}
                                className={`absolute top-2 bottom-2 rounded-md border px-2 flex items-center justify-center z-20 select-none ${
                                    selected
                                        ? "bg-blue-600 text-white border-blue-300 shadow-md"
                                        : "bg-blue-500/90 text-white border-blue-400/50 shadow-sm hover:bg-blue-500"
                                }`}
                                style={{
                                    left: `${duration ? (r.start / duration) * 100 : 0}%`,
                                    width: `${duration ? ((r.end - r.start) / duration) * 100 : 0}%`,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRegionIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(i)) next.delete(i); else next.add(i);
                                        return next;
                                    });
                                }}
                                onMouseDown={(e) => { e.stopPropagation(); setActiveRegion(i); setDragMode("move"); }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    const label = prompt("Rename:", r.label);
                                    if (label) setRegions(prev => prev.map((x, idx) => idx === i ? {...x, label} : x));
                                }}
                                onContextMenu={(e) => { e.preventDefault(); setRegions(prev => prev.filter((_, idx) => idx !== i)); }}
                            >
                                <span className="text-xs font-bold truncate pointer-events-none drop-shadow-md">{r.label}</span>
                                
                                {/* Resize Handles */}
                                <div className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-w-resize" 
                                     onMouseDown={(e) => { e.stopPropagation(); setActiveRegion(i); setDragMode("resize-start"); }} />
                                <div className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-e-resize" 
                                     onMouseDown={(e) => { e.stopPropagation(); setActiveRegion(i); setDragMode("resize-end"); }} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Helper Text */}
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 h-5">
                <span>{hoverTime !== null ? `Hover: ${Math.round(hoverTime * 10) / 10}s` : ""}</span>
                <span>Drag to create • Double-click to rename</span>
            </div>

            {/* Controls */}
            <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t dark:border-gray-700 pt-4">
                <button onClick={() => skip(-5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">-5s</button>
                <button onClick={togglePlay} className="px-6 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold w-24">
                    {isPlaying ? "Pause" : "Play"}
                </button>
                <button onClick={() => skip(5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">+5s</button>
                <div className="w-px h-6 bg-gray-300 mx-2"></div>
                <button onClick={handleSplit} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">Split</button>
                <button onClick={handleMark} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">Mark</button>
                <button onClick={handleGroup} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">Group</button>
                <button onClick={handleClear} className="px-3 py-1 text-red-500 hover:bg-red-50 rounded ml-2">Clear</button>
            </div>
        </section>
    );
}