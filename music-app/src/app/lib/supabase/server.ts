import { cookies } from 'next/headers'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'

export function createServerClient() {
	const cookieStore = cookies()

	return createSupabaseServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				async getAll() {
					return (await cookieStore).getAll()
				},
			},
		}
	)
}
