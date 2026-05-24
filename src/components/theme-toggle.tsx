"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "mediq-theme";
const THEME_CHANGE_EVENT = "mediq-theme-change";

function subscribe(cb: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function applyTheme(next: Theme): void {
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.classList.toggle("dark", next === "dark");
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export default function ThemeToggle() {
  // W50 — useSyncExternalStore replaces the previous useEffect+setState pair
  // that tripped React 19's react-hooks/set-state-in-effect rule. The store is
  // localStorage; the event channel is a synthetic CustomEvent so other tabs
  // (via `storage`) and same-tab toggles both notify subscribers.
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
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
