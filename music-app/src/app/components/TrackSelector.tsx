// music-app/src/app/components/TrackSelector.tsx
// Legacy Code
"use client";
import { useState } from "react"

interface Track {
	id: string;
	name: string;
	artists: { name: string }[];
	album: { images: { url: string }[] };
	duration_ms: number;
}

interface TrackSelectorProps {
	accessToken: string;
	onSelectTrack: (track: Track) => void;
}

export function TrackSelector({ accessToken, onSelectTrack }: TrackSelectorProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Track[]>([]);
	const [loading, setLoading] = useState(false);

	const searchTracks = async () => {
		if (!query) return;
		setLoading(true);
		try {
			const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const data = await res.json();
			setResults(data.tracks.items);
		} catch (err) {
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mb-6">
			<div className="flex gap-2 mb-3">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search Spotify track..."
					className="flex-1 p-2 rounded bg-gray-800 text-white"
				/>
				<button
					onClick={searchTracks}
					className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 text-white"
				>
					Search
				</button>
			</div>

			{loading && <p>Loading...</p>}

			<ul>
				{results.map((track) => (
					<li key={track.id} className="flex justify-between items-center mb-2">
						<div>
							<p className="font-medium">{track.name}</p>
							<p className="text-sm text-gray-400">{track.artists.map(a => a.name).join(", ")}</p>
						</div>
						<button
							onClick={() => onSelectTrack(track)}
							className="px-3 py-1 bg-green-500 rounded hover:bg-green-600 text-white"
						>
							Select
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}