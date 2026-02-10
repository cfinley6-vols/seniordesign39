// music-app/src/app/briform/[id]/page.tsx
import { cookies } from "next/headers";
import { ProjectInterface } from "@/app/components/ProjectInterface";

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

		// Fetch Spotify user info (optional, in case you need userId)
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
		const userId = user.id;

		// Fetch the project from SQLite
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

		// --- Render the client component ---
		return <ProjectInterface project={project} accessToken={accessToken} />;
	} catch (err) {
		return (
			<div className="p-6 text-red-500">
				<h1 className="text-2xl font-bold">Error loading project</h1>
				<p>{(err as Error).message}</p>
			</div>
		);
	}
}