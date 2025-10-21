// music-app/src/app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const code = searchParams.get("code");

	if (!code) {
		return NextResponse.json({ error: "No code provided" }, { status: 400 });
	}

	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
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

	const cookieStore = cookies();
	const sessionUser = (await cookieStore).get("session_user")?.value;

	if (sessionUser) {
		// Get Spotify profile
		const profileRes = await fetch("https://api.spotify.com/v1/me", {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		});
		const spotifyProfile = await profileRes.json();

		linkSpotifyToUser(
			sessionUser,
			spotifyProfile.id,
			tokens.access_token,
			tokens.refresh_token
		);
	}

	const res = NextResponse.redirect("http://127.0.0.1:3000/dashboard");

	// Optional: keep access token for quick testing
	res.cookies.set("spotify_access_token", tokens.access_token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 3600,
	});
	res.cookies.set("spotify_refresh_token", tokens.refresh_token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 30,
	});

	return res;
}