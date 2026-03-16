// src/app/briform/[id]/BriformCanvas.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type Region = {
    id: string;
    start: number;
    end: number;
    label: string;
    layer?: number;
    parentId?: string;
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

// --- Sync Helpers ---

const syncParents = (regions: Region[]): Region[] => {
    const sorted = [...regions].sort((a, b) => (a.layer || 0) - (b.layer || 0));
    const map = new Map(sorted.map((r) => [r.id, { ...r }]));

    for (const r of sorted) {
        const children = [...map.values()].filter((c) => c.parentId === r.id);
        if (children.length === 0) continue;
        const updated = map.get(r.id)!;
        updated.start = Math.min(...children.map((c) => c.start));
        updated.end = Math.max(...children.map((c) => c.end));
        map.set(r.id, updated);
    }

    return [...map.values()];
};

const cleanOrphanedParents = (regions: Region[]): Region[] => {
    return regions.filter((r) => {
        const childCount = regions.filter((c) => c.parentId === r.id).length;
        const isParent = regions.some((c) => c.parentId === r.id);
        return !isParent || childCount >= 2;
    });
};

const syncRegions = (regions: Region[]): Region[] => {
    const cleaned = cleanOrphanedParents(regions);
    const validIds = new Set(cleaned.map((r) => r.id));
    const deOrphaned = cleaned.map((r) =>
        r.parentId && !validIds.has(r.parentId) ? { ...r, parentId: undefined } : r
    );
    return syncParents(deOrphaned);
};

/**
 * When resizing a bubble's edge, push/shrink the immediate neighbor on the
 * same layer so they stay flush. The neighbor cannot shrink below MIN_WIDTH.
 */
const MIN_WIDTH = 0.25;

function applyResizeWithNeighbor(
    regions: Region[],
    activeId: string,
    dragMode: "resize-start" | "resize-end",
    t: number,
    duration: number
): Region[] {
    const idx = regions.findIndex((r) => r.id === activeId);
    if (idx === -1) return regions;

    const updated = regions.map((r) => ({ ...r }));
    const region = updated[idx];
    const layer = region.layer || 0;

    // Only bubbles on the same layer
    const layerBubbles = updated
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => (r.layer || 0) === layer);

    if (dragMode === "resize-end") {
        // Clamp t so the active bubble keeps MIN_WIDTH
        const newEnd = clamp(t, region.start + MIN_WIDTH, duration);

        // Find the bubble immediately to the right on this layer
        const rightNeighbor = layerBubbles
            .filter(({ r }) => r.id !== activeId && r.start >= region.end - MIN_WIDTH)
            .sort((a, b) => a.r.start - b.r.start)[0];

        if (rightNeighbor) {
            const neighbor = updated[rightNeighbor.i];
            // Don't let neighbor shrink below MIN_WIDTH
            const maxEnd = neighbor.end - MIN_WIDTH;
            const clampedEnd = Math.min(newEnd, maxEnd);
            updated[idx].end = clampedEnd;
            neighbor.start = clampedEnd;
        } else {
            updated[idx].end = newEnd;
        }
    } else {
        // resize-start
        const newStart = clamp(t, 0, region.end - MIN_WIDTH);

        const leftNeighbor = layerBubbles
            .filter(({ r }) => r.id !== activeId && r.end <= region.start + MIN_WIDTH)
            .sort((a, b) => b.r.end - a.r.end)[0];

        if (leftNeighbor) {
            const neighbor = updated[leftNeighbor.i];
            const minStart = neighbor.start + MIN_WIDTH;
            const clampedStart = Math.max(newStart, minStart);
            updated[idx].start = clampedStart;
            neighbor.end = clampedStart;
        } else {
            updated[idx].start = newStart;
        }
    }

    return syncRegions(updated);
}

const MAX_HISTORY = 50;

export default function BriformCanvas({
    regions = [],
    setRegions,
    currentTime,
    duration,
    isPlaying,
    isReady,
    playerRef,
    togglePlay,
}: BriformCanvasProps) {
    const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(new Set());
    const [dragStart, setDragStart] = useState<number | null>(null);
    const [markStart, setMarkStart] = useState<number | null>(null);
    const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>("none");

    // Undo history — only mutated by discrete actions, never by dragging
    const historyRef = useRef<Region[][]>([]);
    const isDraggingRef = useRef(false);
    const timelineRef = useRef<HTMLDivElement>(null);
    const seededRef = useRef(false);

    // --- Seed initial full-timeline bubble once duration is known ---
    useEffect(() => {
        if (duration > 0 && regions.length === 0 && !seededRef.current) {
            seededRef.current = true;
            setRegions([
                {
                    id: crypto.randomUUID(),
                    start: 0,
                    end: duration,
                    label: "Section 1",
                    layer: 0,
                },
            ]);
        }
    }, [duration, regions.length, setRegions]);

    // --- History Helpers ---

    const pushHistory = useCallback((current: Region[]) => {
        historyRef.current = [
            ...historyRef.current.slice(-MAX_HISTORY + 1),
            current.map((r) => ({ ...r })),
        ];
    }, []);

    /**
     * Use this for all discrete user actions (create, split, delete, group,
     * rename, clear). It snapshots BEFORE the change so undo restores to
     * the state just before that action.
     */
    const setRegionsWithHistory = useCallback(
        (current: Region[], updater: (prev: Region[]) => Region[]) => {
            pushHistory(current);
            setRegions((prev) => updater(prev));
        },
        [pushHistory, setRegions]
    );

    const handleUndo = useCallback(() => {
        if (historyRef.current.length === 0) return;
        const prev = historyRef.current[historyRef.current.length - 1];
        historyRef.current = historyRef.current.slice(0, -1);
        setRegions(prev);
        setSelectedRegionIds(new Set());
    }, [setRegions]);

    // --- Utilities ---

    const isOverlapping = (
        start: number,
        end: number,
        excludeId: string | null = null,
        layer: number = 0
    ) =>
        regions.some((r) => {
            if (excludeId !== null && r.id === excludeId) return false;
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
            playerRef.current.seekTo(clamp(seconds, 0, duration || seconds), true);
        }
    };

    const skip = (deltaSeconds: number) => seekTo(currentTime + deltaSeconds);

    // --- Discrete Actions (all go through setRegionsWithHistory) ---

    const handleDynamicMark = () => {
        if (!duration || duration <= 0) return;
        if (markStart === null) {
            setMarkStart(currentTime);
        } else {
            const start = Math.min(markStart, currentTime);
            const end = Math.max(markStart, currentTime);
            if (end - start < MIN_WIDTH) { alert("Bubble is too short."); setMarkStart(null); return; }
            if (isOverlapping(start, end, null, 0)) { alert("This overlaps with an existing base bubble!"); setMarkStart(null); return; }
            const label = `Section ${regions.filter((r) => !r.layer).length + 1}`;
            setRegionsWithHistory(regions, (prev) =>
                syncRegions([...prev, { id: crypto.randomUUID(), start, end, label, layer: 0 }])
            );
            setMarkStart(null);
        }
    };

    const handleSplit = () => {
        const t = currentTime;
        const target = regions.find((r) => t > r.start && t < r.end);
        if (!target) { alert("Playhead must be inside a bubble to split."); return; }
        if (t - target.start < MIN_WIDTH || target.end - t < MIN_WIDTH) {
            alert("Split point too close to edge.");
            return;
        }
        setRegionsWithHistory(regions, (prev) =>
            syncRegions(
                prev.flatMap((r) =>
                    r.id !== target.id
                        ? [r]
                        : [
                              { ...r, id: crypto.randomUUID(), end: t },
                              { ...r, id: crypto.randomUUID(), start: t },
                          ]
                )
            )
        );
        setSelectedRegionIds(new Set());
    };

    const handleGroup = () => {
        const ids = Array.from(selectedRegionIds);
        if (ids.length < 2) { alert("Select at least 2 regions to group."); return; }

        const selected = regions.filter((r) => ids.includes(r.id));

        const layers = new Set(selected.map((r) => r.layer || 0));
        if (layers.size > 1) { alert("All selected regions must be on the same layer to group."); return; }

        const alreadyGrouped = selected.some((r) => r.parentId !== undefined);
        if (alreadyGrouped) { alert("One or more selected bubbles are already part of a group."); return; }

        const start = Math.min(...selected.map((r) => r.start));
        const end = Math.max(...selected.map((r) => r.end));

        let targetLayer = Math.max(...selected.map((r) => r.layer || 0)) + 1;
        while (
            regions.some(
                (r) =>
                    !ids.includes(r.id) &&
                    (r.layer || 0) === targetLayer &&
                    start < r.end &&
                    end > r.start
            )
        ) {
            targetLayer++;
        }

        const parentId = crypto.randomUUID();
        const parent: Region = { id: parentId, start, end, label: "Grouped Section", layer: targetLayer };

        setRegionsWithHistory(regions, (prev) =>
            syncRegions([
                ...prev.map((r) => (ids.includes(r.id) ? { ...r, parentId } : r)),
                parent,
            ])
        );
        setSelectedRegionIds(new Set());
    };

    const handleDelete = (id: string) => {
        setRegionsWithHistory(regions, (prev) =>
            syncRegions(
                prev
                    .filter((r) => r.id !== id)
                    .map((r) => (r.parentId === id ? { ...r, parentId: undefined } : r))
            )
        );
        setSelectedRegionIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleClear = () => {
        if (confirm("Clear all regions?")) {
            pushHistory(regions);
            setRegions([
                { id: crypto.randomUUID(), start: 0, end: duration, label: "Section 1", layer: 0 },
            ]);
            setSelectedRegionIds(new Set());
        }
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

        if (dragMode !== "none" && activeRegionId !== null) {
            if (dragMode === "resize-start" || dragMode === "resize-end") {
                // Neighbor-aware resize — no history, just live update
                setRegions((prev) =>
                    applyResizeWithNeighbor(prev, activeRegionId, dragMode, t, duration)
                );
            } else if (dragMode === "move") {
                // Move is blocked when neighbors are present (bubbles are flush)
                // — movement only works when there's open space on the layer.
                setRegions((prev) => {
                    const activeIndex = prev.findIndex((r) => r.id === activeRegionId);
                    if (activeIndex === -1) return prev;

                    const updated = prev.map((r) => ({ ...r }));
                    const region = updated[activeIndex];
                    const currentLayer = region.layer || 0;
                    const width = region.end - region.start;
                    const newStart = clamp(t - width / 2, 0, duration - width);
                    const newEnd = newStart + width;

                    if (!prev.some(
                        (r) =>
                            r.id !== activeRegionId &&
                            (r.layer || 0) === currentLayer &&
                            newStart < r.end &&
                            newEnd > r.start
                    )) {
                        const delta = newStart - region.start;
                        region.start = newStart;
                        region.end = newEnd;
                        return syncRegions(
                            updated.map((r) =>
                                r.parentId === activeRegionId
                                    ? { ...r, start: r.start + delta, end: r.end + delta }
                                    : r
                            )
                        );
                    }
                    return prev;
                });
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        const t = timeFromMouse(e);

        if (t !== null && dragStart !== null && !isDraggingRef.current) {
            // Pure click — seek
            seekTo(t);
        }

        // Drag on empty space to create a new bubble
        if (
            t !== null &&
            dragStart !== null &&
            isDraggingRef.current &&
            dragMode === "none"
        ) {
            const start = Math.min(dragStart, t);
            const end = Math.max(dragStart, t);
            if (Math.abs(end - start) > MIN_WIDTH && !isOverlapping(start, end, null, 0)) {
                const label = `Section ${regions.filter((r) => !r.layer).length + 1}`;
                setRegionsWithHistory(regions, (prev) =>
                    syncRegions([...prev, { id: crypto.randomUUID(), start, end, label, layer: 0 }])
                );
            }
        }

        setDragMode("none");
        setActiveRegionId(null);
        setDragStart(null);
        isDraggingRef.current = false;
    };

    const startDrag = (id: string, mode: DragMode) => {
        setActiveRegionId(id);
        setDragMode(mode);
    };

    // --- Formatting ---

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${String(s).padStart(2, "0")}`;
    };

    const maxLayer = regions.length > 0 ? Math.max(...regions.map((r) => r.layer || 0)) : 0;
    const containerHeightPx = 16 + (maxLayer + 1) * 48;
    const canUndo = historyRef.current.length > 0;

    const selectedRegions = regions.filter((r) => selectedRegionIds.has(r.id));
    const selectedLayers = new Set(selectedRegions.map((r) => r.layer || 0));
    const alreadyGrouped = selectedRegions.some((r) => r.parentId !== undefined);
    const canGroup = selectedRegions.length >= 2 && selectedLayers.size === 1 && !alreadyGrouped;

    let groupHint: string | null = null;
    if (selectedRegions.length >= 2 && !canGroup) {
        if (selectedLayers.size > 1) groupHint = "Can only group bubbles on the same layer";
        else if (alreadyGrouped) groupHint = "One or more bubbles are already in a group";
    }

    return (
        <section className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow-lg mb-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-lg">Form Diagram</div>
                <div className="text-sm opacity-80 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                    {formatTime(currentTime)} / {formatTime(duration ? Math.floor(duration) : 0)}
                </div>
            </div>

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
                    {/* Playhead */}
                    <div
                        className="absolute top-0 bottom-0 z-30 w-1 bg-red-500 shadow-sm pointer-events-none transition-all duration-75 ease-linear"
                        style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                    />

                    {/* Ghost bubble while marking */}
                    {markStart !== null && (
                        <div
                            className="absolute rounded-md border border-red-500 bg-red-500/40 z-10 pointer-events-none animate-pulse"
                            style={{
                                bottom: `8px`,
                                height: `40px`,
                                left: `${duration ? (markStart / duration) * 100 : 0}%`,
                                width: `${
                                    duration && currentTime > markStart
                                        ? ((currentTime - markStart) / duration) * 100
                                        : 0
                                }%`,
                            }}
                        />
                    )}

                    {regions.map((r) => {
                        const selected = selectedRegionIds.has(r.id);
                        const layer = r.layer || 0;
                        const isParent = regions.some((c) => c.parentId === r.id);

                        return (
                            <div
                                key={r.id}
                                className={`absolute rounded-md border px-2 flex items-center justify-center z-20 select-none transition-colors ${
                                    isParent
                                        ? selected
                                            ? "bg-purple-600 text-white border-purple-300 shadow-md"
                                            : "bg-purple-500/80 text-white border-purple-400/50 shadow-sm hover:bg-purple-500"
                                        : selected
                                        ? "bg-blue-600 text-white border-blue-300 shadow-md"
                                        : "bg-blue-500/90 text-white border-blue-400/50 shadow-sm hover:bg-blue-500"
                                }`}
                                style={{
                                    bottom: `${layer * 48 + 8}px`,
                                    height: `40px`,
                                    left: `${duration ? (r.start / duration) * 100 : 0}%`,
                                    width: `${duration ? ((r.end - r.start) / duration) * 100 : 0}%`,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRegionIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(r.id)) next.delete(r.id);
                                        else next.add(r.id);
                                        return next;
                                    });
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    startDrag(r.id, "move");
                                }}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    const label = prompt("Rename:", r.label);
                                    if (label) {
                                        setRegionsWithHistory(regions, (prev) =>
                                            prev.map((x) => (x.id === r.id ? { ...x, label } : x))
                                        );
                                    }
                                    playerRef.current?.playVideo();
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    handleDelete(r.id);
                                }}
                            >
                                <span className="text-xs font-bold truncate pointer-events-none drop-shadow-md">
                                    {r.label}
                                </span>

                                <div
                                    className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-w-resize"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        startDrag(r.id, "resize-start");
                                    }}
                                />
                                <div
                                    className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-e-resize"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        startDrag(r.id, "resize-end");
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 h-5">
                <span>Split or drag edges to resize • Double-click to rename • Right-click to delete</span>
                {groupHint && (
                    <span className="text-amber-500 dark:text-amber-400">{groupHint}</span>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t dark:border-gray-700 pt-4">
                <button
                    onClick={() => skip(-5)}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                    -5s
                </button>
                <button
                    onClick={togglePlay}
                    className="px-6 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold w-24"
                >
                    {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                    onClick={() => skip(5)}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                    +5s
                </button>

                <div className="w-px h-6 bg-gray-300 mx-2" />

                <button
                    onClick={handleSplit}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                    Split
                </button>
                <button
                    onClick={handleDynamicMark}
                    className={`px-4 py-1 rounded font-semibold transition-colors w-32 ${
                        markStart !== null
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-inner"
                            : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-white"
                    }`}
                >
                    {markStart !== null ? "End Bubble" : "Start Bubble"}
                </button>
                <button
                    onClick={handleGroup}
                    disabled={!canGroup}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={!canGroup ? "Select 2+ ungrouped bubbles on the same layer" : "Group selected"}
                >
                    Group
                </button>

                <div className="w-px h-6 bg-gray-300 mx-2" />

                <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo last action"
                >
                    ↩ Undo
                </button>
                <button
                    onClick={handleClear}
                    className="px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                    Clear
                </button>
            </div>
        </section>
    );
}