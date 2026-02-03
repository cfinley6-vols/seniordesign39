"use client";

import { useState } from "react";
import YouTubePlayer from "../../components/YouTubePlayer";

export default function TestYouTubePage() {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<any[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);

  async function search() {
    if (!query) return;

    const res = await fetch(`/api/youtube/search?q=${query}`);
    const data = await res.json();
    setVideos(data.items || []);
  }

  return (
    <main style={{ padding: 20, textAlign: "center" }}>
      <h1>YouTube Video Gallery</h1>

      {/* Search bar */}
      <div style={{ margin: "20px 0" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {if (e.key == "Enter")  search(); } }
          placeholder="Search YouTube"
          style={{ padding: 8, width: 300 }}
        />
        <button onClick={search} style={{ marginLeft: 10, padding: "8px 12px" }}>
          Search
        </button>
      </div>

      {/* Persistent Player */}
      {currentVideo && (
        <div style={{ margin: "20px auto" }}>
          <YouTubePlayer videoId={currentVideo} />
        </div>
      )}

      {/* Video Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          marginTop: 30,
        }}
      >
        {videos.map((v) => (
          <div
            key={v.videoId}
            style={{
              cursor: "pointer",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 10,
              textAlign: "center",
            }}
            onClick={() => setCurrentVideo(v.videoId)}
          >
            <img
              src={v.thumbnail}
              alt={v.title}
              style={{ width: "100%", borderRadius: 4 }}
            />
            <h4 style={{ marginTop: 8, fontSize: 14 }}>{v.title}</h4>
          </div>
        ))}
      </div>
    </main>
  );
}
