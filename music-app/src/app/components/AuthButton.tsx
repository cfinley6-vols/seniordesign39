// music-app/src/app/components/AuthButton.tsx
import { createClient } from "@/app/lib/supabase/server"
import Link from "next/link"
import { signout } from "@/app/login/actions"

export default async function AuthButton() {
	const supabase = await createClient()
	const { data: { user } } = await supabase.auth.getUser()

	if (!user) {
		return (
			<div className="flex gap-2">
				<Link href="/login" className="px-4 py-1 font-semibold text-white rounded-full bg-blue-600 hover:bg-blue-700 transition">
					Login
				</Link>
			</div>
		)
	}

	return (
		<div className="flex items-center gap-3">
			<Link href="/dashboard" className="text-gray-700 font-medium hover:underline">
				{user.email}
			</Link>

			{/* 4. Use a Form Action to trigger the Server Action */}
			<form action={signout}>
				<button
					type="submit"
					className="px-3 py-1 text-sm text-red-600 bg-gray-200 rounded-md hover:bg-gray-300 transition"
				>
					Logout
				</button>
			</form>
		</div>
	)
}