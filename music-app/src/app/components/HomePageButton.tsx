"use client"
import Link from 'next/link';

export default function HomePageButton() {
    return (
        <div>
            <Link
                href="/"
                className="text-xl font-bold text-[#FF8200] hover:text-orange-700 transition"
                onClick={() => location.assign('/')}
            >
                Music Education App
            </Link>
        </div>
    )
}