// music-app/src/app/dashboard/CreateButton.tsx
"use client"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useState, useRef, useEffect, useTransition } from "react"
import { createProject } from "./actions" // Import the action we just made

export default function CreateButton() {
    const [isPending, startTransition] = useTransition()
    const [showCreateModal, setShowCreateModal] = useState(false)
	const [showProjectTypeModal, setShowProjectTypeModal] = useState(false)
    const [newTitle, setNewTitle] = useState("")
    // For focusing on the input when the modal opens
    const inputRef = useRef<HTMLInputElement>(null)

	// Need additional question of whether or not user is creating sound to score project or briform project
	const [projectType, setProjectType] = useState<"briform" | "soundtoscore" | null>(null)

	// Navigation hook initialization
	const searchParams = useSearchParams()
	const router = useRouter()
	const pathname = usePathname()

	useEffect(() => {
		if (searchParams.get("trigger") === "create") {
			setNewTitle("New Project")
			setShowCreateModal(true)

			router.replace(pathname, { scroll: false } )
		}
	})

    useEffect(() => {
        if (showCreateModal && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [showCreateModal])

	useEffect(() => {
        if (showProjectTypeModal && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [showProjectTypeModal])

    const handleOpenModal = () => {
        setNewTitle("New Project")
        setShowProjectTypeModal(true)
    }

	// Prompt the user to choose project type when they click "Create New Project"
	const handleProjectTypeSelect = (type: "briform" | "soundtoscore") => {
		setProjectType(type)
		setShowProjectTypeModal(false)
		setShowCreateModal(true)
	}

    const handleSubmit = async () => {
        if (!newTitle.trim()) return

        setShowCreateModal(false)

        startTransition(async () => {
            // Create FormData to send the title and project type to the server action
            const formData = new FormData()
            formData.append('title', newTitle)
            formData.append('projectType', projectType as string)
            await createProject(formData)
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSubmit()
        if (e.key === 'Escape') setShowCreateModal(false)
    }

    return (
        <>
            {/* 1. The Main Trigger Button */}
            <button
                onClick={handleOpenModal}
                disabled={isPending}
                className={`
                    h-full min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition hover:scale-105
                    ${isPending
                        ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                        : "border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-400 hover:bg-gray-100 cursor-pointer"
                    }
                `}
            >
                {isPending ? (
                    // Simple loading spinner text
                    <span className="font-medium animate-pulse">Creating...</span>
                ) : (
                    <>
                        <span className="text-3xl">+</span>
                        <span className="font-medium">New Project</span>
                    </>
                )}
            </button>

			{/* 2. Display user prompt for project type selection */}
			{showProjectTypeModal && (
				<div 
					className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
					onClick={() => setShowProjectTypeModal(false)}
				>
					<div
						className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="text-lg font-bold text-gray-900 mb-4">Select Project Type</h3>

						<div className="flex flex-col gap-4">
							<button
								onClick={() => handleProjectTypeSelect("briform")}
								className="w-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-medium"
							>
								Briform Diagram
							</button>
							<button
								onClick={() => handleProjectTypeSelect("soundtoscore")}
								className="w-full px-4 py-2 bg-green-500 text-white hover:bg-green-700 rounded-md font-medium"
							>
								Sound to Score
							</button>
						</div>
					</div>
				</div>
			)}

            {/* 3. The Custom "Create" Modal */}
            {showCreateModal && projectType && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowCreateModal(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Name your project</h3>

                        <input
                            ref={inputRef}
                            type="text"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full border rounded-md px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                            placeholder="e.g. New Project"
                        />

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!newTitle.trim()}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Create Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}