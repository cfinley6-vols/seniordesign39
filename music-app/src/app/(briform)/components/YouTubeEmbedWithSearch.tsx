"use client";

import { useState } from "react";

interface Props {
  onVideoLoaded: (videoId: string) => void;
}

type Video = {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
};

// Extract and validate YouTube ID (11 chars)
function extractYouTubeId(input: string): string | null {
  try {
    // Add protocol if missing so URL constructor works
    let urlStr = input;
    if (!/^https?:\/\//i.test(input)) {
      urlStr = "https://" + input;
    }

    const parsed = new URL(urlStr);
    let id: string | null = null;

    // youtu.be/<id>
    if (parsed.hostname.includes("youtu.be")) {
      id = parsed.pathname.slice(1);
    }

    // youtube.com/watch?v=<id>
    if (!id && parsed.searchParams.get("v")) {
      id = parsed.searchParams.get("v");
    }

    // youtube.com/embed/<id>
    if (!id && parsed.pathname.startsWith("/embed/")) {
      id = parsed.pathname.split("/embed/")[1];
    }

    if (!id) return null;

    // Must be 11-character valid YouTube ID
    const valid = /^[a-zA-Z0-9_-]{11}$/;
    return valid.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbedWithSearch({
  onVideoLoaded,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setError("");
    setResults([]);

    if (!query.trim()) {
      setError("Please enter a search term or URL");
      return;
    }

    // Check if user pasted a full YouTube URL
    const idFromUrl = extractYouTubeId(query);
    if (idFromUrl) {
      onVideoLoaded(idFromUrl);
      return;
    }

    // Otherwise treat as a search query
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }

      if (!data.items || data.items.length === 0) {
        setError("Invalid URL. Double-check and try again.");
      }

      setResults(data.items || []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-4xl absolute top-50 left-1/2 transform -translate-x-1/2">
      <div className="bg-white dark:bg-gray-800 p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">
          Search or Paste YouTube URL
        </h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search or paste link..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 border px-3 py-2 rounded text-black"
          />

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Search
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        {loading && <p>Loading...</p>}

        <div className="space-y-4">
          {results.map((video) => (
            <div
              key={video.videoId}
              onClick={() => onVideoLoaded(video.videoId)}
              className="flex gap-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded"
            >
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-40 rounded"
              />

              <div>
                <h3 className="font-semibold">{video.title}</h3>
                <p className="text-sm text-gray-500">{video.channelTitle}</p>
                <p className="text-sm text-gray-400 line-clamp-2">{video.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}