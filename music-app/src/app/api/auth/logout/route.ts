import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.redirect("http://127.0.0.1:3000/player");

  // Clear cookies by setting them empty and expired
  res.cookies.set("spotify_access_token", "", { httpOnly: true, expires: new Date(0) });
  res.cookies.set("spotify_refresh_token", "", { httpOnly: true, expires: new Date(0) });

  return res;
}