// music-app/src/app/api/auth/signup/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createAdminSupabase } from '@/app/lib/supabase/admin'

const Body = z.object({
	email: z.string().email(),
	password: z.string().min(6),
	full_name: z.string().optional()
})

export async function POST(req: Request) {
	const json = await req.json()
	const body = Body.parse(json)

	// If you want a normal signup that returns a session cookie for the client, use createServerClient
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{ cookies: await cookies() } // inline here — correct typing
	)

	const { data, error } = await supabase.auth.signUp({
		email: body.email,
		password: body.password
	})
	if (error) return NextResponse.json({ error: error.message }, { status: 400 })

	// optionally create profile using admin client (service role) to bypass RLS
	if (body.full_name && data.user?.id) {
		const admin = createAdminSupabase()
		await admin.from('profiles').insert({
			id: data.user.id,
			email: body.email,
			full_name: body.full_name
		})
	}

	return NextResponse.json({ user: data.user, session: data.session })
}
