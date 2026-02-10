// music-app/src/app/(briform)/components/BriformNavbar.tsx
import { createClient } from "@/app/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import AuthButton from "@/app/components/AuthButton"

interface ProjectPageProps {
	params: Promise<{ id: string }>
}

export default async function BriformNavbar({ params }: ProjectPageProps) {
	// Unwrap the params to get the ID
	const { id } = await params
	const supabase = await createClient()

	// Auth Check (Always protect your routes)
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) {
		redirect('/login')
	}

	// Fetch the specific project
	// We use .single() because we expect exactly one result
	const { data: project, error } = await supabase
		.from('bri_projects')
		.select('*')
		.eq('id', id)
		.single()

	// Handle errors (Project doesn't exist OR User doesn't own it)
	// Because of our RLS policies, if the user doesn't own it, 
	// Supabase returns null/error, effectively hiding it.
	if (error || !project) {
		return notFound() // Shows the Next.js 404 UI
	}

	return (
		<nav className="border-b px-6 py-4 flex sticky top-0 z-50 items-center justify-between bg-white dark:bg-gray-800">
			<div>
				<h1 className="text-xl font-bold text-gray-900 dark:text-white">
					{project.title}
				</h1>
				<span className="text-xs text-gray-400 dark:text-gray-200">
					Last edited: {new Date(project.updated_at).toLocaleDateString()}
				</span>
			</div>
			<AuthButton />
		</nav>
	);
}