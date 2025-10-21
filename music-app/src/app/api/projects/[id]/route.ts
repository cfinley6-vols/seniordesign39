// music-app/src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getProjectById, updateProjectName, deleteProject } from "@/app/lib/db";
import { cookies } from "next/headers";

async function getUserId() {
  const userCookie = (await cookies()).get("spotify_access_token");
  if (!userCookie) throw new Error("Not authenticated");

  const accessToken = userCookie.value;
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Invalid token");

  const user = await res.json();
  return user.id;
}

// GET /api/projects/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();
    const project = getProjectById(params.id, userId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

// PATCH /api/projects/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();
    const { name } = await req.json();
    const updated = updateProjectName(params.id, userId, name);
    if (!updated) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserId();
    const success = deleteProject(params.id, userId);
    if (!success) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
