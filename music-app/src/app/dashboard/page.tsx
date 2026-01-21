// music-app/src/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Project {
	id: string;
	name: string;
	updated_at: string;
}

interface User {
	id: string;
	email: string;
}

export default function AccountDashboard() {
	const [user, setUser] = useState<User | null>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function load() {
			try {
				const res = await fetch("/api/me");
				if (!res.ok) throw new Error("Not logged in");

				const data = await res.json();
				setUser(data);

				const projRes = await fetch("/api/projects");
				if (projRes.ok) {
					setProjects(await projRes.json());
				}
			} catch {
				setUser(null);
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	const createProject = async () => {
		const name = prompt("Enter project name")?.trim() || "Untitled Project";
		const res = await fetch("/api/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name }),
		});
		if (res.ok) {
			const newProj = await res.json();
			setProjects((p) => [...p, newProj]);
		}
	};

	const renameProject = async (id: string) => {
		const proj = projects.find((p) => p.id === id);
		if (!proj) return;
		const newName = prompt("Enter new name", proj.name);
		if (!newName) return;
		const res = await fetch(`/api/projects/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: newName }),
		});
		if (res.ok) {
			const updated = await res.json();
			setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
		}
	};

	const deleteProject = async (id: string) => {
		if (!confirm("Delete project?")) return;
		const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
		if (res.ok) setProjects((prev) => prev.filter((p) => p.id !== id));
	};

	const handleLogout = () => {
		window.location.href = "/api/logout";
	};

	if (loading)
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
				<p>Loading...</p>
			</div>
		);

	if (!user)
		return (
			<div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-gray-900 text-gray-100">
				<h1 className="text-3xl font-bold">Account Dashboard</h1>
				<p className="text-gray-400">Please log in to continue.</p>
				<Link
					href="/login"
					className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
				>
					Login
				</Link>
			</div>
		);

	return (
		<div className="flex flex-col items-center min-h-screen py-10 px-6 bg-gray-900 text-gray-100">
			<div className="flex flex-col items-center mb-8">
				<h1 className="text-2xl font-semibold">{user.email}</h1>
				<button
					onClick={handleLogout}
					className="mt-3 px-5 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
				>
					Logout
				</button>
			</div>

			<div className="w-full max-w-3xl bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-700">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-white">Your Projects</h2>
					<button
						onClick={createProject}
						className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
					>
						+ New Project
					</button>
				</div>

				{projects.length > 0 ? (
					<ul className="divide-y divide-gray-700">
						{projects.map((proj) => (
							<li
								key={proj.id}
								className="flex justify-between items-center py-3"
							>
								<div>
									<Link
										href={`/briform/${proj.id}`}
										className="font-medium text-white hover:underline"
									>
										{proj.name}
									</Link>
									<p className="text-sm text-gray-400">
										Last updated {new Date(proj.updated_at).toLocaleString()}
									</p>
								</div>
								<div className="flex gap-2">
									<button
										onClick={() => renameProject(proj.id)}
										className="px-3 py-1 bg-yellow-500 text-white text-sm rounded-lg hover:bg-yellow-600 transition"
									>
										Rename
									</button>
									<button
										onClick={() => deleteProject(proj.id)}
										className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition"
									>
										Delete
									</button>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-gray-400">
						You don’t have any saved projects yet. Create one to get started!
					</p>
				)}
			</div>
		</div>
	);
}