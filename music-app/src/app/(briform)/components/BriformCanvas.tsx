// src/app/briform/[id]/BriformCanvas.tsx
"use client";

import { useState, useRef } from "react";

export type Region = {
    start: number;
    end: number;
    label: string;
    layer?: number;
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
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [markStart, setMarkStart] = useState<number | null>(null);
    const [activeRegion, setActiveRegion] = useState<number | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>("none");

    const isDraggingRef = useRef(false);
    const timelineRef = useRef<HTMLDivElement>(null);

    // --- Utilities ---
    // NEW: We now check overlapping only on the specific layer!
    const isOverlapping = (start: number, end: number, excludeIndex: number | null = null, layer: number = 0) =>
        regions.some((r, i) => {
            if (excludeIndex !== null && i === excludeIndex) return false;
            return (r.layer || 0) === layer && start < r.end && end > r.start;
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
    const handleDynamicMark = () => {
        if (!duration || duration <= 0) return;

        if (markStart === null) {
            setMarkStart(currentTime);
        } else {
            const start = Math.min(markStart, currentTime);
            const end = Math.max(markStart, currentTime);

            if (end - start < 0.25) { alert("Bubble is too short."); setMarkStart(null); return; }
            if (isOverlapping(start, end, null, 0)) { alert("This overlaps with an existing base bubble!"); setMarkStart(null); return; }
            
            const label = `Section ${regions.length + 1}`;
            setRegions((prev) => [...prev, { start, end, label, layer: 0 }]);
            setMarkStart(null); 
        }
    };

    const handleSplit = () => {
        const t = currentTime;
        // Find the region we are currently inside. Note: If multiple layers overlap this time, 
        // we'll default to the lowest one (base track) unless we make this selection-based later.
        const idx = regions.findIndex((r) => t > r.start && t < r.end);
        if (idx === -1) { alert("Playhead must be inside a bubble to split"); return; }
        
        const r = regions[idx];
        if (t - r.start < 0.25 || r.end - t < 0.25) { alert("Split point too close to edge."); return; }

        setRegions((prev) => {
            const updated = [...prev];
            // Split it, maintaining whatever layer it was on
            updated.splice(idx, 1, 
                { start: r.start, end: t, label: r.label, layer: r.layer || 0 }, 
                { start: t, end: r.end, label: r.label, layer: r.layer || 0 }
            );
            return updated;
        });
        setSelectedRegionIds(new Set());
    };

    const handleGroup = () => {
        const ids = Array.from(selectedRegionIds.values());
        if (ids.length < 2) { alert("Select at least 2 regions to group."); return; }
        
        const selected = ids.map((i) => regions[i]);
        const start = Math.min(...selected.map((r) => r.start));
        const end = Math.max(...selected.map((r) => r.end));

        // Figure out the highest layer currently among our selection
        const maxSelectedLayer = Math.max(...selected.map((r) => r.layer || 0));
        let targetLayer = maxSelectedLayer + 1;
        
        // Ensure the new overarching bubble doesn't crash into an existing one on that target tier
        while (regions.some(r => (r.layer || 0) === targetLayer && start < r.end && end > r.start)) {
            targetLayer++;
        }
        
        const label = `Grouped Section`;
        // Notice we are NO LONGER deleting the selected items! We just append the parent on top.
        setRegions(prev => [...prev, { start, end, label, layer: targetLayer }]);
        setSelectedRegionIds(new Set());
    };

    const handleClear = () => {
        if (confirm("Clear all regions?")) { setRegions([]); setSelectedRegionIds(new Set()); }
    };

    // --- Mouse Events ---
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e); 
        if (t === null) return;
        setDragStart(t); 
        isDraggingRef.current = false;
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e);
        if (t === null) return;
        if (e.buttons === 1) isDraggingRef.current = true;

        if (dragMode !== "none" && activeRegion !== null) {
            setRegions((prev) => {
                const updated = [...prev];
                const region = { ...updated[activeRegion] };
                const currentLayer = region.layer || 0;

                if (dragMode === "move") {
                    const width = region.end - region.start;
                    const newStart = t - width / 2;
                    const newEnd = newStart + width;
                    if (newStart >= 0 && newEnd <= duration && !isOverlapping(newStart, newEnd, activeRegion, currentLayer)) {
                        region.start = newStart; region.end = newEnd;
                    }
                } else if (dragMode === "resize-start") {
                    if (t >= 0 && t < region.end && !isOverlapping(t, region.end, activeRegion, currentLayer)) region.start = t;
                } else if (dragMode === "resize-end") {
                    if (t <= duration && t > region.start && !isOverlapping(region.start, t, activeRegion, currentLayer)) region.end = t;
                }
                updated[activeRegion] = region;
                return updated;
            });
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e);
        if (t !== null && dragStart !== null) {
            const start = Math.min(dragStart, t); 
            const end = Math.max(dragStart, t);
            
            if (Math.abs(end - start) > 0.25 && !isOverlapping(start, end, null, 0)) {
                const label = `Section ${regions.length + 1}`;
                setRegions((prev) => [...prev, { start, end, label, layer: 0 }]);
            } 
            else if (!isDraggingRef.current) {
                seekTo(t);
            }
        }
        setDragMode("none"); setActiveRegion(null); setDragStart(null); isDraggingRef.current = false;
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
    };

    // Calculate maximum layer to scale the height of the container dynamically
    const maxLayer = regions.length > 0 ? Math.max(...regions.map(r => r.layer || 0)) : 0;
    // Base padding + (Number of layers * 48px per layer)
    const containerHeightPx = 16 + ((maxLayer + 1) * 48);

    return (
        <section className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow-lg mb-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-lg">Form Diagram</div>
                <div className="text-sm opacity-80 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                    {formatTime(currentTime)} / {formatTime(duration ? Math.floor(duration) : 0)}
                </div>
            </div>

            {/* Dynamic Container Height based on active tiers */}
            <div 
                className="relative w-full bg-gray-100 dark:bg-gray-900 rounded-lg p-1 transition-all duration-300"
                style={{ height: `${containerHeightPx}px` }}
            >
                <div
                    ref={timelineRef}
                    className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer shadow-inner overflow-hidden"
                    onMouseMove={handleMouseMove}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                >   
                    {/* The Playhead Marker spans the whole height */}
                    <div
                        className="absolute top-0 bottom-0 z-30 w-1 bg-red-500 shadow-sm pointer-events-none transition-all duration-75 ease-linear"
                        style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />
                    
                    {/* Ghost Bubble (Always on Layer 0 at the bottom) */}
                    {markStart !== null && (
                        <div
                            className="absolute rounded-md border border-red-500 bg-red-500/40 z-10 pointer-events-none animate-pulse"
                            style={{
                                bottom: `8px`, height: `40px`, // Anchored to base layer
                                left: `${duration ? (markStart / duration) * 100 : 0}%`,
                                width: `${duration && currentTime > markStart ? ((currentTime - markStart) / duration) * 100 : 0}%`,
                            }}
                        />
                    )}

                    {regions.map((r, i) => {
                        const selected = selectedRegionIds.has(i);
                        const layer = r.layer || 0;
                        
                        return (
                            <div
                                key={i}
                                className={`absolute rounded-md border px-2 flex items-center justify-center z-20 select-none ${
                                    selected
                                        ? "bg-blue-600 text-white border-blue-300 shadow-md"
                                        : "bg-blue-500/90 text-white border-blue-400/50 shadow-sm hover:bg-blue-500"
                                }`}
                                style={{
                                    bottom: `${layer * 48 + 8}px`, // Stacks upwards based on layer tier
                                    height: `40px`,
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
                                    playerRef.current?.playVideo();
                                }}
                                onContextMenu={(e) => { e.preventDefault(); setRegions(prev => prev.filter((_, idx) => idx !== i)); }}
                            >
                                <span className="text-xs font-bold truncate pointer-events-none drop-shadow-md">{r.label}</span>
                                
                                <div className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-w-resize" 
                                     onMouseDown={(e) => { e.stopPropagation(); setActiveRegion(i); setDragMode("resize-start"); }} />
                                <div className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-e-resize" 
                                     onMouseDown={(e) => { e.stopPropagation(); setActiveRegion(i); setDragMode("resize-end"); }} />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 h-5">
                <span>Drag to create • Double-click to rename</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t dark:border-gray-700 pt-4">
                <button onClick={() => skip(-5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">-5s</button>
                <button onClick={togglePlay} className="px-6 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold w-24">
                    {isPlaying ? "Pause" : "Play"}
                </button>
                <button onClick={() => skip(5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">+5s</button>
                <div className="w-px h-6 bg-gray-300 mx-2"></div>
                <button onClick={handleSplit} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">Split</button>
                <button 
                    onClick={handleDynamicMark} 
                    className={`px-4 py-1 rounded font-semibold transition-colors w-32 ${
                        markStart !== null 
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-inner" 
                            : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-black dark:text-white"
                    }`}
                >
                    {markStart !== null ? "End Bubble" : "Start Bubble"}
                </button>
                <button onClick={handleGroup} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300">Group</button>
                <button onClick={handleClear} className="px-3 py-1 text-red-500 hover:bg-red-50 rounded ml-2">Clear</button>
            </div>
        </section>
    );
}