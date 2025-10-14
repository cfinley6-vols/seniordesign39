import { cookies } from "next/headers";
import { getProjectById } from "@/app/lib/db";

interface Props {
  params: { id: string };
}

export default async function BriformProjectPage({ params }: Props) {
  try {
    // Get the Spotify access token from the cookie
    const cookieStore = cookies();
    const accessToken = (await cookieStore).get("spotify_access_token")?.value;

    if (!accessToken) {
      return (
        <div className="p-6 text-red-500">
          <h1 className="text-2xl font-bold">Not authenticated</h1>
        </div>
      );
    }

    // Fetch the Spotify user info
    const res = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return (
        <div className="p-6 text-red-500">
          <h1 className="text-2xl font-bold">Invalid or expired token</h1>
        </div>
      );
    }

    const user = await res.json();
    const userId = user.id; // This is the Spotify user ID

    // Fetch the project directly from SQLite
    interface Project {
      id: string;
      name: string;
      updated_at?: string;
      [key: string]: any;
    }

    const project = getProjectById(params.id, userId) as Project | null;

    if (!project) {
      return (
        <div className="p-6 text-red-500">
          <h1 className="text-2xl font-bold">404 – Project not found</h1>
        </div>
      );
    }

    return (
      <div className="p-6 text-gray-300">
        <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
        <p className="text-gray-400">Last updated {project.updated_at ? new Date(project.updated_at).toLocaleString() : "Unknown"}</p>

        <div className="mt-6">
          <p>This is the project interface for {project.name}.</p>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div className="p-6 text-red-500">
        <h1 className="text-2xl font-bold">Error loading project</h1>
        <p>{(err as Error).message}</p>
      </div>
    );
  }
}