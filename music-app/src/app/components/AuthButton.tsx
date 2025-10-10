"use client";

import { useEffect, useState, useRef } from "react";

export default function AuthButton() {
	const [user, setUser] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		async function fetchUser() {
			try {
				const res = await fetch("/api/me");
				if (res.ok) {
					const data = await res.json();
					setUser(data);
				}
			} catch (err) {
				console.error("Error fetching user:", err);
			} finally {
				setLoading(false);
			}
		}
		fetchUser();
	}, []);

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		}

		// Use capture phase to catch clicks before React updates
		document.addEventListener("click", handleClickOutside, true);

		return () => {
			document.removeEventListener("click", handleClickOutside, true);
		};
	}, []);

	const handleLogin = () => {
		window.location.href = "/api/auth/login";
	};

	const handleLogout = () => {
		window.location.href = "/api/auth/logout";
	};

	if (loading) return <span className="text-gray-400">...</span>;

	if (!user) {
		return (
			<button
				onClick={handleLogin}
				className="px-4 py-1 font-semibold text-white rounded-full bg-[#1DB954] hover:bg-[#1ed760] transition"
			>
				Login with Spotify
			</button>
		);
	}

	return (
		<div className="relative" ref={containerRef}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center space-x-2 focus:outline-none"
			>
				<img
					src={user.images?.[0]?.url || "/spotify_logo.png"}
					alt="Avatar"
					className="w-8 h-8 rounded-full object-cover"
				/>
				<span className="hidden sm:inline text-gray-700 font-medium">
					{user.display_name}
				</span>
			</button>

			{open && (
				<div className="absolute right-0 mt-2 w-40 bg-white shadow-lg rounded-md border border-gray-200 py-2 z-50">
					<a
						href="/dashboard"
						className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition"
					>
						Dashboard
					</a>
					<button
						onClick={handleLogout}
						className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 transition"
					>
						Logout
					</button>
				</div>
			)}
		</div>
	);
}