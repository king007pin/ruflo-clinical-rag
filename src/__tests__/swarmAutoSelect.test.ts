import { describe, it, expect } from "vitest";

// Unit tests for the auto-select role assignment logic
// Extracted to be testable without HTTP calls

const SWARM_ROLES = [
  "Case Summarizer",
  "Differential Diagnosis",
  "Red Flag / Safety",
  "Evidence Reasoner",
  "Specialist Clinician",
  "Skeptical Debate",
  "Final Synthesis",
];

type PoolEntry = { providerId: string; model: string; latencyMs: number };

function assignSwarmSlots(pool: PoolEntry[]) {
  const sorted = [...pool].sort((a, b) => a.latencyMs - b.latencyMs);
  const selected: Array<{ role: string } & PoolEntry> = [];
  const usedModels = new Set<string>();

  for (const role of SWARM_ROLES) {
    const candidate =
      sorted.find((p) => !usedModels.has(p.model)) ??
      sorted.find((p) => !selected.some((s) => s.providerId === p.providerId)) ??
      sorted[selected.length % sorted.length];

    selected.push({ role, ...candidate });
    usedModels.add(candidate.model);
  }
  return selected;
}

describe("swarm auto-select — slot assignment", () => {
  it("assigns exactly 7 roles", () => {
    const pool: PoolEntry[] = Array.from({ length: 10 }, (_, i) => ({
      providerId: `p${i % 3}`,
      model: `model-${i}`,
      latencyMs: 100 + i * 50,
    }));
    expect(assignSwarmSlots(pool)).toHaveLength(7);
  });

  it("each slot has the correct role name", () => {
    const pool: PoolEntry[] = Array.from({ length: 10 }, (_, i) => ({
      providerId: "p1",
      model: `model-${i}`,
      latencyMs: 100,
    }));
    const slots = assignSwarmSlots(pool);
    expect(slots.map((s) => s.role)).toEqual(SWARM_ROLES);
  });

  it("prefers fastest models (lowest latency first)", () => {
    const pool: PoolEntry[] = [
      { providerId: "p1", model: "slow-model", latencyMs: 5000 },
      { providerId: "p2", model: "fast-model", latencyMs: 100 },
    ];
    const slots = assignSwarmSlots(pool);
    expect(slots[0].model).toBe("fast-model");
  });

  it("works with a single model in pool (all roles assigned)", () => {
    const pool: PoolEntry[] = [{ providerId: "p1", model: "only-model", latencyMs: 200 }];
    const slots = assignSwarmSlots(pool);
    expect(slots).toHaveLength(7);
    slots.forEach((s) => expect(s.model).toBe("only-model"));
  });

  it("distributes across providers when multiple are available", () => {
    const pool: PoolEntry[] = [
      { providerId: "openai", model: "gpt-4o", latencyMs: 300 },
      { providerId: "anthropic", model: "claude-3.5-sonnet", latencyMs: 400 },
      { providerId: "nvidia", model: "llama-70b", latencyMs: 200 },
      { providerId: "groq", model: "mixtral", latencyMs: 150 },
      { providerId: "mistral", model: "mistral-large", latencyMs: 350 },
      { providerId: "together", model: "llama-together", latencyMs: 450 },
      { providerId: "deepseek", model: "deepseek-chat", latencyMs: 500 },
    ];
    const slots = assignSwarmSlots(pool);
    const uniqueModels = new Set(slots.map((s) => s.model));
    expect(uniqueModels.size).toBe(7); // all unique since pool has 7 distinct models
  });
});

describe("health-check — error code classification", () => {
  function classifyError(status: number | null): string {
    if (status === 401 || status === 403) return "auth_error";
    if (status === 404) return "not_found";
    if (status === 410) return "gone";
    if (status === 429) return "rate_limited";
    if (status != null && status >= 500) return "server_error";
    if (status === null) return "timeout";
    return "unknown";
  }

  it.each([
    [401, "auth_error"],
    [403, "auth_error"],
    [404, "not_found"],
    [410, "gone"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
    [null, "timeout"],
  ])("status %s → %s", (status, expected) => {
    expect(classifyError(status as number | null)).toBe(expected);
  });
});
