// src/app/briform/[id]/page.tsx
import { createClient } from '@/app/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ProjectWorkspace from '../../components/ProjectWorkspace'

interface ProjectPageProps {
	params: Promise<{ id: string }>
}

export default async function ProjectEditorPage({ params }: ProjectPageProps) {
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
		<div className="flex h-screen flex-col">
			{/* Header (Server Rendered - SEO friendly and fast) */}
			

			{/* Client Workspace (Handles State, YouTube, Interactions) */}
			{/* We pass the project data down so the client knows what to render */}
			<ProjectWorkspace
				projectId={project.id}
				initialVideoId={project.video_url || null} // Assuming you might have this column later
			/>
		</div>
	)
}