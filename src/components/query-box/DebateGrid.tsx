"use client";

import React from "react";
import { type AgentReply, MODELS, MODEL_COLORS } from "../query-box";
import { AgentDebateBubble } from "./AgentDebateBubble";

interface DebateGridProps {
  agents: AgentReply[];
  swarmSize?: number;
  phase: "r1" | "r2";
  compact?: boolean;
  isLive?: boolean;
  liveRound2Length?: number;
  debatePhase?: boolean;
  synthesisPhase?: boolean;
}

export function DebateGrid({
  agents,
  swarmSize = 1,
  phase,
  compact = false,
  isLive = false,
  liveRound2Length = 0,
  debatePhase = false,
  synthesisPhase = false,
}: DebateGridProps) {
  if (isLive) {
    const isRound1 = phase === "r1";
    const actualCompact = isRound1 ? (liveRound2Length > 0 || debatePhase || synthesisPhase) : compact;
    
    return (
      <div className={`grid gap-2 ${swarmSize === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {Array.from({ length: swarmSize }, (_, idx) => {
          const agent = agents[idx];
          const meta = agent ? MODELS.find((m) => m.id === agent.model) : null;
          const color = MODEL_COLORS[idx % MODEL_COLORS.length];
          return (
            <AgentDebateBubble
              key={idx}
              agent={agent}
              meta={meta}
              color={color}
              idx={idx}
              phase={phase}
              pending={!agent}
              compact={actualCompact}
            />
          );
        })}
      </div>
    );
  }

  // Result view
  const size = agents.length;
  const gridClasses = size <= 2
    ? "grid-cols-1 sm:grid-cols-2"
    : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-3 ${gridClasses}`}>
      {agents.map((agent, idx) => {
        const meta = MODELS.find((m) => m.id === agent.model);
        const color = MODEL_COLORS[idx % MODEL_COLORS.length];
        return (
          <AgentDebateBubble
            key={idx}
            agent={agent}
            meta={meta}
            color={color}
            idx={idx}
            phase={phase}
            compact={compact}
          />
        );
      })}
    </div>
  );
}
