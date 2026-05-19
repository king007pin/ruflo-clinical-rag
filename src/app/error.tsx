"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="text-center space-y-4 p-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--accent)" }}>Something went wrong</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {error.digest ? `Error ID: ${error.digest}` : error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="rounded-full px-6 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
