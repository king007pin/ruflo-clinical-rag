"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Login failed");
      }
      router.push(params.get("from") ?? "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl border p-8 shadow-xl"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--card-border)" }}
      >
        <div className="mb-8 text-center">
          <p
            className="text-xs uppercase tracking-[0.28em] mb-2"
            style={{ color: "var(--accent)" }}
          >
            Medical swarm notebook
          </p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
            Ruflo Clinical RAG
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            For licensed clinicians only
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm" style={{ color: "var(--text)" }}>
            Access password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              placeholder="••••••••"
              className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--card-border)",
                backgroundColor: "var(--bg)",
                color: "var(--text)",
              }}
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3 text-sm font-semibold shadow-lg transition disabled:opacity-60"
            style={{
              background: "linear-gradient(90deg, #818cf8, #f472b6)",
              color: "#0f172a",
            }}
          >
            {loading ? "Authenticating…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--muted)" }}>
          Not a substitute for clinical judgment
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
