import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __mediqCorpusPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

// ── RAG corpus DB (sources + embeddings only) ────────────────────────────────
// Gated split: when RIVESTACK_DATABASE_URL is set the large RAG corpus lives on
// the secondary 2GB DB; otherwise it stays on the primary DB exactly as before
// (zero behaviour change). Rivestack has no connection pooler and a low
// per-role connection cap, so this pool keeps the smallest possible footprint
// per serverless instance (single connection, released as soon as idle).
const corpusUrl = process.env.RIVESTACK_DATABASE_URL;

export const poolCorpus: Pool = corpusUrl
  ? (globalForDb.__mediqCorpusPool ??
      new Pool({
        connectionString: corpusUrl,
        max: 1,
        idleTimeoutMillis: 3_000,
        connectionTimeoutMillis: 5_000,
        allowExitOnIdle: true,
      }))
  : pool;

if (corpusUrl && process.env.NODE_ENV !== "production") {
  globalForDb.__mediqCorpusPool = poolCorpus;
}

export const dbCorpus = corpusUrl ? drizzle(poolCorpus) : db;
