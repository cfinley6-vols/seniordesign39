import { NextResponse } from "next/server";
import { createClient } from '@/app/lib/supabase/server'
import { redirect } from "next/navigation";
// Import your database client here (e.g., Prisma, Supabase, Mongoose, etc.)

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
		const { id } = await params;
        const supabase = await createClient();

		// Auth Check (Always protect your routes)
		const { data: { user } } = await supabase.auth.getUser()
		if (!user) {
			redirect('/login')
		}

        const { data: project, error } = await supabase
            .from('bri_projects')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id) // Security: Ensure they own it
            .single() // Expect exactly one project

        if (!project) {
            return NextResponse.json(
                { error: "Project not found" },
                { status: 404 }
            );
        }

        // Return the data as JSON. 
        // We map your DB's 'data' column to the 'regions' key your frontend expects.
        return NextResponse.json({ regions: project.data || [] });

    } catch (error) {
        console.error("Error fetching project:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}