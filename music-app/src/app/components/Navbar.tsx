"use client"
import AuthButton from "@/app/components/AuthButton";
import Link from 'next/link';

export default function Navbar() {
	return (
		<nav className="bg-white shadow-md">
			<div className="max-w-7xl mx-auto px-2 py-4 flex items-center justify-between">
				<Link
					href="/"
					className="text-xl font-bold text-[#FF8200] hover:text-orange-700 transition"
					onClick={() => location.assign('/')}
				>
					Music Education App
				</Link>
				<div className="flex items-center space-x-6">
				<AuthButton />
				</div>
			</div>
		</nav>
	)
}