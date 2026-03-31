// music-app/src/app/(sts)/components/STS.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Script from "next/script";
import { Midi } from "@tonejs/midi";

// --- HELPER 1: THE TEMPO GUESSER ---
function estimateBpm(midiBlob: Blob): Promise<number> {
    return new Promise(async (resolve) => {
        const arrayBuffer = await midiBlob.arrayBuffer();
        const parsedMidi = new Midi(arrayBuffer);
        
        let onsets: number[] = [];
        parsedMidi.tracks.forEach(track => {
            track.notes.forEach(note => onsets.push(note.time));
        });
        
        onsets.sort((a, b) => a - b);

        let intervals: number[] = [];
        for (let i = 1; i < onsets.length; i++) {
            let delta = onsets[i] - onsets[i-1];
            if (delta > 0.1 && delta < 2.0) { 
                intervals.push(delta);
            }
        }

        if (intervals.length === 0) return resolve(120);

        let buckets: Record<string, number> = {};
        intervals.forEach(interval => {
            let rounded = (Math.round(interval * 20) / 20).toFixed(2);
            buckets[rounded] = (buckets[rounded] || 0) + 1;
        });

        let mostCommonGap = Object.keys(buckets).reduce((a, b) => buckets[a] > buckets[b] ? a : b);
        let beatDuration = parseFloat(mostCommonGap);

        let guessedBpm = Math.round(60 / beatDuration);
        
        while (guessedBpm < 60) guessedBpm *= 2;
        while (guessedBpm > 180) guessedBpm /= 2;

        resolve(guessedBpm);
    });
}

// --- HELPER 2: THE SMART QUANTIZER ---
async function smartQuantize(midiBlob: Blob, targetBpm: number, gridResolution: number, offsetSeconds: number): Promise<Blob> {
    const arrayBuffer = await midiBlob.arrayBuffer();
    const parsedMidi = new Midi(arrayBuffer);

    // If the file is completely empty, just return it
    if (parsedMidi.tracks.length === 0) return midiBlob;

    const ppq = parsedMidi.header.ppq;
    const secondsPerBeat = 60 / targetBpm;
    const ticksPerBeat = ppq;
    const snapFactor = 1 / gridResolution; 

    parsedMidi.header.tempos = [{ ticks: 0, bpm: targetBpm, time: 0 }];

    parsedMidi.tracks.forEach(track => {
        track.notes.forEach(note => {
            // Shift the note based on the explicit offset
            let relativeTime = note.time - offsetSeconds;
            let rawBeats = relativeTime / secondsPerBeat;
            let snappedBeats = Math.round(rawBeats / snapFactor) * snapFactor;
            
            note.ticks = Math.round(snappedBeats * ticksPerBeat);

            let rawDurationBeats = note.duration / secondsPerBeat;
            let snappedDurationBeats = Math.max(
                snapFactor,
                Math.round(rawDurationBeats / snapFactor) * snapFactor
            );
            note.durationTicks = Math.round(snappedDurationBeats * ticksPerBeat);
        });
    });

    const newMidiData = parsedMidi.toArray();
    return new Blob([newMidiData], { type: 'audio/midi' });
}
// ------------------------------------

export default function SoundToScore() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    
    // Core Audio/Visual State
    const [midiUrl, setMidiUrl] = useState<string | null>(null);
    const playerRef = useRef<any>(null);
    const visualizerRef = useRef<any>(null);

    // Tuning State
    const [rawBlob, setRawBlob] = useState<Blob | null>(null);
    const [bpm, setBpm] = useState<number>(120);
    const [grid, setGrid] = useState<number>(4); // 4 = 16th notes
    const [offset, setOffset] = useState<number>(0); // Seconds to trim
    const [isTuning, setIsTuning] = useState(false);

    // Safely load the web components
    useEffect(() => {
        if (playerRef.current && visualizerRef.current && midiUrl) {
            playerRef.current.src = midiUrl;
            visualizerRef.current.src = midiUrl;
            playerRef.current.setAttribute("sound-font", "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus");
            playerRef.current.addVisualizer(visualizerRef.current);
        }
    }, [midiUrl]);

    const handleConvert = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        if (midiUrl) {
            URL.revokeObjectURL(midiUrl);
            setMidiUrl(null);
        }

        try {
            const response = await fetch("/api/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) throw new Error("Conversion failed on the server.");

            const blob = await response.blob();
            setRawBlob(blob);

            // Auto-guess the BPM right away
            const guessedBpm = await estimateBpm(blob);
            setBpm(guessedBpm);
            
            // We use 0 for the initial offset, letting the user fix it if needed
            setOffset(0);

            // Run the initial quantization
            const quantizedBlob = await smartQuantize(blob, guessedBpm, grid, 0);
            const newMidiUrl = window.URL.createObjectURL(quantizedBlob);
            setMidiUrl(newMidiUrl);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Re-guess the tempo if the user messes up the input
    const handleGuessTempo = async () => {
        if (!rawBlob) return;
        const guessed = await estimateBpm(rawBlob);
        setBpm(guessed);
    };

    // Apply Tuning function
    const handleReQuantize = async () => {
        if (!rawBlob) return;
        setIsTuning(true);

        try {
            const quantizedBlob = await smartQuantize(rawBlob, bpm, grid, offset);
            
            if (midiUrl) URL.revokeObjectURL(midiUrl);
            const newMidiUrl = window.URL.createObjectURL(quantizedBlob);
            setMidiUrl(newMidiUrl);
        } catch (err) {
            console.error("Failed to quantize:", err);
        } finally {
            setIsTuning(false);
        }
    };

    const handleDownload = () => {
        if (!midiUrl) return;
        const link = document.createElement("a");
        link.href = midiUrl;
        link.download = "transcription.mid";
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    return (
        <div className="p-8 max-w-3xl mx-auto w-full">
            <Script 
                src="https://cdn.jsdelivr.net/combine/npm/tone@14.7.58,npm/@magenta/music@1.23.1/es6/core.js,npm/focus-visible@5,npm/html-midi-player@1.5.0"
                strategy="lazyOnload"
            />

            <h1 className="text-2xl font-bold mb-4 dark:text-white">Sound to Score</h1>

            <form onSubmit={handleConvert} className="flex flex-col gap-4">
                <input
                    type="url"
                    placeholder="Paste YouTube URL here..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="p-2 border rounded text-black dark:text-white bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                />
                <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isLoading ? "Analyzing Audio..." : "Convert to MIDI"}
                </button>
            </form>

            {error && <p className="text-red-500 mt-4">{error}</p>}

            {midiUrl && (
                <div className="mt-8 flex flex-col gap-4 bg-gray-50 dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold dark:text-white">Generated Score</h2>
                        <button
                            onClick={handleDownload}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors"
                        >
                            Download .MID
                        </button>
                    </div>

                    {/* PLAYBACK TUNING UI */}
                    <div className="flex flex-wrap gap-4 items-end bg-white dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                Offset (Sec)
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                value={offset}
                                onChange={(e) => setOffset(Number(e.target.value))}
                                className="p-2 border rounded w-24 text-black dark:text-white bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                title="Trim initial silence (e.g., 2.5)"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                BPM
                            </label>
                            <div className="flex">
                                <input
                                    type="number"
                                    value={bpm}
                                    onChange={(e) => setBpm(Number(e.target.value))}
                                    className="p-2 border rounded-l w-20 text-black dark:text-white bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                />
                                <button
                                    onClick={handleGuessTempo}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 px-2 rounded-r border border-l-0 border-gray-300 dark:border-gray-600 text-sm"
                                    title="Auto-guess tempo"
                                >
                                    Guess
                                </button>
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                Snap to Grid
                            </label>
                            <select
                                value={grid}
                                onChange={(e) => setGrid(Number(e.target.value))}
                                className="p-2 border rounded text-black dark:text-white bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                            >
                                <option value={1}>Quarter Notes</option>
                                <option value={2}>8th Notes</option>
                                <option value={4}>16th Notes</option>
                                <option value={8}>32nd Notes</option>
                            </select>
                        </div>

                        <button
                            onClick={handleReQuantize}
                            disabled={isTuning}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded transition-colors disabled:bg-gray-400 ml-auto font-medium"
                        >
                            {isTuning ? "Snapping..." : "Apply Tuning"}
                        </button>
                    </div>

                    {/* 3. Attach the player reference */}
                    <midi-player
					    ref={playerRef}
					    src={midiUrl}
					    sound-font="https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus"
					    className="w-full rounded"
					></midi-player>

                    <div className="overflow-x-auto bg-white border border-gray-200 p-4 rounded min-h-[200px]">
                        {/* 4. Attach the visualizer reference */}
                        <midi-visualizer
                            ref={visualizerRef}
                            type="staff"
                            src={midiUrl}
                        ></midi-visualizer>
                    </div>
                </div>
            )}
        </div>
    );
}