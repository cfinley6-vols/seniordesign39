// music-app/src/app/(sts)/components/STS.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import Script from "next/script";

declare global {
    namespace React {
        namespace JSX {
            interface IntrinsicElements {
                "midi-player": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                    src?: string | null;
                    "sound-font"?: string;
                };
                "midi-visualizer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                    src?: string | null;
                    type?: string;
                };
            }
        }
    }
}

export default function SoundToScore() {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [midiUrl, setMidiUrl] = useState<string | null>(null);

    const playerRef = useRef<any>(null);
    const visualizerRef = useRef<any>(null);

    // Safely attach the generated URL to the web components
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

        // Wake up the browser's audio engine on the user's click
        if (typeof window !== "undefined" && (window as any).Tone) {
            await (window as any).Tone.start();
        }

        setIsLoading(true);
        setError("");

        // Clean up the old file from memory if they convert a second song
        if (midiUrl) {
            URL.revokeObjectURL(midiUrl);
            setMidiUrl(null);
        }

        try {
            const response = await fetch("https://seniordesign39.vercel.app/api/convert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) throw new Error("Conversion failed on the server.");

            // Grab the raw file, create a temporary browser link, and save it to state
            const blob = await response.blob();
            const newMidiUrl = window.URL.createObjectURL(blob);
            setMidiUrl(newMidiUrl);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-3xl mx-auto w-full">
            {/* Load the Magenta player and visualizer libraries */}
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
                    <h2 className="text-xl font-semibold dark:text-white">Generated Score</h2>
                    
                    <midi-player
                        ref={playerRef}
                        className="w-full rounded"
                    ></midi-player>

                    <div className="overflow-x-auto bg-white border border-gray-200 p-4 rounded min-h-[200px]">
                        <midi-visualizer
                            ref={visualizerRef}
                            type="staff"
                        ></midi-visualizer>
                    </div>
                </div>
            )}
        </div>
    );
}