import { NextResponse } from "next/server";

export async function GET() {
	// Build Spotify login URL
	const scope = process.env.SPOTIFY_SCOPES!;
	const params = new URLSearchParams({
		response_type: "code",
		client_id: process.env.SPOTIFY_CLIENT_ID!,
		scope,
		redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
		show_dialog: "true", // force account chooser
	});

	const redirectUrl = "https://accounts.spotify.com/authorize?" + params.toString();

	// Create a redirect response (NextResponse.redirect sets Location and status)
	const res = NextResponse.redirect(redirectUrl);

	// Clear old tokens first to allow a new login
	res.cookies.set("spotify_access_token", "", { httpOnly: true, path: "/", expires: new Date(0) });
	res.cookies.set("spotify_refresh_token", "", { httpOnly: true, path: "/", expires: new Date(0) });

	return res;
}
