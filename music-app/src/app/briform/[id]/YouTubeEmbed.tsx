// src/app/briform/[id]/YouTubeEmbed.tsx
'use client'

import { useState } from 'react'

function extractYouTubeId(url: string): string | null {
    try {
        const parsed = new URL(url)

        // youtu.be/<id>
        if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.slice(1)
        }

        // youtube.com/watch?v=<id>
        if (parsed.searchParams.get('v')) {
            return parsed.searchParams.get('v')
        }

        // youtube.com/embed/<id>
        if (parsed.pathname.startsWith('/embed/')) {
            return parsed.pathname.split('/embed/')[1]
        }

        return null
    } catch {
        return null
    }
}

export default function YouTubeEmbed() {
    const [url, setUrl] = useState('')
    const [videoId, setVideoId] = useState<string | null>(null)
    const [error, setError] = useState('')

    const handleSubmit = () => {
        const id = extractYouTubeId(url)

        if (!id) {
            setError('Invalid YouTube URL')
            return
        }

        setError('')
        setVideoId(id)
    }

    return (
        <div className="w-full max-w-4xl">
            {!videoId ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded shadow">
                    <h2 className="text-lg font-semibold mb-2">
                        Paste a YouTube URL
                    </h2>

                    <input
                        type="text"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full border px-3 py-2 rounded mb-3 text-black"
                    />

                    {error && (
                        <p className="text-sm text-red-500 mb-2">{error}</p>
                    )}

                    <button
                        onClick={handleSubmit}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        Load Video
                    </button>
                </div>
            ) : (
                <div className="aspect-video w-full">
                    <iframe
                        className="w-full h-full rounded"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            )}
        </div>
    )
}
