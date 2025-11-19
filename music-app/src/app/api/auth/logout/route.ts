import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST() {
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{ cookies: await cookies() }
	)

	const { error } = await supabase.auth.signOut()
	if (error) return NextResponse.json({ error: error.message }, { status: 400 })
	return NextResponse.json({ success: true })
}
