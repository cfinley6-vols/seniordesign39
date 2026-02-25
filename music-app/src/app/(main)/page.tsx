// music-app/src/app/page.tsx
export default function Home() {
    return (
        <div className="flex flex-col items-center justify-between bg-white dark:bg-black text-black dark:text-white p-24 h-screen overflow-hidden">
            <h1 className="text-4xl font-bold mb-8">Welcome to the Music Education and Listening Tool (MELT)</h1>
            <p className="text-lg text-center max-w-2xl">
                Explore music theory, practice exercises, and enhance your musical skills with our interactive tools.
            </p>
        </div>
    )
}