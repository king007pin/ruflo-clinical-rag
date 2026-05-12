"use client";

import { useCallback, useEffect, useState } from "react";

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

export default function ManagerPanel() {
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/manager");
      const data = (await res.json()) as ManagerStats;
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading manager stats…</p>;
  if (!stats) return null;

  const complexities = ["simple", "moderate", "complex", "emergency"];

  return (
    <div className="space-y-5">

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
            return (
              <div key={c} className="rounded-xl border p-3 space-y-1"
                style={{ borderColor: `${cs.fg}33`, backgroundColor: `${cs.fg}08` }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase" style={{ color: cs.fg }}>{c}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--pill)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cs.fg }} />
                </div>
                <p className="text-lg font-bold" style={{ color: cs.fg }}>{count}</p>
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
                  className="flex items-center gap-3 rounded-xl border px-3 py-2 text-xs"
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
                    {new Date(e.createdAt).toLocaleTimeString()}
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
    </div>
  );
}
