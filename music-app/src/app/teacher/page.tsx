import Link from "next/link"
import { createClient } from '@/app/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TeacherLanding() {
    const supabase = await createClient()

    // 1. Check if user is logged in
    const { data: { user }, error } = await supabase.auth.getUser()

    // 2. If no user, kick them out
    if (error || !user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen p-24">
            <h1 className="text-4xl font-bold mb-12 text-center">
                Teacher Landing Page
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">

                <Link
                    href="/teacher/youtube_test"
                    className="bg-green-500 hover:bg-blue-500 border rounded-xl p-8 shadow hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                >
                    <h2 className="text-2xl font-semibold mb-2 group-hover:underline">
                        Youtube
                    </h2>
                    <p className="text-gray-600">
                        Access The Youtube API Test Page
                    </p>
                </Link>

                <Link
                    href="/dashboard"
                    className="bg-green-500 hover:bg-blue-500 border rounded-xl p-8 shadow hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                >
                    <h2 className="text-2xl font-semibold mb-2 group-hover:underline">
                        Dashboard
                    </h2>
                    <p className="text-gray-600">
                        Sends You To The Dashboard
                    </p>
                </Link>

                <Link
                    href="/briform"
                    className="bg-green-500 hover:bg-blue-500 border rounded-xl p-8 shadow hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                >
                    <h2 className="text-2xl font-semibold mb-2 group-hover:underline">
                        Briform
                    </h2>
                    <p className="text-gray-600">
                        Sends you to the briform page
                    </p>
                </Link>

            </div>
        </div>
    )
}