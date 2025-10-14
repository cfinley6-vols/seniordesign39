"use client";

import { useEffect, useState } from "react";

export default function AuthButton() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  const handleLogout = () => {
    window.location.href = "/api/auth/logout";
  };

  if (loading) return <span className="text-gray-400">...</span>;

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        className="px-4 py-1 font-semibold text-white rounded-full bg-[#1DB954] hover:bg-[#1ed760] transition"
      >
        Login with Spotify
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      {/* Profile Avatar and Name */}
      <div className="flex items-center space-x-2">
        <img
          src={user.images?.[0]?.url || "/spotify_logo.png"}
          alt="Avatar"
          className="w-8 h-8 rounded-full object-cover"
        />
		<a href="/dashboard">
		<span className="hidden sm:inline text-gray-700 font-medium">
          {user.display_name}
        </span>
		</a>
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="px-3 py-1 text-sm text-red-600 bg-gray-200 rounded-md hover:bg-gray-300 transition"
      >
        Logout
      </button>
    </div>
  );
}