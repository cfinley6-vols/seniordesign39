"use client";

import { useState } from "react";

interface Track {
	id: string;
	name: string;
	artists: { name: string }[];
	album: { images: { url: string }[] };
}

export default function Briform() {
	const [query, setQuery] = useState("");
	const [tracks, setTracks] = useState<Track[]>([]);
	const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

	async function searchTracks() {
		if (!query) return;

		// Call your backend API route that handles Spotify API requests
		const res = await fetch(`/api/spotify/search?query=${encodeURIComponent(query)}`);
		const data = await res.json();
		setTracks(data.tracks?.items || []);
	}

	return (
		<div className="p-6">
			<h1 className="text-2xl font-bold mb-4">Select a Track</h1>

			<div className="mb-4">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search for a track..."
					className="border p-2 mr-2"
				/>
				<button onClick={searchTracks} className="bg-blue-500 text-white px-4 py-2 rounded">
					Search
				</button>
			</div>

			<div className="grid gap-4">
				{tracks.map((track) => (
					<div
						key={track.id}
						className={`flex items-center p-2 border rounded cursor-pointer ${selectedTrack?.id === track.id ? "bg-blue-100" : ""
							}`}
						onClick={() => setSelectedTrack(track)}
					>
						<img
							src={track.album.images[0]?.url}
							alt={track.name}
							className="w-12 h-12 mr-4"
						/>
						<div>
							<div className="font-semibold">{track.name}</div>
							<div className="text-sm text-gray-600">
								{track.artists.map((a) => a.name).join(", ")}
							</div>
						</div>
					</div>
				))}
			</div>

			{selectedTrack && (
				<div className="mt-6 p-4 border rounded bg-green-50">
					<h2 className="font-bold text-lg">Selected Track:</h2>
					<p>{selectedTrack.name} — {selectedTrack.artists.map(a => a.name).join(", ")}</p>
				</div>
			)}
		</div>
	);
}