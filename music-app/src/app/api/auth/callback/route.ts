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

	// Redirect user to dashboard
	const res = NextResponse.redirect("http://127.0.0.1:3000/dashboard");

	const cookieOptions = {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
	};

	// Store tokens in secure cookies
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