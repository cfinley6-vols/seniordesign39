import { NextResponse } from "next/server";

export async function GET() {
	const res = NextResponse.redirect("http://127.0.0.1:3000/");

	// Expire cookies
	const cookieOptions = {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		expires: new Date(0),
	};

	res.cookies.set("spotify_access_token", "", cookieOptions);
	res.cookies.set("spotify_refresh_token", "", cookieOptions);

	return res;
}