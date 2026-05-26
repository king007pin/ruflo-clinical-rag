import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

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

// DB perf audit follow-up. Adds indexes for seqscan hot paths flagged by EXPLAIN
// across ingest dedup, retention cascade, manager admin stats, similar-cases
// candidate scan, and per-user case lists. Corpus-side embeddings.source_id
// already exists on Rivestack but is missing on primary when corpus colocates.
//
// CONCURRENTLY = no table lock; safe to run live. Cannot run inside a txn, so
// no BEGIN wrappers here. IF NOT EXISTS = idempotent re-runs.

const primaryUrl = process.env.DATABASE_URL;
if (!primaryUrl) {
  console.error("DATABASE_URL must be set in env");
  process.exit(1);
}
const rivestack = process.env.RIVESTACK_DATABASE_URL?.trim();
const corpusUrl = rivestack || primaryUrl;

console.log(`Primary DB: DATABASE_URL`);
console.log(`Corpus DB:  ${rivestack ? "RIVESTACK_DATABASE_URL" : "DATABASE_URL (fallback)"}`);

const PRIMARY_INDEXES = [
  {
    name: "sources_content_hash_idx",
    table: "sources",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS sources_content_hash_idx ON sources(content_hash);`,
  },
  {
    name: "sources_url_hash_idx",
    table: "sources",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS sources_url_hash_idx ON sources(url_hash);`,
  },
  {
    name: "session_feedback_session_id_idx",
    table: "session_feedback",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS session_feedback_session_id_idx ON session_feedback(session_id);`,
  },
  {
    name: "manager_events_session_id_idx",
    table: "manager_events",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS manager_events_session_id_idx ON manager_events(session_id);`,
  },
  {
    name: "manager_events_created_at_idx",
    table: "manager_events",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS manager_events_created_at_idx ON manager_events(created_at DESC);`,
  },
  {
    name: "audit_events_created_at_idx",
    table: "audit_events",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at);`,
  },
  {
    name: "query_sessions_had_gap_created_at_idx",
    table: "query_sessions",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS query_sessions_had_gap_created_at_idx ON query_sessions(had_gap, created_at DESC) WHERE had_gap = false;`,
  },
  {
    name: "case_profiles_created_by_created_at_idx",
    table: "case_profiles",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS case_profiles_created_by_created_at_idx ON case_profiles(created_by, created_at DESC);`,
  },
];

const CORPUS_INDEXES = [
  {
    name: "embeddings_source_id_idx",
    table: "embeddings",
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS embeddings_source_id_idx ON embeddings(source_id);`,
  },
];

async function runIndex(client, idx) {
  const t0 = Date.now();
  try {
    console.log(`Creating ${idx.name}...`);
    await client.query(idx.sql);
    const ms = Date.now() - t0;
    console.log(`  OK ${idx.name} (${ms}ms)`);
    return true;
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`  FAIL ${idx.name} (${ms}ms): ${err.message}`);
    return false;
  }
}

async function analyzeTables(client, tables) {
  for (const table of tables) {
    const t0 = Date.now();
    try {
      console.log(`ANALYZE ${table}...`);
      await client.query(`ANALYZE ${table};`);
      console.log(`  OK ANALYZE ${table} (${Date.now() - t0}ms)`);
    } catch (err) {
      console.error(`  FAIL ANALYZE ${table}: ${err.message}`);
    }
  }
}

async function main() {
  const primary = new Client({ connectionString: primaryUrl });
  await primary.connect();
  try {
    for (const idx of PRIMARY_INDEXES) {
      await runIndex(primary, idx);
    }
    const primaryTables = [...new Set(PRIMARY_INDEXES.map((i) => i.table))];
    await analyzeTables(primary, primaryTables);
  } finally {
    await primary.end();
  }

  const corpus = new Client({ connectionString: corpusUrl });
  await corpus.connect();
  try {
    for (const idx of CORPUS_INDEXES) {
      await runIndex(corpus, idx);
    }
    const corpusTables = [...new Set(CORPUS_INDEXES.map((i) => i.table))];
    await analyzeTables(corpus, corpusTables);
  } finally {
    await corpus.end();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
