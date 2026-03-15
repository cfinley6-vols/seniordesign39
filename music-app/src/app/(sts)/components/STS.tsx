"use client";

import { useState } from "react";

export default function SoundToScore() {
	const [url, setUrl] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const handleConvert = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		try {
			const response = await fetch("http://localhost:8000/api/convert", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url }),
			});

			if (!response.ok) throw new Error("Conversion failed on the server.");

			// How to handle a file coming back from an API
			const blob = await response.blob();
			const downloadUrl = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = downloadUrl;
			link.download = "transcription.mid";
			document.body.appendChild(link);
			link.click();
			link.remove();

		} catch (err: any) {
			setError(err.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="p-8 max-w-xl mx-auto">
			<h1 className="text-2xl font-bold mb-4">Sound to Score</h1>

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
		</div>
	);
}