"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, string> = { password };
      if (useEmail && email.trim()) {
        payload.email = email.trim();
      }

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: "radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(20, 184, 166, 0.1) 0%, transparent 40%), var(--bg)",
      }}
    >
      {/* Decorative ambient glowing backdrops */}
      <div className="absolute top-1/4 left-1/3 -z-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-[120px] animate-pulse duration-10000" />
      <div className="absolute bottom-1/4 right-1/3 -z-10 h-72 w-72 rounded-full bg-teal-500/10 blur-[120px] animate-pulse duration-7000" />

      <div
        className="w-full max-w-md rounded-3xl border p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-[0_20px_50px_rgba(99,102,241,0.15)] hover:scale-[1.01]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--card) 45%, transparent)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="mb-6 text-center">
          <div className="inline-block relative mb-4">
            <Image
              src="/brain-icon.png"
              alt="Mediq Logo"
              width={64}
              height={64}
              className="h-16 w-16 transition-all duration-500 hover:rotate-6 hover:scale-105"
              style={{ filter: "drop-shadow(0 4px 15px rgba(13,148,136,0.3))" }}
              priority
            />
          </div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1"
            style={{ color: "var(--accent)" }}
          >
            Clinical Swarm Notebook
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "var(--text)", fontFamily: "var(--font-sans, 'Inter', sans-serif)" }}>
            MEDIQ
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Licensed Clinical Portal
          </p>
        </div>

        {/* Tab Selector */}
        <div 
          className="flex p-1 mb-6 rounded-xl border transition-all duration-300"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.05)", borderColor: "var(--card-border)" }}
        >
          <button
            type="button"
            onClick={() => {
              setUseEmail(true);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold tracking-wide transition-all duration-300 ${
              useEmail
                ? "shadow-sm text-[color:var(--text)] bg-[color:var(--card)]"
                : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
            }`}
          >
            Clinician Login
          </button>
          <button
            type="button"
            onClick={() => {
              setUseEmail(false);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold tracking-wide transition-all duration-300 ${
              !useEmail
                ? "shadow-sm text-[color:var(--text)] bg-[color:var(--card)]"
                : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
            }`}
          >
            Legacy Bypass
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email Address with slide/fade container */}
          <div 
            className={`transition-all duration-500 ease-in-out ${
              useEmail 
                ? 'max-h-28 opacity-100 translate-y-0 scale-100 mb-4' 
                : 'max-h-0 opacity-0 -translate-y-4 scale-95 pointer-events-none mb-0'
            } overflow-hidden`}
          >
            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text)" }}>
              Clinical Email Address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required={useEmail}
                placeholder="name@mediq.ai"
                className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{
                  borderColor: "var(--card-border)",
                  backgroundColor: "rgba(0, 0, 0, 0.05)",
                  color: "var(--text)",
                }}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text)" }}>
              {useEmail ? "Clinician Password" : "Bypass Secret"}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{
                  borderColor: "var(--card-border)",
                  backgroundColor: "rgba(0, 0, 0, 0.05)",
                  color: "var(--text)",
                }}
              />
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-400 font-medium leading-relaxed">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full relative overflow-hidden rounded-2xl py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-300 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
            style={{
              background: "linear-gradient(135deg, #6366f1, #14b8a6)",
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Verifying Credentials...
              </span>
            ) : (
              "Enter Swarm Ecosystem"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          CONFIDENTIAL · DISCRETION ADVISED
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
