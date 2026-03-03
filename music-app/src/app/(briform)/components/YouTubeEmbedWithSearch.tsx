"use client";

import { useState, useRef } from "react";

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

function extractYouTubeId(input: string): string | null {
  try {
    let urlStr = input;
    if (!/^https?:\/\//i.test(input)) {
      urlStr = "https://" + input;
    }

    const parsed = new URL(urlStr);
    let id: string | null = null;

    if (parsed.hostname.includes("youtu.be")) {
      id = parsed.pathname.slice(1);
    }
    if (!id && parsed.searchParams.get("v")) {
      id = parsed.searchParams.get("v");
    }
    if (!id && parsed.pathname.startsWith("/embed/")) {
      id = parsed.pathname.split("/embed/")[1];
    }
    if (!id) return null;

    const valid = /^[a-zA-Z0-9_-]{11}$/;
    return valid.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default function YouTubeEmbedWithSearch({ onVideoLoaded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageTokens, setPageTokens] = useState<(string | null)[]>([null]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [cache, setCache] = useState<Record<number, Video[]>>({});
  const [tokenCache, setTokenCache] = useState<Record<number, string | null>>({});
  const [slideClass, setSlideClass] = useState("");
  const animating = useRef(false);

  async function prefetchPage(token: string | null, pageNum: number) {
    if (cache[pageNum]) return;
    try {
      const url = token
        ? `/api/youtube/search?q=${encodeURIComponent(query)}&pageToken=${token}`
        : `/api/youtube/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setCache((prev) => ({ ...prev, [pageNum]: (data.items || []).slice(0, 9) }));
        setTokenCache((prev) => ({ ...prev, [pageNum + 1]: data.nextPageToken || null }));
      }
    } catch {
      // silent fail
    }
  }

  async function animateAndFetch(token: string | null, newPage: number, direction: "left" | "right") {
    if (animating.current) return;
    animating.current = true;

    setSlideClass(direction === "right" ? "animate-slide-out-left" : "animate-slide-out-right");
    await new Promise((r) => setTimeout(r, 200));

    await fetchPage(token, newPage);

    setSlideClass(direction === "right" ? "animate-slide-in-right" : "animate-slide-in-left");
    await new Promise((r) => setTimeout(r, 200));
    setSlideClass("");
    animating.current = false;
  }

  async function fetchPage(token: string | null, newPage: number) {
    if (cache[newPage]) {
      setResults(cache[newPage]);
      setPage(newPage);
      setNextToken(tokenCache[newPage + 1] || null);
      if (tokenCache[newPage + 1]) prefetchPage(tokenCache[newPage + 1], newPage + 1);
      return;
    }

    setLoading(true);
    setResults([]);
    setError("");
    try {
      const url = token
        ? `/api/youtube/search?q=${encodeURIComponent(query)}&pageToken=${token}`
        : `/api/youtube/search?q=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }

      const items = (data.items || []).slice(0, 9);
      const nt = data.nextPageToken || null;

      setResults(items);
      setNextToken(nt);
      setPage(newPage);
      setSearched(true);

      setCache((prev) => ({ ...prev, [newPage]: items }));
      setTokenCache((prev) => ({ ...prev, [newPage + 1]: nt }));

      setPageTokens((prev) => {
        const updated = [...prev];
        updated[newPage + 1] = nt;
        return updated;
      });

      if (nt) prefetchPage(nt, newPage + 1);

    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    setError("");
    setResults([]);
    setPage(0);
    setPageTokens([null]);
    setNextToken(null);
    setSearched(false);
    setCache({});
    setTokenCache({});

    if (!query.trim()) {
      setError("Please enter a search term or URL");
      return;
    }

    const idFromUrl = extractYouTubeId(query);
    if (idFromUrl) {
      onVideoLoaded(idFromUrl);
      return;
    }

    await fetchPage(null, 0);
  }

  function handleNewSearch() {
    setSearched(false);
    setResults([]);
    setQuery("");
    setPage(0);
    setPageTokens([null]);
    setNextToken(null);
    setError("");
    setCache({});
    setTokenCache({});
  }

  return (
    <>
      <style>{`
        @keyframes slideOutLeft {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(-60px); opacity: 0; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(60px); opacity: 0; }
        }
        @keyframes slideInRight {
          from { transform: translateX(60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-60px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-out-left { animation: slideOutLeft 0.2s ease forwards; }
        .animate-slide-out-right { animation: slideOutRight 0.2s ease forwards; }
        .animate-slide-in-right { animation: slideInRight 0.2s ease forwards; }
        .animate-slide-in-left { animation: slideInLeft 0.2s ease forwards; }
        .title-clamp {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>

      <div className="w-full max-w-4xl absolute top-50 left-1/2 transform -translate-x-1/2">
        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow">
          <h2 className="text-lg font-semibold mb-4 text-center">
            {searched ? `Results for "${query}"` : "Search or Paste YouTube URL"}
          </h2>

          {!searched && (
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
          )}

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          {loading && <p>Loading...</p>}

          <div className={`grid grid-cols-3 gap-4 ${slideClass}`}>
            {results.map((video) => (
              <div
                key={video.videoId}
                onClick={() => onVideoLoaded(video.videoId)}
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 flex flex-col"
              >
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full aspect-video object-cover"
                />
                <div className="p-2 h-12 overflow-hidden">
                  <p
                    className="font-semibold text-sm title-clamp"
                    title={video.title}
                  >
                    {video.title}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={() => animateAndFetch(null, 0, "left")}
                disabled={page === 0 || loading}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
              >
                Return To Start
              </button>

              <button
                onClick={() => animateAndFetch(pageTokens[page - 1], page - 1, "left")}
                disabled={page === 0 || loading}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
              >
                Prev
              </button>

              <span className="text-sm text-gray-500">Page {page + 1}</span>

              <button
                onClick={() => animateAndFetch(nextToken, page + 1, "right")}
                disabled={!nextToken || loading}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-40 hover:bg-gray-300"
              >
                Next
              </button>

              <button
                onClick={handleNewSearch}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300"
              >
                New Search
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}