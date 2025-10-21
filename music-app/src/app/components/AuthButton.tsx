// music-app/src/app/components/AuthButton.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string;
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, []);

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (loading) return <span className="text-gray-400">...</span>;

  if (!user) {
    return (
      <div className="flex gap-2">
        <Link
          href="/login"
          className="px-4 py-1 font-semibold text-white rounded-full bg-blue-600 hover:bg-blue-700 transition"
        >
          Login
        </Link>
        <Link
          href="/register"
          className="px-4 py-1 font-semibold text-white rounded-full bg-green-600 hover:bg-green-700 transition"
        >
          Register
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/dashboard" className="text-gray-700 font-medium">
        {user.email}
      </Link>
      <button
        onClick={handleLogout}
        className="px-3 py-1 text-sm text-red-600 bg-gray-200 rounded-md hover:bg-gray-300 transition"
      >
        Logout
      </button>
    </div>
  );
}