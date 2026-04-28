// music-app/src/app/page.tsx
export default function Home() {
    return (
        <div className="flex flex-col items-center justify-between bg-white dark:bg-black text-black dark:text-white p-24 h-screen overflow-hidden">
            <h1 className="text-4xl font-bold mb-8 text-center text-[#53A9CF]">Welcome to the Music Education and Listening Tool (MELT)</h1>
			<img src="/logo.png" alt="MELT Logo" className="w-1408 h-768 mb-4" />
        </div>
    )
}