"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

type CrawlStatus = {
  exists: boolean;
  offset: number;
  lastFetchedAt: string | null;
  lastFetchCount: number;
  errorCount: number;
  lastError: string | null;
};

type BatchResult = {
  ok: boolean;
  ingested: number;
  skipped: number;
  errors: number;
  nextOffset: number;
  totalUrls: number;
  done: boolean;
  progress: string;
  error?: string;
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

// ── StatPearls Deep Crawl Panel ──────────────────────────────────────────────
function StatpearlsCrawl() {
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [crawling, setCrawling] = useState(false);
  const [totalUrls, setTotalUrls] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [sessionIngested, setSessionIngested] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const stopRef = useRef(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/admin/crawl-statpearls");
    const data = (await res.json()) as CrawlStatus;
    setStatus(data);
    setCurrentOffset(data.offset);
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function runBatch(): Promise<BatchResult> {
    const res = await fetch("/api/admin/crawl-statpearls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchSize: 15 }),
    });
    return res.json() as Promise<BatchResult>;
  }

  async function startCrawl() {
    stopRef.current = false;
    setCrawling(true);
    setSessionIngested(0);
    setMsg("Crawling StatPearls…");

    let sessionTotal = 0;
    while (!stopRef.current) {
      const result = await runBatch();
      if (result.error) { setMsg(`Error: ${result.error}`); break; }
      sessionTotal += result.ingested;
      setSessionIngested(sessionTotal);
      setCurrentOffset(result.nextOffset);
      setTotalUrls(result.totalUrls);
      setMsg(`${result.progress} articles processed · ${sessionTotal} ingested this session`);
      if (result.done) {
        setMsg(`Crawl complete — all ${result.totalUrls} StatPearls articles ingested! Auto-refreshes weekly.`);
        break;
      }
    }
    setCrawling(false);
    await loadStatus();
  }

  async function resetCrawl() {
    await fetch("/api/admin/crawl-statpearls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    setCurrentOffset(0);
    setSessionIngested(0);
    setMsg("Crawl progress reset to beginning.");
    await loadStatus();
  }

  const pct = totalUrls > 0 ? Math.round((currentOffset / totalUrls) * 100) : 0;
  const totalIngested = (status?.lastFetchCount ?? 0);

  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 5%, var(--card))" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            StatPearls — Harrison's-equivalent clinical reference
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            3,000+ peer-reviewed disease articles · symptoms · diagnosis · treatment · auto-refreshes weekly
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={{ backgroundColor: "rgba(74,222,128,0.15)", color: "#4ade80" }}
        >
          Free · NCBI
        </span>
      </div>

      {/* Progress bar */}
      {totalUrls > 0 && (
        <div>
          <div className="flex justify-between text-[11px] mb-1" style={{ color: "var(--muted)" }}>
            <span>{currentOffset} / {totalUrls} articles processed</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--pill)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg, #818cf8, #4ade80)" }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted)" }}>
        {totalIngested > 0 && <span>{totalIngested} articles in knowledge base</span>}
        {status?.lastFetchedAt && (
          <span>· last run {new Date(status.lastFetchedAt).toLocaleDateString()}</span>
        )}
        {currentOffset > 0 && !crawling && totalUrls > 0 && currentOffset < totalUrls && (
          <span style={{ color: "var(--accent)" }}>· paused at {currentOffset}</span>
        )}
      </div>

      {msg && (
        <p className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--card-border)", color: "var(--accent)" }}>
          {msg}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!crawling ? (
          <button
            onClick={startCrawl}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition"
            style={{ background: "linear-gradient(90deg,#818cf8,#4ade80)", color: "#0f172a" }}
          >
            {currentOffset > 0 && totalUrls > 0 && currentOffset < totalUrls
              ? `Resume crawl (from ${currentOffset})`
              : "Start crawl"}
          </button>
        ) : (
          <button
            onClick={() => { stopRef.current = true; }}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition"
            style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            Pause
          </button>
        )}
        {currentOffset > 0 && !crawling && (
          <button
            onClick={resetCrawl}
            className="rounded-2xl px-4 py-2 text-sm transition"
            style={{ backgroundColor: "var(--pill)", color: "var(--muted)", border: "1px solid var(--pill-border)" }}
          >
            Reset progress
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main FeedPanel ───────────────────────────────────────────────────────────
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
      setMsg(`Seeded ${data.seeded} feed(s). Click "Refresh now" to start ingesting.`);
      await loadFeeds();
    } catch { setMsg("Seed failed."); }
    finally { setSeeding(false); }
  }

  async function refresh() {
    setRefreshing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cron/refresh");
      const data = (await res.json()) as { processed: number; results: Array<{ ingested: number }> };
      const total = data.results.reduce((s, r) => s + r.ingested, 0);
      setMsg(`Processed ${data.processed} feed(s), ingested ${total} article(s).`);
      await loadFeeds();
    } catch { setMsg("Refresh failed."); }
    finally { setRefreshing(false); }
  }

  async function toggleFeed(id: number, enabled: boolean) {
    await fetch("/api/admin/feeds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    setFeeds((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));
  }

  const indiaFeeds = feeds.filter((f) =>
    f.name.startsWith("India") ||
    f.name.startsWith("PubMed — India") ||
    f.name.startsWith("PubMed — Tuberculosis") ||
    f.name.startsWith("PubMed — Dengue") ||
    f.name.startsWith("PubMed — Diabetes") ||
    f.name.startsWith("PubMed — COVID") ||
    f.name.startsWith("PubMed — ICMR") ||
    f.name.startsWith("WHO SEARO"),
  );
  const globalFeeds = feeds.filter(
    (f) => !indiaFeeds.includes(f) && !f.name.startsWith("StatPearls"),
  );

  return (
    <div className="space-y-5">
      {/* StatPearls deep crawler always shown first */}
      <StatpearlsCrawl />

      <div className="flex flex-wrap items-center gap-3">
        {feeds.length === 0 && !loading && (
          <button
            onClick={seed}
            disabled={seeding}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#818cf8,#f472b6)", color: "#0f172a" }}
          >
            {seeding ? "Seeding…" : "Seed all 35 India-primary feeds"}
          </button>
        )}
        {feeds.length > 0 && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#22c55e,#06b6d4)", color: "#0f172a" }}
          >
            {refreshing ? "Refreshing…" : "Refresh news feeds now"}
          </button>
        )}
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {feeds.length > 0
            ? `${feeds.filter((f) => f.enabled).length}/${feeds.length} feeds active · auto-updates hourly`
            : "No news feeds configured yet"}
        </span>
      </div>

      {msg && (
        <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--card-border)", color: "var(--accent)" }}>
          {msg}
        </p>
      )}
      {loading && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading feeds…</p>}

      {[
        { label: "🇮🇳 India — Primary", list: indiaFeeds },
        { label: "🌐 Global — Secondary", list: globalFeeds },
      ]
        .filter((g) => g.list.length > 0)
        .map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              {group.label}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
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
