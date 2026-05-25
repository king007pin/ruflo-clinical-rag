"use client";

import React, { useMemo } from "react";
import { type Match } from "../query-box";

interface EvidenceSourcesProps {
  matches: Match[];
}

export function EvidenceSources({ matches }: EvidenceSourcesProps) {
  const topCitation = useMemo(() => matches?.[0], [matches]);

  if (!matches || matches.length === 0) return null;

  return (
    <details>
      <summary className="cursor-pointer text-xs uppercase tracking-wide list-none"
        style={{ color: "var(--muted)" }}>
        Evidence Citations ({matches.length}) ▼
      </summary>
      <div className="mt-2 space-y-2">
        {matches.map((match, idx) => (
          <div key={`${match.sourceId}-${idx}`} className="rounded-lg border p-3"
            style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card)" }}>
            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                <span>#{idx + 1}</span>
                {match.sourceType && <span className="uppercase" style={{ color: "var(--accent)" }}>{match.sourceType}</span>}
                {match.sourceTitle && <span>{match.sourceTitle}</span>}
              </div>
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>score {match.score.toFixed(2)}</span>
            </div>
            <p className="mt-2 max-h-24 overflow-hidden text-[12px]" style={{ color: "var(--muted)" }}>{match.chunk}</p>
            {match.sourceUrl && (
              <a href={match.sourceUrl} className="text-[11px] hover:underline" style={{ color: "var(--accent)" }}
                target="_blank" rel="noreferrer">{match.sourceUrl}</a>
            )}
          </div>
        ))}
        {topCitation && (
          <p className="text-[11px] text-emerald-400">Top evidence from {topCitation.sourceTitle ?? "source"}</p>
        )}
      </div>
    </details>
  );
}
