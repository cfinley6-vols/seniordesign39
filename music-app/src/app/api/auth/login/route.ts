import { NextResponse } from "next/server";

export async function GET() {
  const scope = process.env.SPOTIFY_SCOPES!;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    show_dialog: "true", // <-- Force Spotify to show account chooser
  });

  return NextResponse.redirect("https://accounts.spotify.com/authorize?" + params.toString());
}