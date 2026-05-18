// One-time RAG corpus migration: copies `sources` + `embeddings` from the
// primary DB (DATABASE_URL) to the secondary corpus DB (RIVESTACK_DATABASE_URL).
//
// Prerequisites:
//   - RIVESTACK_DATABASE_URL must be a POOLED endpoint (a direct host with a
//     low per-role connection cap fails under any real load — 53300).
//   - Run from project root with both vars in env / .env.local:
//       node scripts/migrate-corpus-to-rivestack.mjs            (safe: aborts if target non-empty)
//       node scripts/migrate-corpus-to-rivestack.mjs --force     (truncates target corpus first)
//
// Source DB is only READ. Target schema is created idempotently.

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

const SRC = process.env.DATABASE_URL;
const DST = process.env.RIVESTACK_DATABASE_URL;
const FORCE = process.argv.includes("--force");

if (!SRC) throw new Error("DATABASE_URL not set");
if (!DST) throw new Error("RIVESTACK_DATABASE_URL not set — supply the POOLED Rivestack URL");

const src = new Pool({ connectionString: SRC, max: 2, connectionTimeoutMillis: 10_000 });
const dst = new Pool({ connectionString: DST, max: 1, connectionTimeoutMillis: 10_000 });

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;
DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('pdf','youtube','website','text');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS sources (
  id            serial PRIMARY KEY,
  title         text NOT NULL,
  type          source_type NOT NULL,
  url           text,
  description   text,
  url_hash      text,
  content_hash  text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS embeddings (
  id          serial PRIMARY KEY,
  source_id   integer NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chunk       text NOT NULL,
  embedding   vector(1024) NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embeddings_source_id_idx ON embeddings(source_id);
`;

async function main() {
  console.log("Ensuring corpus schema on target…");
  await dst.query(DDL);

  const [{ count: tgtSources }] = (await dst.query("SELECT count(*)::int FROM sources")).rows;
  if (tgtSources > 0 && !FORCE) {
    throw new Error(`Target already has ${tgtSources} sources. Re-run with --force to truncate and reload.`);
  }
  if (tgtSources > 0 && FORCE) {
    console.log(`--force: truncating target corpus (${tgtSources} sources)…`);
    await dst.query("TRUNCATE embeddings, sources RESTART IDENTITY CASCADE");
  }

  // Copy only columns the source DB actually has. The primary `sources`
  // table has drifted from schema.ts and lacks url_hash/content_hash; the
  // target keeps those columns nullable, so they stay NULL after copy.
  const srcSources = (await src.query(
    "SELECT id,title,type,url,description,created_at FROM sources ORDER BY id",
  )).rows;
  console.log(`Copying ${srcSources.length} sources…`);
  for (let i = 0; i < srcSources.length; i += 500) {
    const batch = srcSources.slice(i, i + 500);
    const vals = [];
    const ph = batch
      .map((r, k) => {
        const b = k * 6;
        vals.push(r.id, r.title, r.type, r.url, r.description, r.created_at);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
      })
      .join(",");
    await dst.query(
      `INSERT INTO sources (id,title,type,url,description,created_at) VALUES ${ph}`,
      vals,
    );
  }

  // Primary `embedding` column is jsonb with mixed array lengths: legacy
  // 96-dim rows from an old model are junk (RAG uses 1024-dim). Copy only
  // valid 1024-length vectors; jsonb::text yields a valid pgvector literal.
  const DIM_FILTER = "jsonb_array_length(embedding) = 1024";
  const total = (await src.query(`SELECT count(*)::int c FROM embeddings WHERE ${DIM_FILTER}`)).rows[0].c;
  console.log(`Copying ${total} embeddings (1024-dim only)…`);
  let done = 0;
  const cur = await src.query(
    `SELECT id,source_id,chunk,embedding::text AS embedding,position,created_at FROM embeddings WHERE ${DIM_FILTER} ORDER BY id`,
  );
  for (let i = 0; i < cur.rows.length; i += 300) {
    const batch = cur.rows.slice(i, i + 300);
    const vals = [];
    const ph = batch
      .map((r, k) => {
        const b = k * 6;
        vals.push(r.id, r.source_id, r.chunk, r.embedding, r.position, r.created_at);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4}::vector,$${b + 5},$${b + 6})`;
      })
      .join(",");
    await dst.query(
      `INSERT INTO embeddings (id,source_id,chunk,embedding,position,created_at) VALUES ${ph}`,
      vals,
    );
    done += batch.length;
    if (done % 3000 === 0 || done === cur.rows.length) console.log(`  ${done}/${cur.rows.length}`);
  }

  // Realign serial sequences so future inserts don't collide with copied ids.
  await dst.query("SELECT setval(pg_get_serial_sequence('sources','id'), COALESCE((SELECT max(id) FROM sources),1))");
  await dst.query("SELECT setval(pg_get_serial_sequence('embeddings','id'), COALESCE((SELECT max(id) FROM embeddings),1))");

  // Build HNSW index after full data load — building on complete dataset is
  // ~10x faster than incremental updates during insert, and enables O(log N)
  // ANN cosine search instead of O(N) sequential scan.
  console.log("Building HNSW index on embeddings (this may take a few minutes)…");
  await dst.query(`
    CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx
    ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
  console.log("HNSW index built.");

  const s2 = (await dst.query("SELECT count(*)::int c FROM sources")).rows[0].c;
  const e2 = (await dst.query("SELECT count(*)::int c FROM embeddings")).rows[0].c;
  console.log(`Done. Target now: ${s2} sources, ${e2} embeddings (source had ${srcSources.length}/${total}).`);
  if (s2 !== srcSources.length || e2 !== total) {
    throw new Error("Row count mismatch — investigate before pointing the app at the corpus DB.");
  }
  console.log("Verified. Set RIVESTACK_DATABASE_URL in the app env to activate the split.");
}

main()
  .catch((e) => {
    console.error("MIGRATION FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  });
