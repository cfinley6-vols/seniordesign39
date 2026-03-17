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
    color?: string; // hex color, e.g. "#3b82f6"
};

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

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

const MIN_WIDTH = 0.25;
const MAX_HISTORY = 50;
const ADJACENCY_TOLERANCE = 0.5;

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

const clampBorders = (regions: Region[], duration: number): Region[] => {
    if (duration <= 0) return regions;
    const layer0 = regions.filter((r) => (r.layer || 0) === 0);
    if (layer0.length === 0) return regions;
    const minStart = Math.min(...layer0.map((r) => r.start));
    const maxEnd = Math.max(...layer0.map((r) => r.end));
    return regions.map((r) => {
        if ((r.layer || 0) !== 0) return r;
        const updated = { ...r };
        if (r.start === minStart) updated.start = 0;
        if (r.end === maxEnd) updated.end = duration;
        return updated;
    });
};

const fullSync = (regions: Region[], duration: number): Region[] =>
    syncRegions(clampBorders(regions, duration));

/**
 * cascadeDeleteGroups: when a bubble is deleted (or squeezed out), walk UP the
 * parent chain from each affected bubble to find the topmost ancestor, then
 * delete top-down so that each removal cascades correctly through the hierarchy.
 *
 * Algorithm:
 * 1. Find every group that now has < 2 children.
 * 2. For each such group, walk up to its topmost ancestor (a group with no parent,
 *    or whose parent is not also being deleted).
 * 3. Sort the groups to delete by layer descending (highest first).
 * 4. Delete them one layer at a time, orphaning children after each pass.
 * 5. Repeat until no more under-populated groups remain.
 */
const cascadeDeleteGroups = (regions: Region[]): Region[] => {
    let current = [...regions];
    let changed = true;

    while (changed) {
        changed = false;

        // Find all groups with fewer than 2 children
        const underPopulated = current.filter((r) => {
            const isParent = current.some((c) => c.parentId === r.id);
            if (!isParent) return false;
            return current.filter((c) => c.parentId === r.id).length < 2;
        });

        if (underPopulated.length === 0) break;

        // Walk up to find topmost ancestor for each under-populated group
        const getAncestorChain = (id: string): string[] => {
            const chain: string[] = [id];
            let r = current.find((x) => x.id === id);
            while (r?.parentId) {
                const parent = current.find((x) => x.id === r!.parentId);
                if (!parent) break;
                chain.push(parent.id);
                r = parent;
            }
            return chain; // [self, parent, grandparent, ...]
        };

        // Collect all IDs that should be deleted (the under-populated ones + any ancestor
        // that would also become under-populated once its child is gone)
        const toDeleteIds = new Set<string>();
        for (const g of underPopulated) {
            // Walk up — if removing g would leave g's parent with < 2 children, delete parent too
            const chain = getAncestorChain(g.id);
            for (const id of chain) {
                const parent = current.find((x) => x.id === id);
                if (!parent) continue;
                const childCount = current.filter((c) => c.parentId === id).length;
                // This group has < 2 children (or will once its child is deleted)
                if (childCount < 2) {
                    toDeleteIds.add(id);
                } else {
                    break; // ancestor is still healthy — stop walking up
                }
            }
        }

        if (toDeleteIds.size === 0) break;

        // Delete highest layer first (top-down)
        const sortedToDelete = [...toDeleteIds].sort((a, b) => {
            const layerA = current.find((r) => r.id === a)?.layer || 0;
            const layerB = current.find((r) => r.id === b)?.layer || 0;
            return layerB - layerA; // descending
        });

        for (const id of sortedToDelete) {
            current = current
                .filter((r) => r.id !== id)
                .map((r) => r.parentId === id ? { ...r, parentId: undefined } : r);
        }

        changed = true;
    }

    return current;
};

/**
 * applyResizeWithNeighbor: resize the active bubble, pushing or consuming neighbors.
 *
 * Fast-drag fix: neighbor lookup uses the SORTED POSITION in the layer array
 * rather than proximity to active.end/active.start. This means even if the mouse
 * skipped over a bubble in one frame, we still find it by sorted order and consume
 * everything between the active bubble and the target position correctly.
 */
function applyResizeWithNeighbor(
    regions: Region[],
    activeId: string,
    dragMode: "resize-start" | "resize-end",
    t: number,
    duration: number
): Region[] {
    const layer = regions.find((r) => r.id === activeId)?.layer || 0;
    let updated = regions.map((r) => ({ ...r }));

    // Always re-derive sorted layer from updated so deletions are reflected
    const getSortedLayer = () =>
        updated.filter((r) => (r.layer || 0) === layer).sort((a, b) => a.start - b.start);

    const active = updated.find((r) => r.id === activeId);
    if (!active) return regions;

    const layerSorted = getSortedLayer();
    const activeIdx = layerSorted.findIndex((r) => r.id === activeId);

    if (dragMode === "resize-end") {
        const isRightmost = activeIdx === layerSorted.length - 1;
        if (isRightmost) return regions;

        const target = clamp(t, 0, duration);

        // Drag-to-zero: active bubble itself shrinks away
        if (target <= active.start + MIN_WIDTH && layer !== 0) {
            // Give its space to the left neighbor (if any)
            const leftNeighbor = activeIdx > 0 ? layerSorted[activeIdx - 1] : null;
            updated = updated.filter((r) => r.id !== activeId);
            if (leftNeighbor) {
                const n = updated.find((r) => r.id === leftNeighbor.id);
                if (n) n.end = active.end;
            }
            return fullSync(cascadeDeleteGroups(updated), duration);
        }

        const clampedTarget = clamp(target, active.start + MIN_WIDTH, duration);

        // All bubbles to the RIGHT of the active bubble in sorted order
        // Using sorted index instead of proximity — immune to fast-drag gaps
        const bubblesToRight = layerSorted.slice(activeIdx + 1);

        if (bubblesToRight.length === 0) {
            updated.find((r) => r.id === activeId)!.end = clampedTarget;
        } else {
            let cursor = clampedTarget;
            const toDelete: string[] = [];
            for (const neighbor of bubblesToRight) {
                if (cursor >= neighbor.end - MIN_WIDTH) {
                    // Fully consume this neighbor
                    toDelete.push(neighbor.id);
                    cursor = neighbor.end;
                } else if (cursor > neighbor.start) {
                    // Partially overlap — push neighbor right
                    updated.find((r) => r.id === neighbor.id)!.start = cursor;
                    break;
                } else {
                    break;
                }
            }
            updated = updated.filter((r) => !toDelete.includes(r.id));
            const a = updated.find((r) => r.id === activeId)!;
            a.end = cursor > clampedTarget ? cursor : clampedTarget;
            // Force flush with the immediate right neighbor
            const newSorted = updated.filter((r) => (r.layer || 0) === layer).sort((a, b) => a.start - b.start);
            const newActiveIdx = newSorted.findIndex((r) => r.id === activeId);
            const immediateRight = newActiveIdx < newSorted.length - 1 ? newSorted[newActiveIdx + 1] : null;
            if (immediateRight && immediateRight.start !== a.end) immediateRight.start = a.end;
        }
    } else {
        // resize-start
        const isLeftmost = activeIdx === 0;
        if (isLeftmost) return regions;

        const target = clamp(t, 0, duration);

        // Drag-to-zero: active bubble shrinks away
        if (target >= active.end - MIN_WIDTH && layer !== 0) {
            const rightNeighbor = activeIdx < layerSorted.length - 1 ? layerSorted[activeIdx + 1] : null;
            updated = updated.filter((r) => r.id !== activeId);
            if (rightNeighbor) {
                const n = updated.find((r) => r.id === rightNeighbor.id);
                if (n) n.start = active.start;
            }
            return fullSync(cascadeDeleteGroups(updated), duration);
        }

        const clampedTarget = clamp(target, 0, active.end - MIN_WIDTH);

        // All bubbles to the LEFT in sorted order — reversed so nearest-first
        const bubblesToLeft = layerSorted.slice(0, activeIdx).reverse();

        if (bubblesToLeft.length === 0) {
            updated.find((r) => r.id === activeId)!.start = clampedTarget;
        } else {
            let cursor = clampedTarget;
            const toDelete: string[] = [];
            for (const neighbor of bubblesToLeft) {
                if (cursor <= neighbor.start + MIN_WIDTH) {
                    // Fully consume this neighbor
                    toDelete.push(neighbor.id);
                    cursor = neighbor.start;
                } else if (cursor < neighbor.end) {
                    // Partially overlap — push neighbor left
                    updated.find((r) => r.id === neighbor.id)!.end = cursor;
                    break;
                } else {
                    break;
                }
            }
            updated = updated.filter((r) => !toDelete.includes(r.id));
            const a = updated.find((r) => r.id === activeId)!;
            a.start = cursor < clampedTarget ? cursor : clampedTarget;
            // Force flush with the immediate left neighbor
            const newSorted = updated.filter((r) => (r.layer || 0) === layer).sort((a, b) => a.start - b.start);
            const newActiveIdx = newSorted.findIndex((r) => r.id === activeId);
            const immediateLeft = newActiveIdx > 0 ? newSorted[newActiveIdx - 1] : null;
            if (immediateLeft && immediateLeft.end !== a.start) immediateLeft.end = a.start;
        }
    }

    updated = cascadeDeleteGroups(updated);
    return fullSync(updated, duration);
}

function PlayheadHandle({ dragging }: { dragging: boolean }) {
    return (
        <svg
            width="12"
            height="26"
            viewBox="0 0 12 26"
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
    // Updated by live playback (small increments) AND explicitly on playhead drag release.
    // This prevents splitting at a stale paused position after the user drags the playhead.
    const confirmedTimeRef = useRef<number>(0);

    const historyRef = useRef<Region[][]>([]);
    const redoRef = useRef<Region[][]>([]);
    const isDraggingRef = useRef(false);
    const timelineRef = useRef<HTMLDivElement>(null);
    const dragSnapshotRef = useRef<Region[] | null>(null);
    const dragModeRef = useRef<DragMode>("none");
    const durationRef = useRef(duration);
    const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Refs for zoom so the global mouseup closure always sees current values
    const zoomStartRef = useRef(0);
    const zoomEndRef = useRef(0);
    // Keep a ref to playerRef.current so the global mouseup closure always sees
    // the latest player instance without needing to re-register the listener.
    const playerInstanceRef = useRef<any>(null);
    const isPlayingRef = useRef(isPlaying);
    const togglePlayRef = useRef(togglePlay);

    useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
    useEffect(() => {
        durationRef.current = duration;
        // When duration becomes known and zoom is unset, initialise to full view
        if (duration > 0) {
            setZoomEnd((prev) => prev === 0 ? duration : prev);
        }
    }, [duration]);
    useEffect(() => { playerInstanceRef.current = playerRef?.current ?? null; }, );
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);
    useEffect(() => { zoomStartRef.current = zoomStart; }, [zoomStart]);
    useEffect(() => { zoomEndRef.current = zoomEnd; }, [zoomEnd]);

    // Update confirmedTimeRef for live playback (small incremental steps only).
    // Large jumps (>1s) are skips/buffering — don't trust them here;
    // playhead drag releases set confirmedTimeRef directly instead.
    const prevCurrentTimeRef = useRef(currentTime);
    useEffect(() => {
        const delta = Math.abs(currentTime - prevCurrentTimeRef.current);
        if (delta < 1) {
            confirmedTimeRef.current = currentTime;
        }
        prevCurrentTimeRef.current = currentTime;
    }, [currentTime]);

    // Clear lastSeekPctRef once currentTime has caught up
    useEffect(() => {
        if (lastSeekPctRef.current === null || duration <= 0) return;
        const currentPct = (currentTime / duration) * 100;
        if (Math.abs(currentPct - lastSeekPctRef.current) < 1) {
            lastSeekPctRef.current = null;
        }
    }, [currentTime, duration]);

    // Auto-pan: smoothly follow the playhead while it is playing.
    //
    // While playing, we keep the playhead pinned at PLAYHEAD_ANCHOR (20% from left).
    // The window moves every currentTime tick to maintain that anchor position,
    // so the playhead appears stationary and the timeline scrolls under it — smooth,
    // no jumps.
    //
    // While NOT playing (paused/seeking), we do NOT auto-pan. The user is in control
    // and the window should stay wherever they left it. We only snap if the playhead
    // is completely outside the window after a seek.
    const PLAYHEAD_ANCHOR = 0.2; // playhead sits at 20% from the left while playing
    const isPlayingRef2 = useRef(isPlaying);
    useEffect(() => { isPlayingRef2.current = isPlaying; }, [isPlaying]);

    useEffect(() => {
        if (duration <= 0) return;
        const start = zoomStartRef.current;
        const end = zoomEndRef.current > 0 ? zoomEndRef.current : duration;
        const range = end - start;

        // Only auto-pan when zoomed in
        if (range >= duration - 0.1) return;

        const t = currentTime;

        if (isPlayingRef2.current) {
            // PLAYING: keep playhead at fixed anchor position within the window.
            // newStart is wherever puts `t` at PLAYHEAD_ANCHOR fraction of range.
            const newStart = clamp(t - range * PLAYHEAD_ANCHOR, 0, duration - range);
            const newEnd = newStart + range;
            // Only update if the window actually needs to move (avoids redundant renders)
            if (Math.abs(newStart - start) > 0.01) {
                setZoomStart(newStart);
                setZoomEnd(newEnd);
            }
        } else {
            // PAUSED / SEEKING: only snap if playhead is completely outside the window
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

    // Effective zoom window — must be computed before playheadPct uses timeToPct
    const visStart = zoomStart;
    const visEnd = zoomEnd > 0 ? zoomEnd : duration;
    const visRange = Math.max(visEnd - visStart, 0.1);
    const timeToPct = (t: number) => ((t - visStart) / visRange) * 100;

    const playheadPct = (() => {
        if (playheadDragPos !== null) return playheadDragPos;
        // lastSeekPctRef is stored as a zoom-relative pct already when dragging
        if (lastSeekPctRef.current !== null) return lastSeekPctRef.current;
        return timeToPct(currentTime);
    })();

    // --- Seed / missing-bubble guard ---
    // Watches for absence of any layer-0 bubble whenever duration is known.
    // A 400ms debounce lets the parent finish loading DB data before deciding
    // the project is genuinely empty and needs a default bubble inserted.
    const seedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (seedTimerRef.current) clearTimeout(seedTimerRef.current);
        if (duration <= 0) return;

        const hasLayer0 = regions.some((r) => (r.layer || 0) === 0);
        if (hasLayer0) return;

        seedTimerRef.current = setTimeout(() => {
            setRegions((current) => {
                const stillEmpty = !current.some((r) => (r.layer || 0) === 0);
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
            // Map into zoom window — visStart/visEnd captured via closure from component scope
            const currentVisStart = zoomStartRef.current;
            const currentVisEnd = zoomEndRef.current > 0 ? zoomEndRef.current : durationRef.current;
            const currentVisRange = Math.max(currentVisEnd - currentVisStart, 0.1);
            const t = clamp(currentVisStart + ratio * currentVisRange, 0, durationRef.current);
            const pct = ratio * 100; // percentage across visible window
            return { pct, t };
        };

        const onGlobalMouseMove = (e: MouseEvent) => {
            if (dragModeRef.current !== "playhead") return;
            const { pct } = getTimeAndPct(e.clientX);
            if (pct !== null) setPlayheadDragPos(pct);
        };

        const onGlobalMouseUp = (e: MouseEvent) => {
            if (dragModeRef.current === "playhead") {
                const { pct, t } = getTimeAndPct(e.clientX);
                if (pct !== null) lastSeekPctRef.current = pct;

                // KEY FIX: immediately update confirmedTimeRef to the dragged-to position
                // so that Split uses the new position, not wherever the video was paused before.
                if (t !== null) confirmedTimeRef.current = t;

                setPlayheadDragPos(null);
                setDragMode("none");
                dragModeRef.current = "none";

                if (t !== null && playerRef?.current?.seekTo) {
                    playerRef.current.seekTo(t, true);
                }

                if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
                pauseTimerRef.current = setTimeout(() => {
                    // Use playerInstanceRef so we always get the current player,
                    // not a stale closure value from when the effect first ran.
                    const player = playerInstanceRef.current;
                    const state = player?.getPlayerState?.();
                    // Pause if playing (1) or buffering (3)
                    if (state === 1 || state === 3) {
                        player?.pauseVideo?.();
                    } else if (isPlayingRef.current) {
                        // Fallback: if parent thinks it's playing, use togglePlay
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
            // Map pixel ratio into the zoom window
            return clamp(visStart + ratio * visRange, 0, duration || 1);
        },
        [duration, visStart, visRange]
    );

    // Zoom helpers — all zoom operations center on the current playhead position
    const MIN_ZOOM_RANGE = 10; // minimum 10 seconds visible
    const MAX_ZOOM_RANGE = duration; // max = full duration

    const zoomAround = (anchor: number, newRange: number) => {
        const clamped = clamp(newRange, MIN_ZOOM_RANGE, duration);
        // Center the window on anchor, clamped so we don't go past 0 or duration
        let newStart = anchor - clamped / 2;
        let newEnd = anchor + clamped / 2;
        if (newStart < 0) { newEnd = Math.min(duration, newEnd - newStart); newStart = 0; }
        if (newEnd > duration) { newStart = Math.max(0, newStart - (newEnd - duration)); newEnd = duration; }
        setZoomStart(newStart);
        setZoomEnd(newEnd);
    };

    const handleZoomIn = () => {
        const anchor = confirmedTimeRef.current; // center on current playhead
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
    // Pan by scrolling inside the timeline — also wired as a native non-passive
    // listener (see useEffect below) so e.preventDefault() actually blocks page scroll.
    const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (duration <= 0) return;
        const panAmount = (e.deltaX !== 0 ? e.deltaX : e.deltaY) * (visRange / 500);
        const newStart = clamp(visStart + panAmount, 0, duration - visRange);
        const newEnd = newStart + visRange;
        setZoomStart(newStart);
        setZoomEnd(newEnd);
    };

    // Attach a native non-passive wheel listener so preventDefault() stops page scroll
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
        // Use confirmedTimeRef — reflects dragged position immediately, not buffering lag
        const t = confirmedTimeRef.current;
        const target = regions.find((r) => (r.layer || 0) === 0 && t > r.start && t < r.end);
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
        if (selected.some((r) => (r.layer || 0) !== 0)) { alert("Merge only works on base layer bubbles."); return; }

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
        const absorbed = regions.filter((r) => (r.layer || 0) === 0 && r.start >= mergeStart && r.end <= mergeEnd);
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

        // None of the selected bubbles can already have a parent
        if (selected.some((r) => r.parentId !== undefined)) {
            alert("One or more selected bubbles are already part of a group.");
            return;
        }

        // Selected bubbles must form a contiguous time span (no gaps) when projected
        // onto the timeline, regardless of which layers they are on.
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

        // Place the new parent one layer above the highest selected bubble
        let targetLayer = Math.max(...selected.map((r) => r.layer || 0)) + 1;

        // Bump up if something already occupies that layer in the same time range
        // (excluding the selected bubbles themselves)
        while (
            regions.some(
                (r) => !ids.includes(r.id) && (r.layer || 0) === targetLayer && start < r.end && end > r.start
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
        if (!target || (target.layer || 0) === 0) return;

        setRegionsWithHistory(regions, (prev) => {
            // Walk UP the parent chain from the deleted bubble to collect all
            // ancestors that would become under-populated (< 2 children) after
            // this deletion. Collect them ordered bottom-up so we can delete
            // top-down (highest layer first) afterwards.
            const walkUp = (startId: string, list: Region[]): string[] => {
                const ids: string[] = [startId];
                let current = list.find((r) => r.id === startId);
                while (current?.parentId) {
                    const parent = list.find((r) => r.id === current!.parentId);
                    if (!parent) break;
                    // Count how many children parent STILL has after removing `startId` branch
                    const remaining = list.filter(
                        (r) => r.parentId === parent.id && !ids.includes(r.id)
                    ).length;
                    if (remaining < 2) {
                        ids.push(parent.id);
                        current = parent;
                    } else {
                        break; // parent still has enough children — stop
                    }
                }
                return ids;
            };

            const chainToDelete = walkUp(id, prev);

            // Sort highest layer first so we delete top-down
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
                const currentLayer = region.layer || 0;
                const width = region.end - region.start;

                const newStart = clamp(t - width / 2, 0, duration - width);
                const newEnd = newStart + width;

                const colliders = prev.filter(
                    (r) => r.id !== activeRegionId && (r.layer || 0) === currentLayer
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
                // Also update confirmedTimeRef so Split uses this new position immediately
                confirmedTimeRef.current = t;
            }
        }

        // --- DRAG-TO-DELETE: remove a non-layer-0 bubble if dragged into empty space ---
        // To revert: delete this entire block (from here to END DRAG-TO-DELETE)
        if (isDraggingRef.current && dragMode === "move" && activeRegionId !== null) {
            const active = regions.find((r) => r.id === activeRegionId);
            if (active && (active.layer || 0) !== 0) {
                const t = timeFromClient(e.clientX);
                if (t !== null) {
                    const width = active.end - active.start;
                    const newStart = clamp(t - width / 2, 0, duration - width);
                    const newEnd = newStart + width;
                    const hasNoNeighborCollision = !regions.some(
                        (r) => r.id !== activeRegionId && (r.layer || 0) === (active.layer || 0) && newStart < r.end && newEnd > r.start
                    );
                    const nearestNeighborDist = regions
                        .filter((r) => r.id !== activeRegionId && (r.layer || 0) === (active.layer || 0))
                        .reduce((min, r) => Math.min(min, Math.abs(newEnd - r.start), Math.abs(newStart - r.end)), Infinity);
                    if (hasNoNeighborCollision && nearestNeighborDist > 2) {
                        handleDelete(activeRegionId);
                    }
                }
            }
        }
        // END DRAG-TO-DELETE
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

    const maxLayer = regions.length > 0 ? Math.max(...regions.map((r) => r.layer || 0)) : 0;
    const containerHeightPx = 16 + (maxLayer + 1) * 48;
    const canUndo = historyRef.current.length > 0;
    const canRedo = redoRef.current.length > 0;

    const selectedRegions = regions.filter((r) => selectedRegionIds.has(r.id));
    const selectedLayers = new Set(selectedRegions.map((r) => r.layer || 0));
    const alreadyGrouped = selectedRegions.some((r) => r.parentId !== undefined);
    const canGroup = (() => {
        if (selectedRegions.length < 2) return false;
        if (alreadyGrouped) return false;
        // Check contiguity across all selected bubbles regardless of layer
        const sorted = [...selectedRegions].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1].start - sorted[i].end > ADJACENCY_TOLERANCE) return false;
        }
        return true;
    })();
    const canMerge = (() => {
        const ms = selectedRegions.filter((r) => (r.layer || 0) === 0);
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
                    {/* Playhead handle — outside the clipped timeline so it sticks up above.
                         Only shown when the playhead is within the visible zoom window. */}
                    {(playheadPct >= 0 && playheadPct <= 100) && (
                        <div
                            className="absolute z-40 pointer-events-none"
                            style={{ inset: 0 }}
                        >
                            <div
                                className="absolute"
                                style={{
                                    left: `${playheadPct}%`,
                                    top: "-20px",
                                    transform: "translateX(-50%)",
                                    pointerEvents: "all",
                                    cursor: dragMode === "playhead" ? "grabbing" : "grab",
                                    userSelect: "none",
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setDragMode("playhead");
                                    dragModeRef.current = "playhead";
                                    isDraggingRef.current = true;
                                    if (timelineRef.current) {
                                        const rect = timelineRef.current.getBoundingClientRect();
                                        const pct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
                                        setPlayheadDragPos(pct);
                                    }
                                }}
                            >
                                <PlayheadHandle dragging={dragMode === "playhead"} />
                            </div>
                        </div>
                    )}

                    <div
                        ref={timelineRef}
                        className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer shadow-inner overflow-hidden"
                        onMouseMove={handleTimelineMouseMove}
                        onMouseDown={handleTimelineMouseDown}
                        onMouseUp={handleTimelineMouseUp}
                        onWheel={handleTimelineWheel}
                    >
                        {/* Time ruler ticks — rendered at z-50 so they appear above bubbles */}
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
                            const layer = r.layer || 0;
                            const isParent = regions.some((c) => c.parentId === r.id);
                            const isLayer0 = layer === 0;
                            const layer0 = regions.filter((x) => (x.layer || 0) === 0);
                            const isLeftBorder = isLayer0 && r.start === Math.min(...layer0.map((x) => x.start));
                            const isRightBorder = isLayer0 && r.end === Math.max(...layer0.map((x) => x.end));

                            return (
                                <div
                                    key={r.id}
                                    className="absolute rounded-md border px-2 flex items-center justify-center z-20 select-none transition-colors text-white shadow-sm"
                                    style={(() => {
                                        // Resolve color: use bubble's stored color, or default blue/purple
                                        const palette = r.color
                                            ? COLOR_PALETTE.find((p) => p.base === r.color)
                                            : isParent
                                            ? COLOR_PALETTE[1] // purple default for parents
                                            : COLOR_PALETTE[0]; // blue default for leaves
                                        const base = palette?.base ?? (isParent ? "#a855f7" : "#3b82f6");
                                        const sel  = palette?.selected ?? (isParent ? "#9333ea" : "#2563eb");
                                        const bdr  = palette?.border ?? (isParent ? "#d8b4fe" : "#93c5fd");
                                        return {
                                            bottom: `${layer * 48 + 8}px`,
                                            height: `40px`,
                                            // Clamp bubble to the visible zoom window so it clips at the edge
                                            left: `${Math.max(0, timeToPct(r.start))}%`,
                                            width: `${((Math.min(r.end, visEnd) - Math.max(r.start, visStart)) / visRange) * 100}%`,
                                            display: r.end <= visStart || r.start >= visEnd ? "none" : undefined,
                                            backgroundColor: selected ? sel : base,
                                            borderColor: selected ? bdr : `${bdr}80`,
                                            boxShadow: selected ? `0 0 0 2px ${bdr}` : undefined,
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
                                        // Only allow moving base-layer (layer 0) bubbles
                                        if ((r.layer || 0) === 0) startDrag(r.id, "move");
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
                </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 h-5">
                <span>Drag edges to resize • Double-click to rename • Right-click to delete (non-base)</span>
                {groupHint && <span className="text-amber-500 dark:text-amber-400">{groupHint}</span>}
            </div>

            {/* Color picker — always visible; swatches dim when nothing is selected */}
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

                {/* Zoom controls */}
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