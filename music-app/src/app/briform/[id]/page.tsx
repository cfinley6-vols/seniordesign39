// src/app/briform/[id]/page.tsx
import { createClient } from '@/app/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

interface ProjectPageProps {
    params: Promise<{ id: string }>
}

export default async function ProjectEditorPage({ params }: ProjectPageProps) {
    // 1. Unwrap the params to get the ID
    const { id } = await params

    const supabase = await createClient()

    // 2. Auth Check (Always protect your routes)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // 3. Fetch the specific project
    // We use .single() because we expect exactly one result
    const { data: project, error } = await supabase
        .from('bri_projects')
        .select('*')
        .eq('id', id)
        .single()

    // 4. Handle errors (Project doesn't exist OR User doesn't own it)
    // Because of our RLS policies, if the user doesn't own it, 
    // Supabase returns null/error, effectively hiding it.
    if (error || !project) {
        return notFound() // Shows the Next.js 404 UI
    }

    return (
        <div className="flex h-screen flex-col">
            {/* Editor Header */}
            <header className="border-b px-6 py-4 flex items-center justify-between bg-white dark:bg-gray-400">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        {project.title}
                    </h1>
                    <span className="text-xs text-gray-400 dark:text-gray-200">
                        ID: {project.id}
                    </span>
                </div>

                <div className="flex gap-2">
                    <button className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                        Save
                    </button>
                    <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
                        Export
                    </button>
                </div>
            </header>

            {/* The Main Workspace (Where your canvas will go) */}
            <main className="flex-1 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center text-gray-400">
                    <p className="mb-2 text-lg">Briformer Canvas Placeholder</p>
                    <p className="text-sm">Diagram data will render here</p>
                </div>
            </main>
        </div>
    )
}