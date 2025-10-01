"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

export default function PlayerPage() {
  const { data: session, status } = useSession();
  const [playlists, setPlaylists] = useState<any[]>([]);

  useEffect(() => {
    if (!session) return;

    fetch("/api/spotify/playlists")
      .then((res) => res.json())
      .then((data) => setPlaylists(data.items || []));
  }, [session]);

  if (status === "loading") {
    return <p className="text-white p-4">Loading...</p>;
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 text-white">
        <h1 className="text-3xl font-bold mb-6">Welcome to My Spotify Clone</h1>
        <button
          className="px-6 py-3 bg-green-500 rounded-full hover:bg-green-600 transition"
          onClick={() => signIn("spotify")}
        >
          Sign in with Spotify
        </button>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 min-h-screen text-white p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Spotify Clone</h1>
        <button
          className="px-4 py-2 bg-red-500 rounded hover:bg-red-600"
          onClick={() => signOut()}
        >
          Sign Out
        </button>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-4">Your Playlists</h2>
        {playlists.length === 0 ? (
          <p>No playlists found.</p>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {playlists.map((p) => (
              <li key={p.id} className="p-2 bg-zinc-800 rounded">
                {p.images[0]?.url && (
                  <img
                    src={p.images[0].url}
                    alt={p.name}
                    className="w-full h-32 object-cover rounded mb-2"
                  />
                )}
                <p className="font-semibold">{p.name}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Placeholder Player Controls */}
      <footer className="fixed bottom-0 left-0 w-full p-4 bg-zinc-900 border-t border-zinc-700 flex items-center justify-between">
        <div>
          <p>Now Playing: –</p>
        </div>
        <div className="flex gap-4">
          <button>Prev</button>
          <button>Play/Pause</button>
          <button>Next</button>
        </div>
      </footer>
    </div>
  );
}