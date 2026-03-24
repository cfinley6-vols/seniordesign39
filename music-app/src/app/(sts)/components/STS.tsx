// music-app/src/app/(sts)/components/STS.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Script from "next/script";

export default function SoundToScore() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [midiUrl, setMidiUrl] = useState<string | null>(null);

    // 1. Create references so we can directly control the HTML elements
    const playerRef = useRef<any>(null);
    const visualizerRef = useRef<any>(null);

    // 2. Whenever the midiUrl changes (a song is loaded), manually link them
    useEffect(() => {
        if (playerRef.current && visualizerRef.current && midiUrl) {
            
            // Bypass React and inject the file directly into the components
            playerRef.current.src = midiUrl;
            visualizerRef.current.src = midiUrl;

            // Force the sound-font attribute on the element
            playerRef.current.setAttribute("sound-font", "");

            // Link the visualizer needle to the audio playback
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
            const newMidiUrl = window.URL.createObjectURL(blob);
            setMidiUrl(newMidiUrl);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
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
                    {isLoading ? "Processing (This takes a minute)..." : "Convert to MIDI"}
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