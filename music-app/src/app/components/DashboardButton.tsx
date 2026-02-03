// music-app/src/app/components/AuthButton.tsx
import { createClient } from "@/app/lib/supabase/server"
import Link from "next/link"

export default async function DashboardButton() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        return (
            <div className= "flex items-center gap-3">
                <Link href="/dashboard" className="px-4 py-1 font-semibold text-white rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition">
                    Dashboard
                </Link>
            </div>
        )
    }
}