import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminSupabase } from '@/app/lib/supabase/admin'

export async function POST(req: Request) {
	// derive current user from server session (uses cookies())
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{ cookies: await cookies() }
	)

	const { data: { user } } = await supabase.auth.getUser()
	if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

	// perform deletion with service-role admin client
	const admin = createAdminSupabase()
	const { error } = await admin.auth.admin.deleteUser(user.id)
	if (error) return NextResponse.json({ error: error.message }, { status: 400 })

	await admin.from('profiles').delete().eq('id', user.id)
	return NextResponse.json({ success: true })
}
