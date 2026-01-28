// music-app/src/app/components/BriCard.tsx
"use client"
import Link from "next/link"
import { renameProject, deleteProject } from "@/app/dashboard/actions"
import { useState, useRef, useEffect, useTransition } from "react"

interface ProjectCardProps {
	id: string
	title: string
	updatedAt: string
}

export default function BriCard({ id, title, updatedAt }: ProjectCardProps) {
	const [isPending, startTransition] = useTransition()

	// UI States
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isRenaming, setIsRenaming] = useState(false)
	const [showDeleteModal, setShowDeleteModal] = useState(false)

	// Temporary state for the input while typing
	const [currentTitle, setCurrentTitle] = useState(title)
	const inputRef = useRef<HTMLInputElement>(null)

	// Date Formatting (Date + Time)
	const formattedDate = new Date(updatedAt).toLocaleString(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	})

	// Focus on input when Rename starts
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isRenaming])

	const handleRenameSubmit = async () => {
		setIsRenaming(false)
		if (!currentTitle.trim() || currentTitle === title) {
			setCurrentTitle(title) // Reset to original if empty or unchanged
			return
		}

		startTransition(async () => {
			await renameProject(id, currentTitle)
		})
	}

	const handleDeleteClick = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setShowDeleteModal(true) // Trigger the nice modal
	}

	const handleRenameClick = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsRenaming(true) // Trigger the inline input
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') handleRenameSubmit()
		if (e.key === 'Escape') {
			setIsRenaming(false)
			setCurrentTitle(title) // Reset to original on cancel
		}
	}

	const handleDeleteConfirm = () => {
		startTransition(async () => {
			await deleteProject(id)
			setShowDeleteModal(false)
		})
	}

	return (
		<>
			<div className={`group relative flex flex-col border rounded-lg overflow-hidden bg-white transition hover:shadow-md hover:scale-105 ${isPending ? "opacity-50" : ""}`}>

				{/* 1. Main Clickable Area */}
				{/* If renaming, we show a plain div so clicking doesn't take you to the page */}
				{isRenaming ? (
					<div className="h-40 bg-gray-100 flex items-center justify-center">
						<span className="text-4xl text-gray-300">♫</span>
					</div>
				) : (
					<Link href={`/briform/${id}`} className="h-40 bg-gray-100 flex items-center justify-center hover:bg-gray-50 hover:scale-105 transition block">
						<span className="text-4xl text-gray-300">♫</span>
					</Link>
				)}

				{/* 2. Metadata Area */}
				<div className="p-4 border-t relative">

					{/* INLINE RENAME INPUT vs TITLE DISPLAY */}
					{isRenaming ? (
						<input
							ref={inputRef}
							value={currentTitle}
							onChange={(e) => setCurrentTitle(e.target.value)}
							onBlur={handleRenameSubmit}
							onKeyDown={handleKeyDown}
							className="w-full font-semibold text-gray-900 border-b-2 border-blue-500 outline-none px-0 py-0 bg-transparent mb-1"
						/>
					) : (
						<h3
							className="font-semibold text-gray-900 truncate pr-12 cursor-pointer"
							title={title}
							onDoubleClick={() => setIsRenaming(true)}
						>
							{title}
						</h3>
					)}

					<p className="text-xs text-gray-500 mt-1">{formattedDate}</p>

					{/* 3. ACTION BUTTONS (Visible on Hover) */}
					{/* We hide these while renaming to keep the UI clean */}
					{!isRenaming && (
						<div className="absolute top-4 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg p-1">

							{/* Rename Icon */}
							<button
								onClick={handleRenameClick}
								className="p-1 hover:bg-blue-100 text-gray-400 hover:text-blue-600 rounded"
								title="Rename"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
							</button>

							{/* Delete Icon */}
							<button
								onClick={handleDeleteClick}
								className="p-1 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded"
								title="Delete"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
							</button>
						</div>
					)}
				</div>
			</div>

			{/* 4. Custom Delete Modal */}
			{showDeleteModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
					<div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
						<h3 className="text-lg font-bold text-gray-900 mb-2">Delete Project?</h3>
						<p className="text-gray-600 mb-6">
							Are you sure you want to delete <span className="font-semibold">"{title}"</span>? This action cannot be undone.
						</p>

						<div className="flex justify-end gap-3">
							<button
								onClick={() => setShowDeleteModal(false)}
								className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md font-medium"
							>
								Cancel
							</button>
							<button
								onClick={handleDeleteConfirm}
								disabled={isPending}
								className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-md font-medium"
							>
								{isPending ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	)
}