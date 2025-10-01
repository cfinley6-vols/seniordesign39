import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getUserPlaylists() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;

  const res = await fetch("https://api.spotify.com/v1/me/playlists", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return res.json();
}
