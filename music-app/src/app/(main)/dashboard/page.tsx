// music-app/src/app/dashboard/page.tsx
import { createClient } from '@/app/lib/supabase/server'
import { redirect } from 'next/navigation'
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

	// 1. Fetch real projects from Supabase
	// We order by 'updated_at' so the most recent ones appear first
	const { data: projects } = await supabase
		.from('bri_projects')
		.select('id, title, updated_at')
		.order('updated_at', { ascending: false })

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
				<CreateButton />

				{/* 2. Map over the real data */}
				{/* The 'projects' array might be null if the fetch fails, so we add || [] */}
				{(projects || []).map((project) => (
					<BriCard
						key={project.id}
						id={project.id}
						title={project.title}
						updatedAt={project.updated_at}
					/>
				))}
			</div>
		</div>
	)
}