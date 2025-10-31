// music-app/src/app/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export const createBrowserSupabase = () => {
	createBrowserClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
	)
}