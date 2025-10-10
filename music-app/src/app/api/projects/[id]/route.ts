import { NextRequest, NextResponse } from "next/server";
import db from "@/app/lib/db";
import { cookies } from "next/headers";

// PATCH (rename project)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } } // <-- destructure params here
) {
  const userCookie = (await cookies()).get("spotify_access_token");
  if (!userCookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const accessToken = userCookie.value;

  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const user = await res.json();
  const userId = user.id;
  const projectId = params.id; // ✅ just use params.id directly here

  const body = await req.json();
  const { name } = body;

  const stmt = db.prepare(
    "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  );
  const info = stmt.run(name, new Date().toISOString(), projectId, userId);

  if (info.changes === 0)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const updatedProject = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);

  return NextResponse.json(updatedProject);
}

// DELETE (remove project)
export async function DELETE(req: NextRequest) {
  const userCookie = (await cookies()).get("spotify_access_token");
  if (!userCookie) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const accessToken = userCookie.value;

  // Get Spotify user ID
  const resUser = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resUser.ok) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const user = await resUser.json();
  const userId = user.id;

  // Extract project ID from URL
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const projectId = parts[parts.length - 1]; // last part of URL

  const stmt = db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?");
  const info = stmt.run(projectId, userId);

  if (info.changes === 0)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}