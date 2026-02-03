// music-app/src/app/components/AdminButton.tsx
import { createClient } from "@/app/lib/supabase/server"
import Link from "next/link"

export default async function AdminButton() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        return (
            <div className= "flex items-center gap-3">
                <Link href="/teacher" className="px-4 py-1 font-semibold text-white rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition">
                    Admin
                </Link>
            </div>
        )
    }
}