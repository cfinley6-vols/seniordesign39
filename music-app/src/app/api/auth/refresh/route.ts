// music-app/src/app/api/auth/refresh/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
	const cookieStore = cookies();
	const refreshToken = (await cookieStore).get("spotify_refresh_token")?.value;

	if (!refreshToken) {
		return NextResponse.json({ error: "No refresh token" }, { status: 400 });
	}

	const body = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: process.env.SPOTIFY_CLIENT_ID!,
		client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
	});

	const response = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	const tokens = await response.json();

	if (tokens.error) {
		return NextResponse.json(tokens, { status: 400 });
	}

	const res = NextResponse.json({ access_token: tokens.access_token });

	// Update the access token cookie
	res.cookies.set("spotify_access_token", tokens.access_token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 3600, // 1 hour
	});

	return res;
}