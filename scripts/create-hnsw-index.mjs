import fs from "node:fs";
import pg from "pg";

const { Pool } = pg;

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (!process.env[k]) process.env[k] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

// W12 — pgvector ANN index. Without this, every retrieval query does a sequential
// scan over embeddings.embedding; latency scales linearly with corpus size and
// breaks past ~50k chunks. HNSW = best recall/latency tradeoff for read-heavy RAG.
//
// Operator class must match the distance operator used in queries.
// rag.ts uses `<=>` (cosine distance) → vector_cosine_ops.
//
// HNSW params:
//   m              = 16   (default; max edges per node)
//   ef_construction= 64   (default; build-time accuracy)
// These are fine for corpora up to a few million rows. Tune up only if recall drops.

// Match src/db/index.ts: corpus lives on RIVESTACK_DATABASE_URL when set
// (non-empty), else falls back to primary DATABASE_URL.
const rivestack = process.env.RIVESTACK_DATABASE_URL?.trim();
const dbUrl = rivestack || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL or RIVESTACK_DATABASE_URL must be set in env");
  process.exit(1);
}
console.log(`Target DB: ${rivestack ? "RIVESTACK (corpus)" : "DATABASE_URL (primary)"}`);

const pool = new Pool({ connectionString: dbUrl, max: 1 });

async function main() {
  console.log("Ensuring pgvector extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

  console.log("Creating HNSW index on embeddings.embedding (cosine)...");
  // CONCURRENTLY = no table lock; safe to run against live prod.
  // IF NOT EXISTS = idempotent re-runs.
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS embeddings_embedding_hnsw_cos
    ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  `);

  console.log("Running ANALYZE to refresh planner stats...");
  await pool.query("ANALYZE embeddings;");

  const { rows } = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'embeddings'
      AND indexname = 'embeddings_embedding_hnsw_cos';
  `);
  if (rows.length === 0) {
    console.error("ERROR: index not present after creation.");
    process.exit(1);
  }
  console.log("Index ready:", rows[0].indexdef);
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  })
  .finally(() => pool.end());
