"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("mediq-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      document.documentElement.classList.toggle("dark", stored === "dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("mediq-theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
      style={{ borderColor: "var(--card-border)", color: "var(--text)", backgroundColor: "var(--card)" }}
    >
      <span className="text-xl" aria-hidden>
        {theme === "dark" ? "🌙" : "☀️"}
      </span>
      <span>{theme === "dark" ? "Dark" : "Light"} mode</span>
    </button>
  );
}
