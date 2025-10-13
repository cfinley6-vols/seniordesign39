import { notFound } from "next/navigation";
import { headers } from "next/headers";

interface Project {
	id: string;
	name: string;
	updated_at: string;
}

export default async function BriformProjectPage({
	params,
}: {
	params: { id: string };
}) {
	// Build absolute base URL dynamically (works in dev and prod)
	const host = (await headers()).get("host");
	const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
	const baseUrl = `${protocol}://${host}`;

	// Now your fetch URL is absolute
	const res = await fetch(`${baseUrl}/api/projects/${params.id}`, {
		cache: "no-store",
	});

	if (!res.ok) return notFound();

	const project: Project = await res.json();

	return (
		<div className="p-6 text-gray-100">
			<h1 className="text-3xl font-bold mb-4">{project.name}</h1>
			<p className="text-gray-400">
				Last updated {new Date(project.updated_at).toLocaleString()}
			</p>

			<div className="mt-6">
				{/* TODO: Briform project UI */}
			</div>
		</div>
	);
}