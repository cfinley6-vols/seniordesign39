import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{ cookies: await cookies() }
	)

	const { data: { user }, error } = await supabase.auth.getUser()
	if (error || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
	return NextResponse.json({ id: user.id, email: user.email })
}