"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				credentials: "include",
			});
			if (!res.ok) {
				const json = await res.json().catch(() => ({ error: "Login failed" }));
				throw new Error(json?.error || "Login failed");
			}
			// on success redirect
			router.push("/dashboard");
		} catch (err: any) {
			setError(err.message || "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-md shadow">
			<h1 className="text-2xl font-semibold mb-4">Login</h1>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Email</label>
					<input
						required
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full px-3 py-2 border rounded"
						placeholder="you@example.com"
					/>
				</div>
				<div>
					<label className="block text-sm font-medium">Password</label>
					<input
						required
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full px-3 py-2 border rounded"
						placeholder="Your password"
					/>
				</div>

				{error && <div className="text-sm text-red-600">{error}</div>}

				<button
					type="submit"
					disabled={loading}
					className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
				>
					{loading ? "Signing in..." : "Sign in"}
				</button>
			</form>
			<div className="mt-4 text-sm">
				Don’t have an account? <a href="/register" className="text-blue-600">Register</a>
			</div>
		</div>
	);
}