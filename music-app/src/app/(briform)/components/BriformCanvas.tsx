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
    // Keep a ref to playerRef.current so the global mouseup closure always sees
    // the latest player instance without needing to re-register the listener.
    const playerInstanceRef = useRef<any>(null);
    const isPlayingRef = useRef(isPlaying);
    const togglePlayRef = useRef(togglePlay);

    useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);
    useEffect(() => { durationRef.current = duration; }, [duration]);
    useEffect(() => { playerInstanceRef.current = playerRef?.current ?? null; }, );
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);

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

    const playheadPct = (() => {
        if (playheadDragPos !== null) return playheadDragPos;
        if (lastSeekPctRef.current !== null) return lastSeekPctRef.current;
        return duration ? (currentTime / duration) * 100 : 0;
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
            const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
            const t = clamp(((clientX - rect.left) / rect.width) * durationRef.current, 0, durationRef.current);
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
            return clamp(((clientX - rect.left) / rect.width) * (duration || 1), 0, duration || 1);
        },
        [duration]
    );

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
        const layers = new Set(selected.map((r) => r.layer || 0));
        if (layers.size > 1) { alert("All selected regions must be on the same layer to group."); return; }
        if (selected.some((r) => r.parentId !== undefined)) { alert("One or more selected bubbles are already part of a group."); return; }

        const sortedSelected = [...selected].sort((a, b) => a.start - b.start);
        for (let i = 0; i < sortedSelected.length - 1; i++) {
            if (sortedSelected[i + 1].start - sortedSelected[i].end > ADJACENCY_TOLERANCE) {
                alert("All bubbles in a group must be touching. There is a gap between selected bubbles.");
                return;
            }
        }

        const start = Math.min(...selected.map((r) => r.start));
        const end = Math.max(...selected.map((r) => r.end));
        let targetLayer = Math.max(...selected.map((r) => r.layer || 0)) + 1;
        while (regions.some((r) => !ids.includes(r.id) && (r.layer || 0) === targetLayer && start < r.end && end > r.start)) {
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
    const canGroup = selectedRegions.length >= 2 && selectedLayers.size === 1 && !alreadyGrouped;
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

            <div className="pt-5">
                <div
                    className="relative w-full bg-gray-100 dark:bg-gray-900 rounded-lg p-1 transition-all duration-300"
                    style={{ height: `${containerHeightPx}px` }}
                >
                    <div
                        ref={timelineRef}
                        className="relative w-full h-full bg-gray-300 dark:bg-gray-600 rounded cursor-pointer shadow-inner overflow-visible"
                        onMouseMove={handleTimelineMouseMove}
                        onMouseDown={handleTimelineMouseDown}
                        onMouseUp={handleTimelineMouseUp}
                    >
                        {/* Playhead line */}
                        <div
                            className="absolute top-0 bottom-0 z-30 w-0.5 bg-red-500 pointer-events-none"
                            style={{ left: `${playheadPct}%` }}
                        />

                        {/* Draggable handle */}
                        <div
                            className="absolute z-40"
                            style={{
                                left: `${playheadPct}%`,
                                top: "-24px",
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

            <div className="mt-4 flex flex-wrap gap-2 items-center justify-center border-t dark:border-gray-700 pt-4">
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
            </div>
        </section>
    );
}