"use client";

import { useCallback, useEffect, useState } from "react";

type Feed = {
  id: number;
  name: string;
  type: string;
  intervalHours: number;
  lastFetchedAt: string | null;
  lastFetchCount: number | null;
  errorCount: number | null;
  lastError: string | null;
  enabled: boolean;
};

function nextFetchIn(feed: Feed): string {
  if (!feed.lastFetchedAt) return "pending";
  const next = new Date(feed.lastFetchedAt).getTime() + feed.intervalHours * 3_600_000;
  const diff = next - Date.now();
  if (diff <= 0) return "due now";
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function intervalLabel(h: number): string {
  if (h < 2) return "1h";
  if (h < 24) return `${h}h`;
  if (h === 24) return "daily";
  if (h === 168) return "weekly";
  return `${h}h`;
}

export default function FeedPanel() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feeds");
      const data = (await res.json()) as { feeds: Feed[] };
      setFeeds(data.feeds ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFeeds(); }, [loadFeeds]);

  async function seed() {
    setSeeding(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const data = (await res.json()) as { seeded: number };
      setMsg(`Seeded ${data.seeded} feed(s). Trigger refresh to start ingesting.`);
      await loadFeeds();
    } catch {
      setMsg("Seed failed.");
    } finally {
      setSeeding(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cron/refresh?secret=${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`);
      const data = (await res.json()) as { processed: number; results: Array<{ name: string; ingested: number; error?: string }> };
      const total = data.results.reduce((s, r) => s + r.ingested, 0);
      setMsg(`Processed ${data.processed} feed(s), ingested ${total} article(s).`);
      await loadFeeds();
    } catch {
      setMsg("Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleFeed(id: number, enabled: boolean) {
    await fetch("/api/admin/feeds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
  }

  const indiaFeeds = feeds.filter((f) => f.name.startsWith("India") || f.name.startsWith("PubMed — India") || f.name.startsWith("PubMed — Tuberculosis") || f.name.startsWith("PubMed — Dengue") || f.name.startsWith("PubMed — Diabetes") || f.name.startsWith("PubMed — COVID") || f.name.startsWith("PubMed — ICMR") || f.name.startsWith("WHO SEARO"));
  const globalFeeds = feeds.filter((f) => !indiaFeeds.includes(f));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {feeds.length === 0 && !loading && (
          <button
            onClick={seed}
            disabled={seeding}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#818cf8,#f472b6)", color: "#0f172a" }}
          >
            {seeding ? "Seeding…" : "Seed medical feeds"}
          </button>
        )}
        {feeds.length > 0 && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#22c55e,#06b6d4)", color: "#0f172a" }}
          >
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        )}
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {feeds.length > 0 ? `${feeds.filter((f) => f.enabled).length}/${feeds.length} feeds active · auto-updates hourly` : "No feeds configured yet"}
        </span>
      </div>

      {msg && (
        <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--card-border)", color: "var(--accent)" }}>
          {msg}
        </p>
      )}

      {loading && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading feeds…</p>
      )}

      {[{ label: "🇮🇳 India — Primary", list: indiaFeeds }, { label: "🌐 Global — Secondary", list: globalFeeds }]
        .filter((g) => g.list.length > 0)
        .map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              {group.label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.list.map((feed) => (
                <div
                  key={feed.id}
                  className="flex items-start justify-between gap-3 rounded-xl border p-3 text-xs"
                  style={{
                    borderColor: feed.errorCount && feed.errorCount > 0 ? "rgba(239,68,68,0.4)" : "var(--card-border)",
                    backgroundColor: "var(--card)",
                    opacity: feed.enabled ? 1 : 0.5,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: "var(--text)" }}>{feed.name}</p>
                    <p className="mt-0.5" style={{ color: "var(--muted)" }}>
                      <span className="uppercase">{feed.type}</span>
                      {" · "}every {intervalLabel(feed.intervalHours)}
                      {" · "}next: {nextFetchIn(feed)}
                      {feed.lastFetchCount != null && feed.lastFetchCount > 0 && (
                        <> · {feed.lastFetchCount} ingested</>
                      )}
                    </p>
                    {feed.lastError && (
                      <p className="mt-0.5 truncate text-red-400">{feed.lastError}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleFeed(feed.id, !feed.enabled)}
                    className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition"
                    style={{
                      backgroundColor: feed.enabled ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)",
                      color: feed.enabled ? "#4ade80" : "var(--muted)",
                    }}
                  >
                    {feed.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
