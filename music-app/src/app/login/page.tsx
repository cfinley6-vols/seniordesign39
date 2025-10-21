// music-app/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const res = await fetch("/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});

		if (res.ok) router.push("/dashboard");
		else setError((await res.json()).error || "Login failed");
	};

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
			<h1 className="text-3xl font-bold mb-6">Login</h1>
			<form
				onSubmit={handleSubmit}
				className="flex flex-col gap-4 bg-gray-800 p-8 rounded-lg w-80"
			>
				<input
					type="email"
					placeholder="Email"
					className="px-4 py-2 rounded bg-gray-700 text-white"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
				<input
					type="password"
					placeholder="Password"
					className="px-4 py-2 rounded bg-gray-700 text-white"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				{error && <p className="text-red-400 text-sm">{error}</p>}
				<button
					type="submit"
					className="bg-blue-600 hover:bg-blue-700 rounded-lg py-2 font-semibold"
				>
					Log In
				</button>
			</form>
		</div>
	);
}