import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const token = process.env.SPOTIFY_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "Missing Spotify token" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();

  console.log("Spotify API response:", data); // <--- log it

  return NextResponse.json(data);
}