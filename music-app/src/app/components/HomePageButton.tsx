// music-app/src/app/components/HomePageButton.tsx
"use client"
import Link from 'next/link';

export default function HomePageButton() {
    return (
        <div>
            <Link
                href="/"
                className="text-xl font-bold text-[#FF8200] hover:text-[#D67000] active:text-[#B65600] transition"
                onClick={() => location.assign('/')}
            >
                MELT
            </Link>
        </div>
    )
}