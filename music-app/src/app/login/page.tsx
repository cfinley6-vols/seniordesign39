import { login, signup } from './actions'

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>
}) {
	// 1. Await the promise to get the actual parameters
	const params = await searchParams

	return (
		<form className="flex flex-col w-64 gap-4 mx-auto mt-20">
			<h1 className="text-2xl font-bold mb-4">Welcome</h1>

			{/* 2. Use the awaited 'params' object */}
			{params.error && (
				<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
					{params.error}
				</div>
			)}

			<input
				name="name"
				placeholder="Full Name"
				required
				className="border p-2 rounded"
			/>
			<input
				name="email"
				placeholder="Email"
				required
				className="border p-2 rounded"
			/>
			<input
				type="password"
				name="password"
				placeholder="Password"
				required
				className="border p-2 rounded"
			/>

			<button
				formAction={login}
				className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
			>
				Sign In
			</button>

			<button
				formAction={signup}
				className="bg-gray-100 text-gray-700 p-2 rounded hover:bg-gray-200"
			>
				Sign Up
			</button>
		</form>
	)
}