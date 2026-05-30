"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      } else {
        console.error("Logout failed");
      }
    } catch (err) {
      console.error("Error logging out", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm hover:bg-red-500/5 dark:hover:bg-red-500/10 hover:border-red-500/30 transition-all active:scale-[0.98] disabled:opacity-60"
      style={{
        borderColor: "var(--card-border)",
        color: "var(--text)",
        backgroundColor: "var(--card)",
      }}
    >
      <span className="text-base" aria-hidden>
        {loading ? "⌛" : "🚪"}
      </span>
      <span>{loading ? "Signing out..." : "Sign out"}</span>
    </button>
  );
}
