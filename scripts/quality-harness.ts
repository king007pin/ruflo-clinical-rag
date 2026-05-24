#!/usr/bin/env tsx
/* eslint-disable no-console */
// Mediq quality harness runner.
// Streams /api/query (SSE) for each vignette, captures TTFT + total + final answer + matches,
// scores via metrics.ts, writes JSON, optionally diffs against a baseline JSON.
//
// Usage:
//   npx tsx scripts/quality-harness.ts --out=src/__tests__/quality/baseline.json
//   npx tsx scripts/quality-harness.ts --out=src/__tests__/quality/current.json --diff=src/__tests__/quality/baseline.json
//
// Env:
//   QH_BASE_URL    default http://localhost:3000
//   QH_TIMEOUT_MS  default 240000 (4 min per vignette)
//   QH_CONCURRENCY default 2 (parallel vignettes — keep low to avoid NIM rate limits)
//   QH_LIMIT       optional integer to cap number of vignettes run

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregate,
  diffAggregates,
  scoreVignette,
  type Expected,
  type RetrievedMatch,
  type RunResult,
} from "../src/__tests__/quality/metrics";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

type Args = { out?: string; diff?: string };

function parseArgs(argv: string[]): Args {
  const out: Record<string, string | boolean> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out as Args;
}

const args = parseArgs(process.argv.slice(2));
const BASE_URL = process.env.QH_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = Number(process.env.QH_TIMEOUT_MS ?? 240_000);
const CONCURRENCY = Number(process.env.QH_CONCURRENCY ?? 2);
const LIMIT = process.env.QH_LIMIT ? Number(process.env.QH_LIMIT) : undefined;

type Vignette = {
  id: string;
  complexity: string;
  question: string;
  patientContext?: string;
  labText?: string;
  expected: Expected;
};

type VignetteRun = RunResult & { error: string | null };

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runVignette(vignette: Vignette): Promise<VignetteRun> {
  const startedAt = Date.now();
  let firstTokenAt: number | null = null;
  let answer = "";
  let matches: RetrievedMatch[] = [];
  let agentCount = 0;
  let round2Run = false;
  let errorMsg: string | null = null;

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: vignette.question,
        patientContext: vignette.patientContext,
        labText: vignette.labText,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      errorMsg = `HTTP ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300);
      return {
        vignetteId: vignette.id,
        error: errorMsg,
        totalMs: Date.now() - startedAt,
        ttftMs: null,
        agentCount: 0,
        round2Run: false,
        answer: "",
        matches: [],
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const payload = safeParse(part.slice(6));
        if (!payload) continue;
        const t = payload.type as string | undefined;
        if (t === "synthesis_token" && firstTokenAt === null) {
          firstTokenAt = Date.now();
        }
        if (t === "agent") {
          agentCount += 1;
          if (payload.round === 2) round2Run = true;
        }
        if (t === "done") {
          answer = (payload.answer as string) ?? "";
          matches = Array.isArray(payload.matches) ? (payload.matches as RetrievedMatch[]) : [];
          if (Array.isArray(payload.agents)) agentCount = (payload.agents as unknown[]).length;
        }
        if (t === "error") {
          errorMsg = (payload.message as string) ?? "stream error";
        }
      }
    }
  } catch (err: unknown) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message ?? String(err);
    errorMsg = name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : message;
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    vignetteId: vignette.id,
    error: errorMsg,
    totalMs: Date.now() - startedAt,
    ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
    agentCount,
    round2Run,
    answer,
    matches,
  };
}

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const outPath = args.out
    ? resolve(REPO_ROOT, args.out)
    : resolve(REPO_ROOT, "src/__tests__/quality/current.json");
  const diffPath = args.diff ? resolve(REPO_ROOT, args.diff) : null;

  const vignettesPath = resolve(REPO_ROOT, "src/__tests__/quality/vignettes.json");
  const all = (JSON.parse(readFileSync(vignettesPath, "utf-8")).vignettes as Vignette[]);
  const vignettes = LIMIT ? all.slice(0, LIMIT) : all;
  console.log(`[harness] Running ${vignettes.length} vignettes against ${BASE_URL} (concurrency=${CONCURRENCY})`);

  const expectedById = Object.fromEntries(all.map((v) => [v.id, v.expected]));

  const runs = await withConcurrency(vignettes, CONCURRENCY, async (v, i) => {
    const t = Date.now();
    const result = await runVignette(v);
    console.log(
      `[harness] ${i + 1}/${vignettes.length} ${v.id} → ${result.totalMs}ms${
        result.ttftMs ? ` (ttft ${result.ttftMs}ms)` : ""
      }${result.error ? ` ERROR: ${result.error}` : ""} (elapsed ${Date.now() - t}ms)`,
    );
    return result;
  });

  const scored = runs
    .filter((r) => !r.error && r.answer.length > 0)
    .map((r) => scoreVignette(r, expectedById[r.vignetteId]));
  const agg = aggregate(scored);

  const errors = runs
    .filter((r) => r.error)
    .map((r) => ({ vignetteId: r.vignetteId, error: r.error, totalMs: r.totalMs }));

  const out = {
    schema: "mediq-quality-harness@1",
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    nRun: runs.length,
    nScored: scored.length,
    nErrors: errors.length,
    errors,
    aggregate: agg,
    perVignette: scored,
    rawAnswers: runs.map((r) => ({
      vignetteId: r.vignetteId,
      answerSnippet: (r.answer ?? "").slice(0, 1200),
      matchCount: r.matches.length,
      ttftMs: r.ttftMs,
      totalMs: r.totalMs,
      error: r.error,
    })),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[harness] Wrote ${outPath}`);
  console.log(`[harness] Aggregate:`, JSON.stringify(agg, null, 2));

  if (diffPath) {
    const baseline = JSON.parse(readFileSync(diffPath, "utf-8"));
    const verdicts = diffAggregates(baseline.aggregate, agg);
    console.log(`\n[harness] Diff vs ${diffPath}:`);
    const rows = verdicts.map((v) => ({
      metric: v.metric,
      baseline: typeof v.baseline === "number" ? Number(v.baseline.toFixed(3)) : v.baseline,
      current: typeof v.current === "number" ? Number(v.current.toFixed(3)) : v.current,
      "delta%": Number(v.deltaPct.toFixed(2)),
      direction: v.direction,
      block: v.exceedsThreshold ? "BLOCK" : "",
    }));
    console.table(rows);
    const blockers = verdicts.filter((v) => v.exceedsThreshold);
    if (blockers.length > 0) {
      console.error(`\n[harness] ❌ ${blockers.length} metric(s) regressed beyond threshold — PR blocked.`);
      process.exit(2);
    } else {
      console.log(`\n[harness] ✅ No regressions beyond threshold.`);
    }
  }
}

main().catch((err) => {
  console.error("[harness] fatal:", err);
  process.exit(1);
});
