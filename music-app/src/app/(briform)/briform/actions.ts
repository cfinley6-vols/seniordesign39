'use server'
import { createClient } from '@/app/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveProject(projectId: string, payload: {
    video_id?: string;
    title?: string;
    data?: any; // For your future diagram JSON
}) {
    const supabase = await createClient()

    // Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Prepare the update object
    const updateData: any = {
        updated_at: new Date().toISOString(),
    }
    
    // Only update fields that were actually passed
    if (payload.video_id !== undefined) updateData.video_id = payload.video_id
    if (payload.title !== undefined) updateData.title = payload.title
    if (payload.data !== undefined) updateData.data = payload.data

    // Update Supabase
    const { error } = await supabase
        .from('bri_projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('user_id', user.id) // Security: Ensure they own it

    if (error) {
        console.error('Save failed:', error)
        throw new Error('Failed to save project')
    }

    // Refresh data (optional, useful if you display "Last Edited" time)
    revalidatePath(`/briform/${projectId}`)
    
    return { success: true }
}