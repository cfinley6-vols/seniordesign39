// music-app/src/app/api/me/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
	const cookieStore = cookies();
	const accessToken = (await cookieStore).get("spotify_access_token")?.value;

	if (!accessToken) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	const response = await fetch("https://api.spotify.com/v1/me", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
	}

	const data = await response.json();
	return NextResponse.json(data);
}