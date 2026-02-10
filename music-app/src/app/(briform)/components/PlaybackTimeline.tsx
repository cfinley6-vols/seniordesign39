// music-app/src/app/briform/[id]/PlaybackTimeline.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

type Region = { start: number; end: number; label: string };
type DragMode = "none" | "move" | "resize-start" | "resize-end";

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

export function PlaybackTimeline({ selectedTrack }: PlaybackTimelineProps) {
  // ===== YouTube Player State (existing) =====
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    selectedTrack.duration_ms > 0 ? selectedTrack.duration_ms / 1000 : 0
  );
  const [isReady, setIsReady] = useState(false);

  // ===== Briform Regions State (NEW) =====
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Drag behavior (bonus)
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeRegion, setActiveRegion] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");

  // ===== Refs (existing) =====
  const playerRef = useRef<any>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // ----- Utility checks (NEW) -----
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
    if (!playerRef.current) return;
    const t = clamp(seconds, 0, duration || seconds);
    playerRef.current.seekTo(t, true);
    setCurrentTime(t);
  };

  // ===== Initialize YouTube Player (existing, with small adds) =====
  useEffect(() => {
    if (!selectedTrack.id) return;

    const loadPlayer = () => {
      if (!playerContainerRef.current) return;

      // reset for new video
      setIsReady(false);
      setCurrentTime(0);
      setIsPlaying(false);
      setRegions([]);
      setSelectedRegionIds(new Set());
      setHoverTime(null);
      setDragStart(null);
      setIsCreating(false);
      setActiveRegion(null);
      setDragMode("none");

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
      }

      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        height: "100%",
        width: "100%",
        videoId: selectedTrack.id,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            setIsReady(true);
            const d = event.target.getDuration?.();
            if (typeof d === "number" && d > 0) setDuration(d);
          },
          onStateChange: (event: any) => {
            setIsPlaying(event.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = loadPlayer;
    } else {
      loadPlayer();
    }

    return () => {
      // cleanup on unmount
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
  }, [selectedTrack.id]);

  // ===== Poll for time (existing) =====
  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;

    const interval = setInterval(() => {
      try {
        const t = playerRef.current.getCurrentTime?.();
        if (typeof t === "number") setCurrentTime(t);
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // ===== Controls (existing + NEW) =====
  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const skip = (deltaSeconds: number) => {
    seekTo(currentTime + deltaSeconds);
  };

  // MARK: create region starting at playhead
  const handleMark = () => {
    if (!duration || duration <= 0) return;

    const defaultLen = 8;
    const start = clamp(currentTime, 0, duration);
    const end = clamp(start + defaultLen, 0, duration);

    if (end - start < 0.25) return;
    if (isOverlapping(start, end)) {
      alert("That mark overlaps an existing region. Seek elsewhere or adjust regions.");
      return;
    }

    const label = prompt("Label for this section (Intro, Verse, Chorus):", "New Section") ?? "";
    const finalLabel = label.trim() === "" ? "New Section" : label.trim();

    setRegions((prev) => [...prev, { start, end, label: finalLabel }].sort((a, b) => a.start - b.start));
  };

  // SPLIT: split region containing playhead
  const handleSplit = () => {
    const t = currentTime;
    const idx = regions.findIndex((r) => t > r.start && t < r.end);

    if (idx === -1) {
      alert("Playhead is not inside a region. Move playhead into a bubble before splitting.");
      return;
    }

    const r = regions[idx];
    if (t - r.start < 0.25 || r.end - t < 0.25) {
      alert("Split point too close to the edge. Move playhead slightly inward.");
      return;
    }

    const leftLabel = prompt("Left label:", r.label) ?? r.label;
    const rightLabel = prompt("Right label:", r.label) ?? r.label;

    setRegions((prev) => {
      const updated = [...prev];
      updated.splice(
        idx,
        1,
        { start: r.start, end: t, label: leftLabel.trim() || r.label },
        { start: t, end: r.end, label: rightLabel.trim() || r.label }
      );
      return updated.sort((a, b) => a.start - b.start);
    });

    setSelectedRegionIds(new Set());
  };

  // GROUP: merge selected regions
  const handleGroup = () => {
    const ids = Array.from(selectedRegionIds.values()).sort((a, b) => a - b);
    if (ids.length < 2) {
      alert("Select at least 2 regions to group (click bubbles to select).");
      return;
    }

    const selected = ids.map((i) => regions[i]).filter(Boolean);
    const start = Math.min(...selected.map((r) => r.start));
    const end = Math.max(...selected.map((r) => r.end));

    const remaining = regions.filter((_, i) => !selectedRegionIds.has(i));
    const overlapsRemaining = remaining.some((r) => start < r.end && end > r.start);
    if (overlapsRemaining) {
      alert("Grouped region would overlap a non-selected region. Adjust selection.");
      return;
    }

    const label = prompt("Group label:", "Grouped Section") ?? "Grouped Section";
    const finalLabel = label.trim() === "" ? "Grouped Section" : label.trim();

    const next = [...remaining, { start, end, label: finalLabel }].sort((a, b) => a.start - b.start);
    setRegions(next);
    setSelectedRegionIds(new Set());
  };

  const handleClear = () => {
    const ok = confirm("Clear all regions?");
    if (!ok) return;
    setRegions([]);
    setSelectedRegionIds(new Set());
  };

  // ===== Timeline interactions (NEW) =====
  const startRegionDrag = (index: number, mode: DragMode) => {
    setActiveRegion(index);
    setDragMode(mode);
  };

  const toggleSelectRegion = (index: number) => {
    setSelectedRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = timeFromMouse(e);
    if (t === null) return;
    setHoverTime(t);

    if (dragMode !== "none" && activeRegion !== null) {
      setRegions((prev) => {
        const updated = [...prev];
        const region = { ...updated[activeRegion] };

        switch (dragMode) {
          case "move": {
            const width = region.end - region.start;
            const newStart = t - width / 2;
            const newEnd = newStart + width;
            if (newStart >= 0 && newEnd <= duration && !isOverlapping(newStart, newEnd, activeRegion)) {
              region.start = newStart;
              region.end = newEnd;
            }
            break;
          }
          case "resize-start": {
            if (t >= 0 && t < region.end && !isOverlapping(t, region.end, activeRegion)) region.start = t;
            break;
          }
          case "resize-end": {
            if (t <= duration && t > region.start && !isOverlapping(region.start, t, activeRegion)) region.end = t;
            break;
          }
        }

        updated[activeRegion] = region;
        return updated.sort((a, b) => a.start - b.start);
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = timeFromMouse(e);
    if (t === null) return;
    setDragStart(t);
    setIsCreating(true);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = timeFromMouse(e);
    if (t === null) return;

    if (isCreating && dragStart !== null) {
      const start = Math.min(dragStart, t);
      const end = Math.max(dragStart, t);

      if (Math.abs(end - start) > 0.25 && !isOverlapping(start, end)) {
        const input = prompt("Enter region label", "New Section");
        if (input !== null) {
          const label = input.trim() === "" ? "New Section" : input.trim();
          setRegions((prev) => [...prev, { start, end, label }].sort((a, b) => a.start - b.start));
        }
      }
    }

    setIsCreating(false);
    setDragMode("none");
    setActiveRegion(null);
    setDragStart(null);
  };

  const prettyTime = useMemo(() => {
    const s = Math.floor(currentTime);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }, [currentTime]);

  return (
    <div className="w-full max-w-5xl mx-auto mt-6">
      {/* ===========================
          Briform Bubble Timeline (TOP)
         =========================== */}
      <section className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg p-5 shadow mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Timeline</div>
          <div className="text-sm opacity-80 font-mono">
            {prettyTime} / {duration ? `${Math.floor(duration)}s` : "--"}
          </div>
        </div>

        <div
          ref={timelineRef}
          className="relative w-full h-5 bg-gray-300 dark:bg-gray-700 rounded-sm overflow-hidden cursor-pointer"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={(e) => {
            const t = timeFromMouse(e);
            if (t !== null) seekTo(t);
          }}
          title="Click to seek. Drag to create region (bonus)."
        >
          {/* playhead */}
          <div
            className="absolute -top-2 w-[3px] h-9 bg-red-600"
            style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          />

          {/* regions (bubbles) */}
          {regions.map((r, i) => {
            const selected = selectedRegionIds.has(i);
            return (
              <div
                key={i}
                className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-full border px-2 flex items-center ${
                  selected
                    ? "bg-blue-600 text-white border-blue-200"
                    : "bg-blue-400/80 text-white border-blue-200"
                }`}
                style={{
                  left: `${duration ? (r.start / duration) * 100 : 0}%`,
                  width: `${duration ? ((r.end - r.start) / duration) * 100 : 0}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectRegion(i);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startRegionDrag(i, "move");
                }}
                onDoubleClick={() => {
                  const input = prompt("Rename region:", r.label);
                  if (input === null) return;
                  const newLabel = input.trim() === "" ? r.label : input.trim();
                  setRegions((prev) => prev.map((x, idx) => (idx === i ? { ...x, label: newLabel } : x)));
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setRegions((prev) => prev.filter((_, idx) => idx !== i));
                  setSelectedRegionIds((prev) => {
                    const next = new Set(prev);
                    next.delete(i);
                    return next;
                  });
                }}
                title="Click select. Double-click rename. Right-click delete."
              >
                {/* resize handles */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 rounded-l-full bg-white/30 cursor-ew-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    startRegionDrag(i, "resize-start");
                  }}
                />
                <span className="text-xs font-semibold truncate pointer-events-none">{r.label}</span>
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 rounded-r-full bg-white/30 cursor-ew-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    startRegionDrag(i, "resize-end");
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>{hoverTime !== null ? `Hover: ${Math.round(hoverTime)}s` : " "}</span>
          <span className="opacity-80">
            click: seek • hold: create bubble • dbl click: rename • right click: delete
          </span>
        </div>

        {/* Briform Buttons */}
        <div className="mt-4 flex flex-wrap gap-3 items-center justify-center">
          <button
            onClick={() => skip(-5)}
            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:opacity-90"
            title="Back 5s"
          >
            ↩ -5s
          </button>

          <button
            onClick={togglePlay}
            disabled={!isReady}
            className="px-6 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            title="Play/Pause"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            onClick={() => skip(5)}
            className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:opacity-90"
            title="Forward 5s"
          >
            +5s ↪
          </button>

          <button onClick={handleSplit} className="px-5 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:opacity-90">
            Split
          </button>
          <button onClick={handleMark} className="px-5 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:opacity-90">
            Mark
          </button>
          <button onClick={handleGroup} className="px-5 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:opacity-90">
            Group
          </button>

          <button onClick={handleClear} className="px-6 py-2 rounded bg-red-600 text-white hover:opacity-90">
            Clear
          </button>
        </div>
      </section>

      {/* ===========================
          Video (BELOW Timeline)
         =========================== */}
      <div className="mb-4 aspect-video bg-black rounded overflow-hidden">
        <div ref={playerContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
