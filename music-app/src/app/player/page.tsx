"use client";

import { useEffect, useState } from "react";

export default function PlayerPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user data from our /api/me route if logged in
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error("Error fetching Spotify user:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  const handleLogin = () => {
    window.location.href = "/api/auth/login"; // kicks off Spotify login
  };

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <h1 className="text-3xl font-bold">Spotify Player</h1>

      {loading && <p>Loading...</p>}

      {!loading && !user && (
        <button
          onClick={handleLogin}
          className="px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 transition"
        >
          Login with Spotify
        </button>
      )}

      {!loading && user && (
        <div className="flex flex-col items-center gap-3">
          <img
            src={user.images?.[0]?.url || "/default-avatar.png"}
            alt="Profile"
            className="w-24 h-24 rounded-full"
          />
          <p className="text-xl">Hello, {user.display_name}</p>
          <p className="text-gray-600">{user.email}</p>

		  <button
            onClick={handleLogout}
            className="px-6 py-2 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 transition"
          >
			Logout
		  </button>
        </div>
      )}
    </div>
  );
}