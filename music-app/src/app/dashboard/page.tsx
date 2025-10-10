"use client";

import { useEffect, useState } from "react";

interface Project {
	id: string;
	name: string;
	updatedAt: string;
}

export default function AccountDashboard() {
	const [user, setUser] = useState<any>(null);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loadingUser, setLoadingUser] = useState(true);

	// localStorage key
	const getProjectsKey = (userId: string) => `briformer_projects_${userId}`;

	const loadProjects = (userId: string) => {
		const data = localStorage.getItem(getProjectsKey(userId));
		return data ? JSON.parse(data) : [];
	};

	const saveProjects = (userId: string, projects: Project[]) => {
		localStorage.setItem(getProjectsKey(userId), JSON.stringify(projects));
	};

	// Fetch /api/me with retry logic
	const fetchUserData = async () => {
		try {
			let res = await fetch("/api/me");

			// If access token expired, try refreshing
			if (res.status === 401) {
				const refresh = await fetch("/api/auth/refresh");

				if (refresh.ok) {
					// retry /api/me once after successful refresh
					res = await fetch("/api/me");
				} else {
					throw new Error("Refresh failed");
				}
			}

			if (res.ok) {
				const data = await res.json();
				setUser(data);
				setProjects(loadProjects(data.id));
			} else {
				setUser(null);
			}
		} catch (err) {
			console.error("Error fetching user:", err);
			setUser(null);
		} finally {
			setLoadingUser(false);
		}
	};

	useEffect(() => {
		fetchUserData();
	}, []);

	const handleLogin = () => {
		window.location.href = "/api/auth/login";
	};

	const handleLogout = () => {
		window.location.href = "/api/auth/logout";
	};

	const createProject = () => {
		if (!user) return;
		const name = prompt("Enter project name") || "Untitled Project";
		const newProject: Project = {
			id: crypto.randomUUID(),
			name,
			updatedAt: new Date().toISOString(),
		};
		const updated = [...projects, newProject];
		setProjects(updated);
		saveProjects(user.id, updated);
	};

	const renameProject = (id: string) => {
		const project = projects.find((p) => p.id === id);
		if (!project) return;
		const newName = prompt("Enter new project name", project.name);
		if (!newName) return;
		const updated = projects.map((p) =>
			p.id === id ? { ...p, name: newName, updatedAt: new Date().toISOString() } : p
		);
		setProjects(updated);
		saveProjects(user.id, updated);
	};

	const deleteProject = (id: string) => {
		if (!confirm("Are you sure you want to delete this project?")) return;
		const updated = projects.filter((p) => p.id !== id);
		setProjects(updated);
		saveProjects(user.id, updated);
	};

	// UI states
	if (loadingUser) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
				<p className="text-lg">Loading account...</p>
			</div>
		);
	}

	if (!user) {
		return (
			<div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-gray-900 text-gray-100">
				<h1 className="text-3xl font-bold">Account Dashboard</h1>
				<button
					onClick={handleLogin}
					className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 transition"
				>
					Login with Spotify
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center min-h-screen py-10 px-6 bg-gray-900 text-gray-100">
			{/* User Header */}
			<div className="flex flex-col items-center mb-8">
				<img
					src={user.images?.[0]?.url || "/spotify_logo.png"}
					alt="Profile"
					className="w-24 h-24 rounded-full mb-3 border-2 border-gray-700"
				/>
				<h1 className="text-2xl font-semibold">{user.display_name}</h1>
				<p className="text-gray-400 mb-2">{user.email}</p>

				<button
					onClick={handleLogout}
					className="px-5 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition"
				>
					Logout
				</button>
			</div>

			{/* Projects Section */}
			<div className="w-full max-w-3xl bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-700">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-white">Your Briformer Projects</h2>
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
							<li key={proj.id} className="flex justify-between items-center py-3">
								<div>
									<p className="font-medium text-white">{proj.name}</p>
									<p className="text-sm text-gray-400">
										Last updated {new Date(proj.updatedAt).toLocaleString()}
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