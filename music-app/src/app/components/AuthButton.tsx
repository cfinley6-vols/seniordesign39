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
				<Link href="/login" className="px-4 py-1 font-semibold text-white rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition">
					Login / Register
				</Link>
			</div>
		)
	}

	const { data: profile } = await supabase
		.from('users')
		.select('name')
		.eq('id', user.id)
		.single()

	return (
		<div className="flex items-center gap-3">
			<Link
				href="/dashboard"
				className="px-4 py-1 rounded-full bg-[#FF8200] text-white font-semibold hover:bg-[#e67300] transition active:bg-[#d05000] transition"
			>
				{profile ? profile.name : 'Dashboard'}
			</Link>

			{/* 4. Use a Form Action to trigger the Server Action */}
			<form action={signout}>
				<button
					type="submit"
					className="px-4 py-1 font-semibold text-white rounded-full bg-red-500 hover:bg-red-700 active:bg-red-800 transition"
				>
					Logout
				</button>
			</form>
		</div>
	)
}