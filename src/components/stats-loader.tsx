"use client";

import { useEffect, useState } from "react";

type Stats = {
  sourceCount: number;
  chunkCount: number;
};

export default function StatsLoader({ initialStats }: { initialStats: Stats }) {
  const [stats, setStats] = useState<Stats>(initialStats);

  useEffect(() => {
    // Re-fetch fresh stats on mount (client-side refresh)
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {
        // Keep initial stats on error
      });
  }, []);

  return (
    <>
      <StatPill label="Sources" value={stats.sourceCount} />
      <StatPill label="Chunks" value={stats.chunkCount} />
      <StatPill label="Specialists" value={10} />
      <StatPill label="Consensus" value="live" />
    </>
  );
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
      style={{
        borderColor: "var(--card-border)",
        backgroundColor: "var(--pill)",
        color: "var(--text)",
      }}
    >
      <span className="font-semibold" style={{ color: "var(--text)" }}>
        {value}
      </span>
      <span className="uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </span>
  );
}