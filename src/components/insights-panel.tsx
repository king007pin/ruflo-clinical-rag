"use client";

import { useCallback, useEffect, useState } from "react";

type Gap = {
  id: number;
  topic: string;
  queryCount: number;
  resolved: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  ingestedCount: number;
};
type Session = {
  id: number;
  query: string;
  matchCount: number;
  maxScore: number;
  hadGap: boolean;
  createdAt: string;
};
type Stats = {
  totalSessions: number;
  totalGaps: number;
  resolvedGaps: number;
  totalFeedback: number;
  recentGaps: Gap[];
  recentSessions: Session[];
};

export default function InsightsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/insights");
    const data = (await res.json()) as Stats;
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runLearn() {
    setRunning(true);
    setMsg(null);
    const res = await fetch("/api/cron/learn");
    const data = (await res.json()) as { processed: number; totalIngested: number; gaps: string[] };
    setMsg(`Processed ${data.processed} gap(s), ingested ${data.totalIngested} article(s).`);
    setRunning(false);
    await load();
  }

  if (loading) return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading insights...</p>;
  if (!stats) return null;

  const gapResolvePct =
    stats.totalGaps > 0 ? Math.round((stats.resolvedGaps / stats.totalGaps) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total sessions", value: stats.totalSessions },
          { label: "Feedback given", value: stats.totalFeedback },
          { label: "Knowledge gaps", value: stats.totalGaps - stats.resolvedGaps },
          { label: "Gaps resolved", value: `${stats.resolvedGaps} (${gapResolvePct}%)` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
          >
            <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
              {value}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Run learning cron manually */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void runLearn()}
          disabled={running}
          className="rounded-2xl px-4 py-2 text-sm font-semibold shadow transition disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#818cf8,#4ade80)", color: "#0f172a" }}
        >
          {running ? "Learning..." : "Run gap-fill now"}
        </button>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Auto-runs daily at 2am UTC. Finds unresolved knowledge gaps, fetches PubMed articles, and ingests them.
        </span>
      </div>

      {msg && (
        <p
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ borderColor: "var(--card-border)", color: "var(--accent)" }}
        >
          {msg}
        </p>
      )}

      {/* Open knowledge gaps */}
      {stats.recentGaps.length > 0 && (
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            Open Knowledge Gaps
          </p>
          <div className="space-y-2">
            {stats.recentGaps.map((gap) => (
              <div
                key={gap.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}
              >
                <span className="font-medium" style={{ color: "var(--text)" }}>
                  {gap.topic}
                </span>
                <div className="flex gap-3 items-center" style={{ color: "var(--muted)" }}>
                  <span>{gap.queryCount}x asked</span>
                  {gap.ingestedCount > 0 && (
                    <span style={{ color: "#4ade80" }}>{gap.ingestedCount} articles added</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {stats.recentSessions.length > 0 && (
        <div>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent)" }}
          >
            Recent Sessions
          </p>
          <div className="space-y-1.5">
            {stats.recentSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between rounded-xl border px-3 py-2 text-xs"
                style={{
                  borderColor: s.hadGap ? "rgba(239,68,68,0.3)" : "var(--card-border)",
                  backgroundColor: "var(--card)",
                }}
              >
                <p className="truncate flex-1 mr-3" style={{ color: "var(--text)" }}>
                  {s.query}
                </p>
                <div className="flex gap-2 shrink-0" style={{ color: "var(--muted)" }}>
                  <span>{s.matchCount} src</span>
                  <span>{(s.maxScore * 100).toFixed(0)}%</span>
                  {s.hadGap && <span style={{ color: "#f87171" }}>gap</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.recentGaps.length === 0 && stats.recentSessions.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No sessions yet. Start asking questions to build learning history.
        </p>
      )}
    </div>
  );
}
