import { NextRequest, NextResponse } from "next/server";
import db from "@/app/lib/db";
import { cookies } from "next/headers";

export async function GET() {
  const userCookie = (await cookies()).get("spotify_access_token");
  if (!userCookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Assume a simple token -> user_id mapping (or fetch /me)
  const accessToken = userCookie.value;

  // Fetch Spotify user ID from /api/me or cache
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const user = await res.json();
  const userId = user.id;

  const projects = db.prepare("SELECT * FROM projects WHERE user_id = ?").all(userId);
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const userCookie = (await cookies()).get("spotify_access_token");
  if (!userCookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const accessToken = userCookie.value;
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const user = await res.json();
  const userId = user.id;

  const body = await req.json();
  const { name } = body;
  const id = crypto.randomUUID();
  const updatedAt = new Date().toISOString();

  db.prepare("INSERT INTO projects (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)")
    .run(id, userId, name, updatedAt);

  return NextResponse.json({ id, name, updated_at: updatedAt });
}