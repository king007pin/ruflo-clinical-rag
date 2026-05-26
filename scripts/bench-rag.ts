#!/usr/bin/env tsx
// Microbenchmark for the post-fix RAG hot path.
//
// Measures:
//   - searchByVectors with batch=1 (sequential) and batch=4 (typical query path)
//   - 10 concurrent searchByVectors calls (concurrency stress on pool)
//
// Requires .env.local with DATABASE_URL and (optionally) RIVESTACK_DATABASE_URL.
// Pulls one real embedding from the corpus to use as the query vector.
//
// Run: npx tsx scripts/bench-rag.ts

import { config as loadEnv } from "dotenv";
import path from "path";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function fmt(arr: number[]) {
  return `n=${arr.length} p50=${pct(arr, 50).toFixed(0)}ms p95=${pct(arr, 95).toFixed(0)}ms max=${Math.max(...arr).toFixed(0)}ms`;
}

async function main() {
  console.log("── Mediq RAG hot-path bench ──");

  const dbMod: typeof import("../src/db") = await import("../src/db");
  const ragMod: typeof import("../src/lib/rag") = await import("../src/lib/rag");
  const { poolCorpus } = dbMod;
  const { searchByVectors } = ragMod;

  const client = await poolCorpus.connect();
  let queryEmbedding: number[];
  try {
    const r = await client.query<{ embedding: string }>(
      "SELECT embedding::text AS embedding FROM embeddings WHERE embedding IS NOT NULL LIMIT 1",
    );
    if (!r.rows[0]) {
      console.error("No embeddings in corpus — cannot bench.");
      process.exit(1);
    }
    queryEmbedding = JSON.parse(r.rows[0].embedding);
  } finally {
    client.release();
  }
  console.log(`Loaded reference embedding (dim=${queryEmbedding.length})`);

  // ── 1. Sequential single-embedding (legacy pattern) ──────────────────────
  const seq: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await searchByVectors([queryEmbedding], 10);
    seq.push(performance.now() - t);
  }
  console.log(`Sequential x10  (batch=1):     ${fmt(seq)}`);

  // ── 2. Batched 4 embeddings in one call ──────────────────────────────────
  const batch: number[] = [];
  const batch4 = [queryEmbedding, queryEmbedding, queryEmbedding, queryEmbedding];
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await searchByVectors(batch4, 10);
    batch.push(performance.now() - t);
  }
  console.log(`Batched x10     (batch=4):     ${fmt(batch)}`);

  // ── 3. Concurrency stress: 10 parallel batched calls ─────────────────────
  const t0 = performance.now();
  const conc = await Promise.all(
    Array.from({ length: 10 }, async () => {
      const t = performance.now();
      await searchByVectors(batch4, 10);
      return performance.now() - t;
    }),
  );
  const concTotal = performance.now() - t0;
  console.log(`Concurrent x10  (batch=4 ea):  ${fmt(conc)}`);
  console.log(`  → total wall clock: ${concTotal.toFixed(0)}ms (pool max=5 should keep this under ~5x p50)`);

  await poolCorpus.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Bench failed:", err);
  process.exit(1);
});
