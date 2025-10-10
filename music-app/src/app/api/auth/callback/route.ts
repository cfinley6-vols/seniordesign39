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

	// Here you’d normally store tokens in a DB or cookies
	const res = NextResponse.redirect("http://127.0.0.1:3000/dashboard");
	res.cookies.set("spotify_access_token", tokens.access_token, { httpOnly: true });
	res.cookies.set("spotify_refresh_token", tokens.refresh_token, { httpOnly: true });

	return res;
}