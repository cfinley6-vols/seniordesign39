// music-app/src/app/(main)/soundtoscore/[id]/page.tsx
import { createClient } from "@/app/lib/supabase/server"
import { notFound, redirect } from "next/navigation"

interface ProjectPageProps {
	params: Promise<{ id: string }>
}

export default async function SoundToScoreProjectPage({ params }: ProjectPageProps) {
	const supabase = await createClient()
	const { id } = await params

	const { data: { user } } = await supabase.auth.getUser()
	if (!user) {
		redirect('/login')
	}
	
	const { data: project, error } = await supabase
		.from('sound_to_score_projects')
		.select('*')
		.eq('id', id)
		.single()

	if (error || !project) {
		return notFound() // Shows the Next.js 404 UI
	}

	return (
		<div className="p-6">
			<h2 className="text-2xl font-bold mb-4">{project.title}</h2>
			<p className="text-gray-600 mb-4">{project.description}</p>
			{/* You can add more project details here */}
			{/* For example, a link to the audio file or the generated score */}
		</div>
	);
}