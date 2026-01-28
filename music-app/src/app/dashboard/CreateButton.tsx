// music-app/src/app/dashboard/CreateButton.tsx
"use client"
import { useTransition } from "react"
import { createProject } from "./actions" // Import the action we just made

export default function CreateButton() {
    const [isPending, startTransition] = useTransition()

    const handleClick = () => {
        startTransition(async () => {
            const title = window.prompt("Enter a name for your new project:", "New Symphony")

            // If they clicked Cancel, stop.
            if (title === null) return

            startTransition(async () => {
                // 2. Create FormData to send the title
                const formData = new FormData()
                formData.append('title', title)
                await createProject(formData)
            })
        })
    }

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            className={`
                h-full min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition hover:scale-105
                ${isPending
                    ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                    : "border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50"
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
    )
}