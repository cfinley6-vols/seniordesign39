// src/app/(briform)/components/BriformCanvas.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import {
	type Region,
	clamp,
	MIN_WIDTH,
	ADJACENCY_TOLERANCE,
	fullSync,
	cascadeDeleteGroups,
	applyResizeWithNeighbor,
} from "./lib/regionOps";

// Preset palette — name + base hex + selected (darker) hex + border hex
const COLOR_PALETTE: { name: string; base: string; selected: string; border: string }[] = [
    { name: "Blue",   base: "#3b82f6", selected: "#2563eb", border: "#93c5fd" },
    { name: "Purple", base: "#a855f7", selected: "#9333ea", border: "#d8b4fe" },
    { name: "Green",  base: "#22c55e", selected: "#16a34a", border: "#86efac" },
    { name: "Red",    base: "#ef4444", selected: "#dc2626", border: "#fca5a5" },
    { name: "Orange", base: "#f97316", selected: "#ea580c", border: "#fdba74" },
    { name: "Yellow", base: "#eab308", selected: "#ca8a04", border: "#fde047" },
    { name: "Pink",   base: "#ec4899", selected: "#db2777", border: "#f9a8d4" },
    { name: "Teal",   base: "#14b8a6", selected: "#0d9488", border: "#5eead4" },
];

type DragMode = "none" | "move" | "resize-start" | "resize-end" | "playhead";

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

const MAX_HISTORY = 50;

// SVG dimensions — keep in sync with PlayheadHandle viewBox
const PLAYHEAD_SVG_W = 12;
const PLAYHEAD_SVG_H = 26;
// The triangle point (tip) is at y=25 in a 26-tall SVG, i.e. 1px from the bottom.
// We want the tip to sit exactly on top of the red line at the top of the timeline.
// PLAYHEAD_OFFSET_Y: how many px above the timeline top edge the handle sits.
// tip_y_in_svg = 25, so the tip is (SVG_H - 25) = 1px from the SVG bottom.
// We want the SVG bottom - 1px to be flush with the timeline top, so offset = SVG_H - 1.
const PLAYHEAD_TIP_FROM_BOTTOM = PLAYHEAD_SVG_H - 25; // 1px
const PLAYHEAD_OFFSET_Y = PLAYHEAD_SVG_H - PLAYHEAD_TIP_FROM_BOTTOM; // = 25px above timeline top

function PlayheadHandle({ dragging }: { dragging: boolean }) {
    return (
        <svg
            width={PLAYHEAD_SVG_W}
            height={PLAYHEAD_SVG_H}
            viewBox={`0 0 ${PLAYHEAD_SVG_W} ${PLAYHEAD_SVG_H}`}
            style={{ display: "block", filter: dragging ? "brightness(0.8)" : "none" }}
        >
            <rect x="1" y="1" width="10" height="16" rx="2" ry="2" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.75" />
            {[3.5, 7.5].map((cx) =>
                [4, 8, 12].map((cy) => (
                    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.2" fill="#b91c1c" opacity="0.75" />
                ))
            )}
            {[3.5, 7.5].map((cx) =>
                [4, 8, 12].map((cy) => (
                    <circle key={`hl-${cx}-${cy}`} cx={cx - 0.4} cy={cy - 0.4} r="0.5" fill="#fca5a5" opacity="0.55" />
                ))
            )}
            <polygon points="1,17 11,17 6,25" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.5" strokeLinejoin="round" />
        </svg>
    );
}

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
    const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
    const [dragMode, setDragMode] = useState<DragMode>("none");
    const [playheadDragPos, setPlayheadDragPos] = useState<number | null>(null);
    // Zoom: visible time window [zoomStart, zoomEnd] in seconds
    const [zoomStart, setZoomStart] = useState<number>(0);
    const [zoomEnd, setZoomEnd] = useState<number>(0); // 0 = unset, will follow duration

    const lastSeekPctRef = useRef<number | null>(null);

    // confirmedTimeRef: the best known playback position for split operations.
    const confirmedTimeRef = useRef<number>(0);

    const historyRef = useRef<Region[][]>([]);
    const redoRef = useRef<Region[][]>([]);
    const isDraggingRef = useRef(false);
    const timelineRef = useRef<HTMLDivElement>(null);
    const dragSnapshotRef = useRef<Region[] | null>(null);
    const dragModeRef = useRef<DragMode>("none");
    const durationRef = useRef(duration);
    const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const zoomStartRef = useRef(0);
    const zoomEndRef = useRef(0);
    const playerInstanceRef = useRef<any>(null);
    const isPlayingRef = useRef(isPlaying);
    const togglePlayRef = useRef(togglePlay);

    useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
    useEffect(() => {
        durationRef.current = duration;
        if (duration > 0) {
            setZoomEnd((prev) => prev === 0 ? duration : prev);
        }
    }, [duration]);
    useEffect(() => { playerInstanceRef.current = playerRef?.current ?? null; });
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);
    useEffect(() => { zoomStartRef.current = zoomStart; }, [zoomStart]);
    useEffect(() => { zoomEndRef.current = zoomEnd; }, [zoomEnd]);

    const prevCurrentTimeRef = useRef(currentTime);
    useEffect(() => {
        const delta = Math.abs(currentTime - prevCurrentTimeRef.current);
        if (delta < 1) {
            confirmedTimeRef.current = currentTime;
        }
        prevCurrentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        if (lastSeekPctRef.current === null || duration <= 0) return;
        const currentPct = (currentTime / duration) * 100;
        if (Math.abs(currentPct - lastSeekPctRef.current) < 1) {
            lastSeekPctRef.current = null;
        }
    }, [currentTime, duration]);

    const PLAYHEAD_ANCHOR = 0.2;
    const isPlayingRef2 = useRef(isPlaying);
    useEffect(() => { isPlayingRef2.current = isPlaying; }, [isPlaying]);

    useEffect(() => {
        if (duration <= 0) return;
        const start = zoomStartRef.current;
        const end = zoomEndRef.current > 0 ? zoomEndRef.current : duration;
        const range = end - start;

        if (range >= duration - 0.1) return;

        const t = currentTime;

        if (isPlayingRef2.current) {
            const newStart = clamp(t - range * PLAYHEAD_ANCHOR, 0, duration - range);
            const newEnd = newStart + range;
            if (Math.abs(newStart - start) > 0.01) {
                setZoomStart(newStart);
                setZoomEnd(newEnd);
            }
        } else {
            if (t < start) {
                const newStart = clamp(t - range * 0.2, 0, duration - range);
                setZoomStart(newStart);
                setZoomEnd(newStart + range);
            } else if (t > end) {
                const newStart = clamp(t - range * 0.8, 0, duration - range);
                setZoomStart(newStart);
                setZoomEnd(newStart + range);
            }
        }
    }, [currentTime, duration]);

    // Effective zoom window
    const visStart = zoomStart;
    const visEnd = zoomEnd > 0 ? zoomEnd : duration;
    const visRange = Math.max(visEnd - visStart, 0.1);
    const timeToPct = (t: number) => ((t - visStart) / visRange) * 100;

    const playheadPct = (() => {
        if (playheadDragPos !== null) return playheadDragPos;
        if (lastSeekPctRef.current !== null) return lastSeekPctRef.current;
        return timeToPct(currentTime);
    })();

    // --- Seed / missing-bubble guard ---
    const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
        if (duration <= 0) return;

        const hasLayer0 = regions.some((r) => r.layer === 0);
        if (hasLayer0) return;

        seedTimerRef.current = setTimeout(() => {
            setRegions((current) => {
                const stillEmpty = !current.some((r) => r.layer === 0);
                if (!stillEmpty) return current;
                return [{ id: crypto.randomUUID(), start: 0, end: duration, label: "Section 1", layer: 0 }];
            });
        }, 400);

        return () => { if (seedTimerRef.current) clearTimeout(seedTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duration, regions.length]);

    // --- Global mouse handlers ---
    useEffect(() => {
        const getTimeAndPct = (clientX: number) => {
            if (!timelineRef.current || durationRef.current <= 0) return { pct: null, t: null };
            const rect = timelineRef.current.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
            const currentVisStart = zoomStartRef.current;
            const currentVisEnd = zoomEndRef.current > 0 ? zoomEndRef.current : durationRef.current;
            const currentVisRange = Math.max(currentVisEnd - currentVisStart, 0.1);
            const t = clamp(currentVisStart + ratio * currentVisRange, 0, durationRef.current);
            const pct = ratio * 100;
            return { pct, t };
        };

        const onGlobalMouseMove = (e: MouseEvent) => {
            if (dragModeRef.current !== "playhead") return;
            // FIX: use timelineRef for accurate pct so handle stays aligned with red line
            if (!timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
            setPlayheadDragPos(ratio * 100);
        };

        const onGlobalMouseUp = (e: MouseEvent) => {
            if (dragModeRef.current === "playhead") {
                const { pct, t } = getTimeAndPct(e.clientX);
                if (pct !== null) lastSeekPctRef.current = pct;

                if (t !== null) confirmedTimeRef.current = t;

                setPlayheadDragPos(null);
                setDragMode("none");
                dragModeRef.current = "none";

                if (t !== null && playerRef?.current?.seekTo) {
                    playerRef.current.seekTo(t, true);
                }

                if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
                pauseTimerRef.current = setTimeout(() => {
                    const player = playerInstanceRef.current;
                    const state = player?.getPlayerState?.();
                    if (state === 1 || state === 3) {
                        player?.pauseVideo?.();
                    } else if (isPlayingRef.current) {
                        togglePlayRef.current?.();
                    }
                }, 250);

                isDraggingRef.current = false;
                return;
            }

            if (isDraggingRef.current && dragSnapshotRef.current && dragModeRef.current !== "none") {
                historyRef.current = [
                    ...historyRef.current.slice(-MAX_HISTORY + 1),
                    dragSnapshotRef.current,
                ];
                redoRef.current = [];
                dragSnapshotRef.current = null;
            }

            setDragMode("none");
            dragModeRef.current = "none";
            setActiveRegionId(null);
            setDragStart(null);
            isDraggingRef.current = false;
        };

        window.addEventListener("mousemove", onGlobalMouseMove);
        window.addEventListener("mouseup", onGlobalMouseUp);
        return () => {
            window.removeEventListener("mousemove", onGlobalMouseMove);
            window.removeEventListener("mouseup", onGlobalMouseUp);
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        };
    }, [playerRef]);

    // --- History ---

    const pushHistory = useCallback((snapshot: Region[]) => {
        historyRef.current = [
            ...historyRef.current.slice(-MAX_HISTORY + 1),
            snapshot.map((r) => ({ ...r })),
        ];
        redoRef.current = [];
    }, []);

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
        setRegions((current) => {
            redoRef.current = [...redoRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
            return prev;
        });
        setSelectedRegionIds(new Set());
    }, [setRegions]);

    const handleRedo = useCallback(() => {
        if (redoRef.current.length === 0) return;
        const next = redoRef.current[redoRef.current.length - 1];
        redoRef.current = redoRef.current.slice(0, -1);
        setRegions((current) => {
            historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), current.map((r) => ({ ...r }))];
            return next;
        });
        setSelectedRegionIds(new Set());
    }, [setRegions]);

    // --- Utilities ---

    const timeFromClient = useCallback(
        (clientX: number): number | null => {
            if (!timelineRef.current) return null;
            const rect = timelineRef.current.getBoundingClientRect();
            const ratio = (clientX - rect.left) / rect.width;
            return clamp(visStart + ratio * visRange, 0, duration || 1);
        },
        [duration, visStart, visRange]
    );

    const MIN_ZOOM_RANGE = 10;

    const zoomAround = (anchor: number, newRange: number) => {
        const clamped = clamp(newRange, MIN_ZOOM_RANGE, duration);
        let newStart = anchor - clamped / 2;
        let newEnd = anchor + clamped / 2;
        if (newStart < 0) { newEnd = Math.min(duration, newEnd - newStart); newStart = 0; }
        if (newEnd > duration) { newStart = Math.max(0, newStart - (newEnd - duration)); newEnd = duration; }
        setZoomStart(newStart);
        setZoomEnd(newEnd);
    };

    const handleZoomIn = () => {
        const anchor = confirmedTimeRef.current;
        zoomAround(anchor, visRange / 2);
    };
    const handleZoomOut = () => {
        const anchor = confirmedTimeRef.current;
        zoomAround(anchor, visRange * 2);
    };
    const handleZoomReset = () => {
        setZoomStart(0);
        setZoomEnd(duration);
    };
    const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (duration <= 0) return;
        const panAmount = (e.deltaX !== 0 ? e.deltaX : e.deltaY) * (visRange / 500);
        const newStart = clamp(visStart + panAmount, 0, duration - visRange);
        const newEnd = newStart + visRange;
        setZoomStart(newStart);
        setZoomEnd(newEnd);
    };

    useEffect(() => {
        const el = timelineRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    });

    const seekTo = (seconds: number) => {
        if (playerRef?.current?.seekTo)
            playerRef.current.seekTo(clamp(seconds, 0, duration || seconds), true);
    };

    const skip = (deltaSeconds: number) => seekTo(currentTime + deltaSeconds);

    // --- Actions ---

    const handleSplit = () => {
        const t = confirmedTimeRef.current;
        const target = regions.find((r) => r.layer === 0 && t > r.start && t < r.end);
        if (!target) { alert("Playhead must be inside a base layer bubble to split."); return; }
        if (t - target.start < MIN_WIDTH || target.end - t < MIN_WIDTH) { alert("Split point too close to edge."); return; }
        setRegionsWithHistory(regions, (prev) =>
            fullSync(
                prev.flatMap((r) =>
                    r.id !== target.id
                        ? [r]
                        : [{ ...r, id: crypto.randomUUID(), end: t }, { ...r, id: crypto.randomUUID(), start: t }]
                ),
                duration
            )
        );
        setSelectedRegionIds(new Set());
    };

    const handleMerge = () => {
        const ids = Array.from(selectedRegionIds);
        if (ids.length < 2) { alert("Select at least 2 bubbles to merge."); return; }
        const selected = regions.filter((r) => ids.includes(r.id));
        if (selected.some((r) => r.layer !== 0)) { alert("Merge only works on base layer bubbles."); return; }

        const parentIds = new Set(selected.map((r) => r.parentId ?? "__none__"));
        if (parentIds.size > 1) {
            alert("Cannot merge bubbles that belong to different groups.");
            return;
        }

        const sortedSelected = [...selected].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sortedSelected.length - 1; i++) {
            if (sortedSelected[i + 1].start - sortedSelected[i].end > ADJACENCY_TOLERANCE) {
                alert("Can only merge adjacent bubbles. There is a gap between selected bubbles.");
                return;
            }
        }

        const mergeStart = Math.min(...selected.map((r) => r.start));
        const mergeEnd = Math.max(...selected.map((r) => r.end));
        const absorbed = regions.filter((r) => r.layer === 0 && r.start >= mergeStart && r.end <= mergeEnd);
        const absorbedIds = new Set(absorbed.map((r) => r.id));

        const absorbedParentIds = new Set(absorbed.map((r) => r.parentId ?? "__none__"));
        if (absorbedParentIds.size > 1) {
            alert("Cannot merge: the range spans bubbles from different groups.");
            return;
        }

        const mergedParentId = [...parentIds][0] === "__none__" ? undefined : ([...parentIds][0] as string);

        const merged: Region = {
            id: crypto.randomUUID(),
            start: mergeStart,
            end: mergeEnd,
            label: absorbed[0]?.label ?? "Section",
            layer: 0,
            parentId: mergedParentId,
        };

        setRegionsWithHistory(regions, (prev) => {
            const without = prev
                .filter((r) => !absorbedIds.has(r.id))
                .map((r) => (r.parentId && absorbedIds.has(r.parentId) ? { ...r, parentId: undefined } : r));
            return fullSync(cascadeDeleteGroups([...without, merged]), duration);
        });
        setSelectedRegionIds(new Set());
    };

    const handleGroup = () => {
        const ids = Array.from(selectedRegionIds);
        if (ids.length < 2) { alert("Select at least 2 regions to group."); return; }
        const selected = regions.filter((r) => ids.includes(r.id));

        if (selected.some((r) => r.parentId !== undefined)) {
            alert("One or more selected bubbles are already part of a group.");
            return;
        }

        const sortedByStart = [...selected].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sortedByStart.length - 1; i++) {
            const gap = sortedByStart[i + 1].start - sortedByStart[i].end;
            if (gap > ADJACENCY_TOLERANCE) {
                alert("All bubbles in a group must be touching with no time gaps between them.");
                return;
            }
        }

        const start = Math.min(...selected.map((r) => r.start));
        const end = Math.max(...selected.map((r) => r.end));

        let targetLayer = Math.max(...selected.map((r) => r.layer)) + 1;

        while (
            regions.some(
                (r) => !ids.includes(r.id) && r.layer === targetLayer && start < r.end && end > r.start
            )
        ) {
            targetLayer++;
        }

        const parentId = crypto.randomUUID();
        const parent: Region = { id: parentId, start, end, label: "Grouped Section", layer: targetLayer };

        setRegionsWithHistory(regions, (prev) =>
            fullSync([...prev.map((r) => (ids.includes(r.id) ? { ...r, parentId } : r)), parent], duration)
        );
        setSelectedRegionIds(new Set());
    };

    const handleDelete = (id: string) => {
        const target = regions.find((r) => r.id === id);
        if (!target || target.layer === 0) return;

        setRegionsWithHistory(regions, (prev) => {
            const walkUp = (startId: string, list: Region[]): string[] => {
                const ids: string[] = [startId];
                let current = list.find((r) => r.id === startId);
                while (current?.parentId) {
                    const parent = list.find((r) => r.id === current!.parentId);
                    if (!parent) break;
                    const remaining = list.filter(
                        (r) => r.parentId === parent.id && !ids.includes(r.id)
                    ).length;
                    if (remaining < 2) {
                        ids.push(parent.id);
                        current = parent;
                    } else {
                        break;
                    }
                }
                return ids;
            };

            const chainToDelete = walkUp(id, prev);

            chainToDelete.sort((a, b) => {
                const la = prev.find((r) => r.id === a)?.layer || 0;
                const lb = prev.find((r) => r.id === b)?.layer || 0;
                return lb - la;
            });

            let result = [...prev];
            for (const deleteId of chainToDelete) {
                result = result
                    .filter((r) => r.id !== deleteId)
                    .map((r) => r.parentId === deleteId ? { ...r, parentId: undefined } : r);
            }

            return fullSync(result, duration);
        });

        setSelectedRegionIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    };

    const handleColorChange = (color: string) => {
        if (selectedRegionIds.size === 0) return;
        setRegionsWithHistory(regions, (prev) =>
            prev.map((r) => selectedRegionIds.has(r.id) ? { ...r, color } : r)
        );
    };

    const handleClear = () => {
        if (confirm("Clear all regions?")) {
            pushHistory(regions);
            setRegions([{ id: crypto.randomUUID(), start: 0, end: duration, label: "Section 1", layer: 0 }]);
            setSelectedRegionIds(new Set());
        }
    };

    // --- Timeline Mouse Events ---

    const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (dragModeRef.current === "playhead") return;
        const t = timeFromClient(e.clientX);
        if (t === null) return;
        setDragStart(t);
        isDraggingRef.current = false;
    };

    const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (dragModeRef.current === "playhead" || e.buttons !== 1) return;
        isDraggingRef.current = true;

        const t = timeFromClient(e.clientX);
        if (t === null || dragMode === "none" || activeRegionId === null) return;

        if (dragMode === "resize-start" || dragMode === "resize-end") {
            setRegions((prev) => applyResizeWithNeighbor(prev, activeRegionId, dragMode, t, duration));
        } else if (dragMode === "move") {
            setRegions((prev) => {
                const activeIndex = prev.findIndex((r) => r.id === activeRegionId);
                if (activeIndex === -1) return prev;
                const updated = prev.map((r) => ({ ...r }));
                const region = updated[activeIndex];
                const currentLayer = region.layer;
                const width = region.end - region.start;

                const newStart = clamp(t - width / 2, 0, duration - width);
                const newEnd = newStart + width;

                const colliders = prev.filter(
                    (r) => r.id !== activeRegionId && r.layer === currentLayer
                );

                let constrainedStart = newStart;
                for (const c of colliders) {
                    if (newStart < c.end && newEnd > c.start) {
                        const pushRight = c.end;
                        const pushLeft = c.start - width;
                        const distRight = Math.abs(newStart - pushRight);
                        const distLeft = Math.abs(newStart - pushLeft);
                        constrainedStart = distRight < distLeft ? pushRight : Math.max(0, pushLeft);
                    }
                }
                constrainedStart = clamp(constrainedStart, 0, duration - width);
                const constrainedEnd = constrainedStart + width;

                const stillCollides = colliders.some(
                    (r) => constrainedStart < r.end && constrainedEnd > r.start
                );
                if (!stillCollides) {
                    const delta = constrainedStart - region.start;
                    region.start = constrainedStart;
                    region.end = constrainedEnd;
                    return fullSync(
                        updated.map((r) =>
                            r.parentId === activeRegionId
                                ? { ...r, start: r.start + delta, end: r.end + delta }
                                : r
                        ),
                        duration
                    );
                }
                return prev;
            });
        }
    };

    const handleTimelineMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current && dragStart !== null && dragMode === "none") {
            const t = timeFromClient(e.clientX);
            if (t !== null) {
                seekTo(t);
                confirmedTimeRef.current = t;
            }
        }

        if (isDraggingRef.current && dragMode === "move" && activeRegionId !== null) {
            const active = regions.find((r) => r.id === activeRegionId);
            if (active && active.layer !== 0) {
                const t = timeFromClient(e.clientX);
                if (t !== null) {
                    const width = active.end - active.start;
                    const newStart = clamp(t - width / 2, 0, duration - width);
                    const newEnd = newStart + width;
                    const hasNoNeighborCollision = !regions.some(
                        (r) => r.id !== activeRegionId && r.layer === active.layer && newStart < r.end && newEnd > r.start
                    );
                    const nearestNeighborDist = regions
                        .filter((r) => r.id !== activeRegionId && r.layer === active.layer)
                        .reduce((min, r) => Math.min(min, Math.abs(newEnd - r.start), Math.abs(newStart - r.end)), Infinity);
                    if (hasNoNeighborCollision && nearestNeighborDist > 2) {
                        handleDelete(activeRegionId);
                    }
                }
            }
        }
    };

    const startDrag = (id: string, mode: DragMode) => {
        dragSnapshotRef.current = regions.map((r) => ({ ...r }));
        setActiveRegionId(id);
        setDragMode(mode);
        dragModeRef.current = mode;
    };

    // --- Formatting ---

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    // --- Group color inheritance ---
    // Build a map: bubbleId -> outline color from its direct parent (one layer up only)
    const parentOutlineColorMap = (() => {
        const map = new Map<string, string>();
        for (const region of regions) {
            const isParent = regions.some((c) => c.parentId === region.id);
            if (!isParent) continue;
            // This region is a parent — its direct children get its color as an outline
            const parentColor = region.color ?? COLOR_PALETTE[1].base; // default purple for parents
            const children = regions.filter((c) => c.parentId === region.id);
            for (const child of children) {
                map.set(child.id, parentColor);
            }
        }
        return map;
    })();

    const maxLayer = regions.length > 0 ? Math.max(...regions.map((r) => r.layer)) : 0;
    const containerHeightPx = 16 + (maxLayer + 1) * 48;
    const canUndo = historyRef.current.length > 0;
    const canRedo = redoRef.current.length > 0;

    const selectedRegions = regions.filter((r) => selectedRegionIds.has(r.id));
    const alreadyGrouped = selectedRegions.some((r) => r.parentId !== undefined);
    const canGroup = (() => {
        if (selectedRegions.length < 2) return false;
        if (alreadyGrouped) return false;
        const sorted = [...selectedRegions].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1].start - sorted[i].end > ADJACENCY_TOLERANCE) return false;
        }
        return true;
    })();
    const canMerge = (() => {
        const ms = selectedRegions.filter((r) => r.layer === 0);
        if (ms.length < 2) return false;
        const pids = new Set(ms.map((r) => r.parentId ?? "__none__"));
        if (pids.size > 1) return false;
        const sorted = [...ms].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1].start - sorted[i].end > ADJACENCY_TOLERANCE) return false;
        }
        return true;
    })();

    let groupHint: string | null = null;
    if (selectedRegions.length >= 2 && !canGroup) {
        if (alreadyGrouped) groupHint = "One or more bubbles are already in a group";
        else groupHint = "All selected bubbles must be touching with no time gaps";
    }

    return (
        <section
            className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow-lg mb-6 border border-gray-200 dark:border-gray-700"
            onClick={() => setSelectedRegionIds(new Set())}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-lg">Form Diagram</div>
                <div className="flex items-center gap-2">
                    {(zoomStart > 0 || (zoomEnd > 0 && zoomEnd < duration)) && (
                        <span className="text-xs opacity-60 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                            {formatTime(visStart)}–{formatTime(visEnd)}
                        </span>
                    )}
                    <div className="text-sm opacity-80 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded">
                        {formatTime(currentTime)} / {formatTime(duration ? Math.floor(duration) : 0)}
                    </div>
                </div>
            </div>

            <div className="pt-5">
                <div
                    className="relative w-full bg-gray-100 dark:bg-gray-900 rounded-lg p-1 transition-all duration-300 overflow-visible"
                    style={{ height: `${containerHeightPx}px` }}
                >
                    {/*
                        PLAYHEAD HANDLE FIX:
                        We now position the handle relative to timelineRef's coordinate space
                        by placing it INSIDE the timeline div (via a portal-like absolute child
                        that overflows upward). This ensures the handle's left% always maps to
                        the same percentage as the red playhead line — no drift at extremes.

                        The handle is placed with overflow:visible on the timeline, positioned
                        at top: -PLAYHEAD_OFFSET_Y so the triangle tip lands exactly at y=0
                        (the top of the timeline), flush with the red line origin.
                    */}
                    <div
                        ref={timelineRef}
                        className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer shadow-inner overflow-visible"
                        onMouseMove={handleTimelineMouseMove}
                        onMouseDown={handleTimelineMouseDown}
                        onMouseUp={handleTimelineMouseUp}
                        onWheel={handleTimelineWheel}
                        style={{ overflow: "visible" }}
                    >
                        {/* Clip inner content — bubbles + ruler — without clipping playhead handle */}
                        <div className="absolute inset-0 rounded overflow-hidden">
                            {/* Time ruler ticks */}
                            {(() => {
                                const ticks: React.ReactNode[] = [];
                                const rawStep = visRange / 6;
                                const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
                                const nicedStep = Math.max(Math.ceil(rawStep / magnitude) * magnitude, 0.5);
                                const firstTick = Math.ceil(visStart / nicedStep) * nicedStep;
                                for (let t = firstTick; t <= visEnd + 0.001; t += nicedStep) {
                                    const pct = timeToPct(t);
                                    if (pct < 0 || pct > 100) continue;
                                    ticks.push(
                                        <div key={t} className="absolute top-0 bottom-0 z-50 pointer-events-none" style={{ left: `${pct}%` }}>
                                            <div className="absolute bottom-0 w-px h-2 bg-black/30 dark:bg-white/30" />
                                            <span
                                                className="absolute bottom-3 text-[9px] font-mono select-none -translate-x-1/2 px-0.5 rounded"
                                                style={{
                                                    color: "rgba(0,0,0,0.7)",
                                                    background: "rgba(255,255,255,0.7)",
                                                    backdropFilter: "blur(2px)",
                                                }}
                                            >
                                                {formatTime(t)}
                                            </span>
                                        </div>
                                    );
                                }
                                return ticks;
                            })()}

                            {/* Playhead line */}
                            <div
                                className="absolute top-0 bottom-0 z-30 w-0.5 bg-red-500 pointer-events-none"
                                style={{ left: `${playheadPct}%` }}
                            />

                            {regions.map((r) => {
                                const selected = selectedRegionIds.has(r.id);
                                const layer = r.layer;
                                const isParent = regions.some((c) => c.parentId === r.id);
                                const isLayer0 = layer === 0;
                                const layer0 = regions.filter((x) => x.layer === 0);
                                const isLeftBorder = isLayer0 && r.start === Math.min(...layer0.map((x) => x.start));
                                const isRightBorder = isLayer0 && r.end === Math.max(...layer0.map((x) => x.end));

                                // Determine outline color from parent (one level up only)
                                const parentOutlineColor = parentOutlineColorMap.get(r.id);

                                return (
                                    <div
                                        key={r.id}
                                        className="absolute rounded-md px-2 flex items-center justify-center z-20 select-none transition-colors text-white shadow-sm"
                                        style={(() => {
                                            const palette = r.color
                                                ? COLOR_PALETTE.find((p) => p.base === r.color)
                                                : isParent
                                                ? COLOR_PALETTE[1]
                                                : COLOR_PALETTE[0];
                                            const base = palette?.base ?? (isParent ? "#a855f7" : "#3b82f6");
                                            const sel  = palette?.selected ?? (isParent ? "#9333ea" : "#2563eb");
                                            const bdr  = palette?.border ?? (isParent ? "#d8b4fe" : "#93c5fd");

                                            // Border logic:
                                            // 1. If selected: use the bubble's own selection border + glow
                                            // 2. Else if has a parent outline color: show parent's color as border (2px solid)
                                            // 3. Else: default semi-transparent border
                                            let borderStyle: React.CSSProperties = {};
                                            if (selected) {
                                                borderStyle = {
                                                    border: `1px solid ${bdr}`,
                                                    boxShadow: `0 0 0 2px ${bdr}, inset 0 0 0 1.5px ${parentOutlineColor ?? "transparent"}`,
                                                };
                                            } else if (parentOutlineColor) {
                                                borderStyle = {
                                                    border: `2px solid ${parentOutlineColor}`,
                                                    boxShadow: "none",
                                                };
                                            } else {
                                                borderStyle = {
                                                    border: `1px solid ${bdr}80`,
                                                    boxShadow: "none",
                                                };
                                            }

                                            return {
                                                bottom: `${layer * 48 + 8}px`,
                                                height: `40px`,
                                                left: `${Math.max(0, timeToPct(r.start))}%`,
                                                width: `${((Math.min(r.end, visEnd) - Math.max(r.start, visStart)) / visRange) * 100}%`,
                                                display: r.end <= visStart || r.start >= visEnd ? "none" : undefined,
                                                backgroundColor: selected ? sel : base,
                                                ...borderStyle,
                                            };
                                        })()}
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
                                            if (r.layer === 0) startDrag(r.id, "move");
                                        }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            const label = prompt("Rename:", r.label);
                                            if (label) {
                                                setRegionsWithHistory(regions, (prev) =>
                                                    prev.map((x) => (x.id === r.id ? { ...x, label } : x))
                                                );
                                            }
                                        }}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (!isLayer0) handleDelete(r.id);
                                        }}
                                    >
                                        <span className="text-xs font-bold truncate pointer-events-none drop-shadow-md">
                                            {r.label}
                                        </span>
                                        {!isLeftBorder && (
                                            <div
                                                className="absolute left-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-w-resize"
                                                onMouseDown={(e) => { e.stopPropagation(); startDrag(r.id, "resize-start"); }}
                                            />
                                        )}
                                        {!isRightBorder && (
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-2 hover:bg-white/40 cursor-e-resize"
                                                onMouseDown={(e) => { e.stopPropagation(); startDrag(r.id, "resize-end"); }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Playhead handle — inside timelineRef so left% maps 1:1 with the red line.
                            overflow:visible on parent allows it to stick up above the timeline. */}
                        {(playheadPct >= 0 && playheadPct <= 100) && (
                            <div
                                className="absolute z-40"
                                style={{
                                    left: `${playheadPct}%`,
                                    top: `-${PLAYHEAD_OFFSET_Y}px`,
                                    transform: "translateX(-50%)",
                                    pointerEvents: "all",
                                    cursor: dragMode === "playhead" ? "grabbing" : "grab",
                                    userSelect: "none",
                                    width: `${PLAYHEAD_SVG_W}px`,
                                    height: `${PLAYHEAD_SVG_H}px`,
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setDragMode("playhead");
                                    dragModeRef.current = "playhead";
                                    isDraggingRef.current = true;
                                    const rect = timelineRef.current!.getBoundingClientRect();
                                    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                                    setPlayheadDragPos(ratio * 100);
                                }}
                            >
                                <PlayheadHandle dragging={dragMode === "playhead"} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 h-5">
                <span>Drag edges to resize • Double-click to rename • Right-click to delete (non-base)</span>
                {groupHint && <span className="text-amber-500 dark:text-amber-400">{groupHint}</span>}
            </div>

            {/* Color picker */}
            <div className="mt-2 flex items-center gap-2 flex-wrap min-h-[28px]" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Color:</span>
                {COLOR_PALETTE.map((p) => {
                    const hasSelection = selectedRegionIds.size > 0;
                    const allMatch = hasSelection && selectedRegions.every((r) => r.color === p.base);
                    return (
                        <button
                            key={p.name}
                            title={p.name}
                            onClick={() => handleColorChange(p.base)}
                            disabled={!hasSelection}
                            className="w-6 h-6 rounded-full focus:outline-none transition-all"
                            style={{
                                backgroundColor: p.base,
                                opacity: hasSelection ? 1 : 0.35,
                                border: allMatch ? `3px solid white` : `2px solid transparent`,
                                boxShadow: allMatch ? `0 0 0 2px ${p.base}` : undefined,
                                transform: allMatch ? "scale(1.15)" : "scale(1)",
                                cursor: hasSelection ? "pointer" : "default",
                            }}
                        />
                    );
                })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t dark:border-gray-700 pt-4" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => skip(-5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">-5s</button>
                <button onClick={togglePlay} className="px-6 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold w-24">
                    {isPlaying ? "Pause" : "Play"}
                </button>
                <button onClick={() => skip(5)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">+5s</button>

                <div className="w-px h-6 bg-gray-300 mx-2" />

                <button onClick={handleSplit} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Split</button>
                <button
                    onClick={handleMerge}
                    disabled={!canMerge}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={!canMerge ? "Select 2+ adjacent base layer bubbles from the same group" : "Merge selected"}
                >
                    Merge
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
                    title="Undo"
                >
                    ↩ Undo
                </button>
                <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo"
                >
                    ↪ Redo
                </button>
                <button onClick={handleClear} className="px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">Clear</button>

                <div className="w-px h-6 bg-gray-300 mx-2" />

                <button
                    onClick={handleZoomIn}
                    disabled={visRange <= MIN_ZOOM_RANGE + 0.1}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed font-mono text-sm"
                    title="Zoom in"
                >
                    🔍+
                </button>
                <button
                    onClick={handleZoomOut}
                    disabled={visRange >= duration}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed font-mono text-sm"
                    title="Zoom out"
                >
                    🔍−
                </button>
                <button
                    onClick={handleZoomReset}
                    disabled={zoomStart === 0 && (zoomEnd === duration || zoomEnd === 0)}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                    title="Reset zoom"
                >
                    Reset Zoom
                </button>
            </div>
        </section>
    );
}