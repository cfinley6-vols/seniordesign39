// music-app/src/app/components/BriCard.tsx
"use client"
import Link from "next/link"
import { useTransition } from "react"
import { renameProject, deleteProject } from "@/app/dashboard/actions"

interface ProjectCardProps {
	id: string
	title: string
	updatedAt: string
}

export default function BriCard({ id, title, updatedAt }: ProjectCardProps) {
	const [isPending, startTransition] = useTransition()

	// Date Formatting (Date + Time)
	const formattedDate = new Date(updatedAt).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	})

	// Rename Handler
	const handleRename = (e: React.MouseEvent) => {
		e.preventDefault() // Stop the card from clicking through to the project
		e.stopPropagation()

		const newTitle = window.prompt("Rename Project:", title)
		if (!newTitle || newTitle === title) return

		startTransition(async () => {
			await renameProject(id, newTitle)
		})
	}

	// Delete Handler
	const handleDelete = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()

		const confirmed = window.confirm("Are you sure you want to delete this project?")
		if (!confirmed) return

		startTransition(async () => {
			await deleteProject(id)
		})
	}

	return (
		<Link
			href={`/briform/${id}`}
			className={`
        		group block border rounded-lg overflow-hidden bg-white hover:scale-105 relative transition
        		${isPending ? "opacity-50 pointer-events-none" : "hover:shadow-md"}
      		`}
		>
			{/* Preview Area */}
			<div className="h-40 bg-gray-100 flex items-center justify-center group-hover:bg-gray-50 transition">
				<span className="text-4xl text-gray-300">♫</span>
			</div>

			{/* Metadata Area */}
			<div className="p-4 border-t relative">
				<h3 className="font-semibold text-gray-900 truncate pr-6">{title}</h3>
				<p className="text-xs text-gray-500 mt-1">{formattedDate}</p>

				{/* Action Buttons (Appears on Hover) */}
				<div className="absolute top-4 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">

					{/* Rename Button (Pencil Icon) */}
					<button
						onClick={handleRename}
						className="p-1 hover:bg-blue-100 text-gray-400 hover:text-blue-600 rounded"
						title="Rename"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
					</button>

					{/* Delete Button (Trash Icon) */}
					<button
						onClick={handleDelete}
						className="p-1 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded"
						title="Delete"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
					</button>

				</div>
			</div>
		</Link>
	)
}