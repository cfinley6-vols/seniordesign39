import { createClient } from '@/app/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signout } from '../login/actions'

export default async function DashboardPage() {
	const supabase = await createClient()

	// 1. Check if user is logged in
	const { data: { user }, error } = await supabase.auth.getUser()

	// 2. If no user, kick them out
	if (error || !user) {
		redirect('/login')
	}

	return (
		<div className="p-10">
			<h1 className="text-3xl font-bold">Dashboard</h1>
			<p className="mt-4">Welcome back, {user.email}</p>

			<div className="mt-8 p-6 border rounded-lg shadow-sm bg-gray-500">
				<h2 className="font-semibold mb-2">Your Data</h2>
				<pre className="text-xs overflow-auto">
					{JSON.stringify(user, null, 2)}
				</pre>
			</div>

			<form action={signout} className="mt-8">
				<button className="bg-red-500 text-white px-4 py-2 rounded">
					Sign Out
				</button>
			</form>
		</div>
	)
}