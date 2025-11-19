// music-app/src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'

const Body = z.object({ email: z.string().email(), password: z.string().min(1) })

export async function POST(req: Request) {
	const json = await req.json()
	const { email, password } = Body.parse(json)
	const cookieStore = await cookies()

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{ cookies: cookieStore } // inline call
	)

	const { data, error } = await supabase.auth.signInWithPassword({ email, password })
	if (error) return NextResponse.json({ error: error.message }, { status: 401 })

	return NextResponse.json({ user: data.user, session: data.session })
}