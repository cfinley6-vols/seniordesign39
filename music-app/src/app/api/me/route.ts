import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const accessToken = (await cookies()).get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  return NextResponse.json(data);
}