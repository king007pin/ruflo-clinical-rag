"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ManagerStats = {
  totalQueries: number;
  emergencyCount: number;
  escalationCount: number;
  avgLatencyMs: number;
  complexityBreakdown: Record<string, number>;
  recentEvents: Array<{
    id: number;
    complexity: string;
    isEmergency: boolean;
    escalationTriggered: boolean;
    agentCountSelected: number;
    totalLatencyMs: number | null;
    createdAt: string;
  }>;
  agentHealth: {
    avgAgentsPerQuery: number;
    offTopicBlocked: number;
  };
};

type Feed = {
  id: number;
  name: string;
  enabled: boolean;
  errorCount: number | null;
  lastError: string | null;
};

const COMPLEXITY_STYLE: Record<string, { bg: string; fg: string }> = {
  simple:    { bg: "rgba(74,222,128,0.15)",  fg: "#4ade80" },
  moderate:  { bg: "rgba(129,140,248,0.15)", fg: "#818cf8" },
  complex:   { bg: "rgba(251,191,36,0.15)",  fg: "#fbbf24" },
  emergency: { bg: "rgba(239,68,68,0.15)",   fg: "#f87171" },
};

function complexityStyle(c: string) {
  return COMPLEXITY_STYLE[c] ?? { bg: "rgba(100,116,139,0.15)", fg: "#94a3b8" };
}

function latencyColor(ms: number | null): string {
  if (!ms) return "var(--muted)";
  if (ms < 5000) return "#4ade80";
  if (ms < 12000) return "#fbbf24";
  return "#f87171";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Feed Health Panel ─────────────────────────────────────────────────────────
function FeedHealthPanel() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const brokenFeeds = feeds.filter((f) => (f.errorCount ?? 0) >= 3 || !f.enabled);
  const errorFeeds = feeds.filter((f) => (f.errorCount ?? 0) > 0 && f.enabled);
  const healthyFeeds = feeds.filter((f) => f.enabled && (f.errorCount ?? 0) === 0);

  async function handleRefresh() {
    setRefreshing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/refresh", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        processed?: number;
        results?: Array<{ name: string; ingested: number; error?: string; autoDisabled?: boolean }>;
      };
      if (!res.ok || data.error) {
        setMsg(`Refresh error: ${data.error ?? `HTTP ${res.status}`}`);
      } else {
        const total = (data.results ?? []).reduce((s, r) => s + r.ingested, 0);
        const failed = (data.results ?? []).filter(r => r.error);
        const disabled = (data.results ?? []).filter(r => r.autoDisabled);
        let summary = `Processed ${data.processed ?? 0} feed(s), ingested ${total} article(s).`;
        if (failed.length) summary += ` ${failed.length} feed(s) failed: ${failed.map(f => f.name).join(", ")}.`;
        if (disabled.length) summary += ` ${disabled.length} feed(s) auto-disabled after 3 consecutive errors.`;
        setMsg(summary);
      }
      await loadFeeds();
    } catch (err) {
      setMsg(`Refresh failed: ${(err as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function fixBrokenFeeds() {
    setFixing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/feeds/probe", { method: "POST" });
      const data = (await res.json()) as { cleared: number; disabled: number; healed: number };
      setMsg(`Auto-healed: cleared ${data.cleared} false errors, re-enabled ${data.healed} healthy feeds, disabled ${data.disabled} unreachable feeds.`);
      await loadFeeds();
    } catch { setMsg("Probe failed — try Reset & Reseed from the Feed panel."); }
    finally { setFixing(false); }
  }

  if (loading) return null;

  const allHealthy = brokenFeeds.length === 0 && errorFeeds.length === 0;

  return (
    <div className="rounded-xl border p-4 space-y-3"
      style={{
        borderColor: allHealthy ? "rgba(74,222,128,0.3)" : brokenFeeds.length > 0 ? "rgba(239,68,68,0.4)" : "rgba(251,191,36,0.3)",
        backgroundColor: allHealthy ? "rgba(74,222,128,0.04)" : brokenFeeds.length > 0 ? "rgba(239,68,68,0.04)" : "rgba(251,191,36,0.04)",
      }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: allHealthy ? "#4ade80" : brokenFeeds.length > 0 ? "#f87171" : "#fbbf24" }} />
          <p className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: allHealthy ? "#4ade80" : brokenFeeds.length > 0 ? "#f87171" : "#fbbf24" }}>
            Feed Health Monitor
          </p>
        </div>
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="text-[10px] rounded-full px-2 py-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
          style={{ backgroundColor: "var(--pill)", color: "var(--muted)" }}
        >
          {refreshing && (
            <svg className="animate-spin h-2.5 w-2.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Healthy", value: healthyFeeds.length, color: "#4ade80" },
          { label: "Degraded", value: errorFeeds.length,  color: "#fbbf24" },
          { label: "Broken",  value: brokenFeeds.length,  color: "#f87171" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border py-2"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
            <p className="text-lg font-bold" style={{ color }}>{value}</p>
            <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>{label}</p>
          </div>
        ))}
      </div>

      {!allHealthy && (
        <div className="space-y-1.5">
          {[...new Map([...brokenFeeds, ...errorFeeds].map((f) => [f.id, f])).values()].slice(0, 5).map((f) => (
            <div key={f.id} className="flex items-start gap-2 text-xs"
              style={{ color: "var(--muted)" }}>
              <span style={{ color: (f.errorCount ?? 0) >= 3 ? "#f87171" : "#fbbf24" }}>
                {(f.errorCount ?? 0) >= 3 ? "✕" : "⚠"}
              </span>
              <span className="font-medium truncate" style={{ color: "var(--text)" }}>{f.name}</span>
              {f.lastError && (
                <span className="truncate shrink min-w-0" style={{ color: "var(--muted)" }}>
                  — {f.lastError.slice(0, 60)}
                </span>
              )}
            </div>
          ))}
          {(brokenFeeds.length + errorFeeds.length) > 5 && (
            <p className="text-[10px]" style={{ color: "var(--muted)" }}>
              +{(brokenFeeds.length + errorFeeds.length) - 5} more
            </p>
          )}
        </div>
      )}

      {brokenFeeds.length > 0 && (
        <button onClick={() => void fixBrokenFeeds()} disabled={fixing}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#818cf8,#f472b6)", color: "#0f172a" }}>
          {fixing ? "Healing feeds…" : `Auto-heal ${brokenFeeds.length} broken feed(s)`}
        </button>
      )}

      {allHealthy && feeds.length > 0 && (
        <p className="text-xs" style={{ color: "#4ade80" }}>
          All {healthyFeeds.length} feeds healthy — auto-updates active
        </p>
      )}

      {msg && (
        <p className="rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--card-border)", color: "var(--accent)" }}>{msg}</p>
      )}
    </div>
  );
}

// ── Compact preview (always-visible in collapsed CollapsibleSection) ──────────
export function ManagerPreview() {
  const [stats, setStats] = useState<ManagerStats | null>(null);

  useEffect(() => {
    fetch("/api/admin/manager")
      .then((r) => r.json())
      .then((d) => setStats(d as ManagerStats))
      .catch(() => null);
  }, []);

  const pills = [
    { label: "Queries", value: stats?.totalQueries ?? "—", color: "#818cf8" },
    { label: "Emergencies", value: stats?.emergencyCount ?? "—", color: "#f87171" },
    { label: "Escalations", value: stats?.escalationCount ?? "—", color: "#fbbf24" },
    { label: "Avg latency", value: stats?.avgLatencyMs ? `${Math.round(stats.avgLatencyMs / 1000)}s` : "—", color: "#4ade80" },
  ];

  const recentComplexity = stats?.recentEvents?.[0]?.complexity ?? null;
  const cs = recentComplexity ? complexityStyle(recentComplexity) : null;

  return (
    <div className="flex flex-col items-center gap-3 mt-1 w-full">
      <div className="grid grid-cols-4 gap-2 w-full">
        {pills.map((p) => (
          <div key={p.label} className="flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-center gap-0.5"
            style={{ borderColor: `${p.color}33`, backgroundColor: `${p.color}11` }}>
            <span className="text-sm font-bold leading-tight" style={{ color: p.color }}>{String(p.value)}</span>
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{p.label}</span>
          </div>
        ))}
      </div>
      {cs && recentComplexity && (
        <span className="rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ backgroundColor: cs.bg, color: cs.fg }}>
          Last query: {recentComplexity}
        </span>
      )}
    </div>
  );
}

// ── Main ManagerPanel ─────────────────────────────────────────────────────────
export default function ManagerPanel() {
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/manager");
      const data = (await res.json()) as ManagerStats;
      setStats(data);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { void load(); }, 15_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, load]);

  const complexities = ["simple", "moderate", "complex", "emergency"];

  return (
    <div className="space-y-5">

      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold transition"
            style={{ background: "linear-gradient(90deg,#818cf8,#4ade80)", color: "#0f172a" }}>
            Refresh now
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none"
            style={{ color: "var(--muted)" }}>
            <input type="checkbox" checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-indigo-400" />
            Auto-refresh (15s)
          </label>
        </div>
        {lastUpdated && (
          <span className="text-[10px]" style={{ color: "var(--muted)" }}>
            Updated {timeAgo(lastUpdated.toISOString())}
            {autoRefresh && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full animate-pulse align-middle"
              style={{ backgroundColor: "var(--accent)" }} />}
          </span>
        )}
      </div>

      {loading && !stats && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading manager stats…</p>
      )}

      {stats && (
        <>
          {/* Stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total queries",    value: stats.totalQueries },
              { label: "Avg latency",      value: stats.avgLatencyMs ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : "—" },
              { label: "Emergencies",      value: stats.emergencyCount,  accent: stats.emergencyCount > 0 ? "#f87171" : undefined },
              { label: "Escalations",      value: stats.escalationCount, accent: stats.escalationCount > 0 ? "#fbbf24" : undefined },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-xl border p-3 text-center"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
                <p className="text-2xl font-bold" style={{ color: accent ?? "var(--accent)" }}>{value}</p>
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Complexity breakdown */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              Query complexity routing
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {complexities.map((c) => {
                const count = stats.complexityBreakdown[c] ?? 0;
                const total = stats.totalQueries || 1;
                const pct = Math.round((count / total) * 100);
                const cs = complexityStyle(c);
                const agentMap: Record<string, number> = { simple: 2, moderate: 3, complex: 5, emergency: 10 };
                return (
                  <div key={c} className="rounded-xl border p-3 space-y-1"
                    style={{ borderColor: `${cs.fg}33`, backgroundColor: `${cs.fg}08` }}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase" style={{ color: cs.fg }}>{c}</span>
                      <span className="text-[10px] rounded-full px-1.5 py-0.5"
                        style={{ backgroundColor: cs.bg, color: cs.fg }}>
                        {agentMap[c]}A
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--pill)" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cs.fg }} />
                    </div>
                    <div className="flex justify-between items-end">
                      <p className="text-lg font-bold" style={{ color: cs.fg }}>{count}</p>
                      <p className="text-[10px]" style={{ color: "var(--muted)" }}>{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agent health */}
          <div className="flex flex-wrap gap-4 text-sm rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
            <span style={{ color: "var(--muted)" }}>
              Avg agents/query: <strong style={{ color: "var(--accent)" }}>{stats.agentHealth.avgAgentsPerQuery}</strong>
            </span>
            <span style={{ color: "var(--muted)" }}>
              Off-topic blocked: <strong style={{ color: stats.agentHealth.offTopicBlocked > 0 ? "#fbbf24" : "var(--accent)" }}>
                {stats.agentHealth.offTopicBlocked}
              </strong>
            </span>
          </div>

          {/* Recent events */}
          {stats.recentEvents.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                Recent queries
              </p>
              <div className="space-y-1.5">
                {stats.recentEvents.map((e) => {
                  const cs = complexityStyle(e.complexity);
                  return (
                    <div key={e.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs"
                      style={{
                        borderColor: e.isEmergency ? "rgba(239,68,68,0.4)" : "var(--card-border)",
                        backgroundColor: "var(--card)",
                      }}>
                      <span className="rounded-full px-2 py-0.5 font-bold uppercase shrink-0"
                        style={{ backgroundColor: cs.bg, color: cs.fg }}>
                        {e.complexity}
                      </span>
                      <span style={{ color: "var(--muted)" }}>{e.agentCountSelected} agents</span>
                      <span style={{ color: latencyColor(e.totalLatencyMs) }}>
                        {e.totalLatencyMs ? `${(e.totalLatencyMs / 1000).toFixed(1)}s` : "—"}
                      </span>
                      {e.isEmergency && (
                        <span className="rounded-full px-2 py-0.5 font-bold uppercase"
                          style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                          EMERGENCY
                        </span>
                      )}
                      {e.escalationTriggered && (
                        <span className="rounded-full px-2 py-0.5 font-bold uppercase"
                          style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                          ESCALATE
                        </span>
                      )}
                      <span className="ml-auto shrink-0" style={{ color: "var(--muted)" }}>
                        {timeAgo(e.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.totalQueries === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No queries yet. Ask a clinical question to see manager activity.
            </p>
          )}
        </>
      )}

      {/* Feed health — always visible, manager auto-heals broken feeds */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          Knowledge Feed Health
        </p>
        <FeedHealthPanel />
      </div>

    </div>
  );
}
