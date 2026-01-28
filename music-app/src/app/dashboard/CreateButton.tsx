// music-app/src/app/dashboard/CreateButton.tsx
"use client"

// We will add the Server Action here later
export default function CreateButton() {
    return (
        <button
            onClick={() => alert("Logic coming soon!")}
            className="h-full min-h-[200px] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 hover:scale-105 transition gap-2"
        >
            <span className="text-3xl">+</span>
            <span className="font-medium">New Project</span>
        </button>
    )
}