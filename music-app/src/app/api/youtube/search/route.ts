import { NextResponse } from "next/server";

// Server-side API route to search YouTube
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 });
  }

  try {
    // Call YouTube Data API using API key
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${process.env.YOUTUBE_API_KEY}`
    );

    if (!ytRes.ok) {
      const text = await ytRes.text();
      return NextResponse.json({ error: "YouTube API error", details: text }, { status: ytRes.status });
    }

    const data = await ytRes.json();

    // Only return necessary info to client
    const items = data.items.map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium.url,
      channelTitle: item.snippet.channelTitle,
    }));

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
