"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [fullName, setFullName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, full_name: fullName }),
				credentials: "include",
			});
			if (!res.ok) {
				const json = await res.json().catch(() => ({ error: "Registration failed" }));
				throw new Error(json?.error || "Registration failed");
			}
			// optionally read response
			router.push("/dashboard"); // redirect to dashboard after signup
		} catch (err: any) {
			setError(err.message || "An error occurred");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="max-w-md mx-auto mt-20 p-6 bg-[#FF8200] rounded-md shadow">
			<h1 className="text-2xl font-semibold mb-4">Create an account</h1>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<label className="block text-sm font-medium">Full name (optional)</label>
					<input
						value={fullName}
						onChange={(e) => setFullName(e.target.value)}
						className="w-full px-3 py-2 border rounded"
						placeholder="Jane Doe"
					/>
				</div>
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
						minLength={6}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full px-3 py-2 border rounded"
						placeholder="At least 6 characters"
					/>
				</div>

				{error && <div className="text-sm text-red-600">{error}</div>}

				<button
					type="submit"
					disabled={loading}
					className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60"
				>
					{loading ? "Creating..." : "Create account"}
				</button>
			</form>
		</div>
	);
}