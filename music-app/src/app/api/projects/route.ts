// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAllProjectsForUser, createProject } from "@/app/lib/db";

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

// GET all projects
export async function GET() {
  try {
    const userId = await getUserId();
    const projects = getAllProjectsForUser(userId);
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

// POST create project
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const { name } = await req.json();
    const id = crypto.randomUUID();
    const project = createProject(id, userId, name);
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}