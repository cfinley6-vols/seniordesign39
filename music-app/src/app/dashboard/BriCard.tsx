// music-app/src/app/components/BriCard.tsx
import Link from "next/link"

interface ProjectCardProps {
	id: string
	title: string
	updatedAt: string
}

export default function BriCard({ id, title, updatedAt }: ProjectCardProps) {
	return (
		<Link
			href={`/briform/${id}`}
			className="group block border rounded-lg overflow-hidden hover:shadow-md hover:scale-105 transition bg-white"
		>
			{/* 1. Visual Preview Area (Placeholder for now) */}
			<div className="h-40 bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition">
				<span className="text-4xl text-gray-300">♫</span>
			</div>

			{/* 2. Metadata Area */}
			<div className="p-4 border-t">
				<h3 className="font-semibold text-gray-900 truncate">{title}</h3>
				<p className="text-xs text-gray-500 mt-1">Edited {updatedAt}</p>
			</div>
		</Link>
	)
}