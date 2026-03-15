// music-app/src/app/(main)/soundtoscore/[id]/page.tsx
import { createClient } from "@/app/lib/supabase/server"
import { notFound, redirect } from "next/navigation"
import SoundToScore from "@/app/(sts)/components/STS"

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
			<SoundToScore />
		</div>
	);
}