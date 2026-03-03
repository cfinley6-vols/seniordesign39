import { NextResponse } from "next/server";

const API_KEYS = [
  process.env.YOUTUBE_API_KEY_1,
  process.env.YOUTUBE_API_KEY_2,
  process.env.YOUTUBE_API_KEY_3,
  process.env.YOUTUBE_API_KEY_4,
  process.env.YOUTUBE_API_KEY_5,
].filter(Boolean);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  // Pick a random key
  const key = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "9");
    url.searchParams.set("q", query);
    url.searchParams.set("key", key as string);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const ytRes = await fetch(url.toString(), { cache: "no-store" });

    if (!ytRes.ok) {
      const text = await ytRes.text();
      return NextResponse.json({ error: "YouTube API error", details: text }, { status: ytRes.status });
    }

    const data = await ytRes.json();

    const items = data.items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium.url,
      channelTitle: item.snippet.channelTitle,
    }));

    return NextResponse.json({
      items: items.slice(0, 9),
      nextPageToken: data.nextPageToken || null,
      prevPageToken: data.prevPageToken || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}