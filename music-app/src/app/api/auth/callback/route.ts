// music-app/src/app/api/auth/callback/route.ts
import { NextResponse } from "next/server";

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

	// Store tokens in secure cookies
	const cookieOptions = {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
	};

	const res = NextResponse.redirect("http://127.0.0.1:3000/dashboard");

	res.cookies.set("spotify_access_token", tokens.access_token, {
		...cookieOptions,
		maxAge: 3600, // 1 hour
	});
	res.cookies.set("spotify_refresh_token", tokens.refresh_token, {
		...cookieOptions,
		maxAge: 60 * 60 * 24 * 30, // 30 days
	});

	return res;
}