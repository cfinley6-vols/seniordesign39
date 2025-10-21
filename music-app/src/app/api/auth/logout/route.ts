// music-app/src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function GET() {
	const res = NextResponse.redirect("http://127.0.0.1:3000/");

	const expired = {
		httpOnly: true,
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
		path: "/",
		expires: new Date(0),
	};

	res.cookies.set("session_user", "", expired);
	res.cookies.set("spotify_access_token", "", expired);
	res.cookies.set("spotify_refresh_token", "", expired);

	return res;
}