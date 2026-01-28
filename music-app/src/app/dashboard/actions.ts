'use server'
import { createClient } from '@/app/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createProject(formData?: FormData) {
    const supabase = await createClient()
    const title = formData?.get('title') as string || 'Untitled Project'

    // 1. Get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        // Should generally be handled by middleware, but good as a backup
        redirect('/login')
    }

    // 2. Insert the new project
    // We use .select() and .single() to immediately get back the ID of the row we just made
    const { data, error } = await supabase
        .from('bri_projects')
        .insert({
            user_id: user.id,
            title: title,
            data: {}, // Start with an empty diagram
        })
        .select()
        .single()

    if (error) {
        // In a real app, you might return this error to the UI
        throw new Error(error.message)
    }

    revalidatePath('/dashboard') // Revalidate the dashboard to show the new project

    // 3. Redirect the user to the new project workspace
    redirect(`/briform/${data.id}`)
}

export async function deleteProject(projectId: string) {
    const supabase = await createClient()

    // RLS policies ensure you can only delete your own
    const { error } = await supabase
        .from('bri_projects')
        .delete()
        .eq('id', projectId)

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard')
}

export async function renameProject(projectId: string, newTitle: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('bri_projects')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', projectId)

    if (error) throw new Error(error.message)

    revalidatePath('/dashboard')
}