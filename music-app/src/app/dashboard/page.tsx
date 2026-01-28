import { createClient } from '@/app/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signout } from '../login/actions'
import BriCard from './BriCard'
import CreateButton from './CreateButton'

export default async function DashboardPage() {
	const supabase = await createClient()

	// 1. Check if user is logged in
	const { data: { user }, error } = await supabase.auth.getUser()

	// 2. If no user, kick them out
	if (error || !user) {
		redirect('/login')
	}

	const { data: profile } = await supabase
		.from('users')
		.select('name')
		.eq('id', user.id)
		.single()

	if (!profile) {
		redirect('/login')
	}

	// Mock Project Data, will replace with fetched data later
	const projects = [
		{ id: '1', title: 'Jazz Standard Analysis', updatedAt: '2 days ago' },
		{ id: '2', title: 'Symphony No. 5', updatedAt: '1 week ago' },
		{ id: '3', title: 'Pop Song Structure', updatedAt: '3 weeks ago' },
	]

	return (
		<div className="p-8 max-w-7xl mx-auto">
			{/* Header Section */}
			<header className="mb-8 flex justify-between items-end">
				<div>
					<h1 className="text-3xl font-bold text-gray-400">My Projects</h1>
					<p className="text-gray-500 mt-1">Welcome back, {profile.name}</p>
				</div>
			</header>

			{/* Grid Layout */}
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

				{/* The "Create New" Card always comes first */}
				<CreateButton />

				{/* Map through the projects */}
				{projects.map((project) => (
					<BriCard
						key={project.id}
						id={project.id}
						title={project.title}
						updatedAt={project.updatedAt}
					/>
				))}

			</div>
		</div>
	)
}