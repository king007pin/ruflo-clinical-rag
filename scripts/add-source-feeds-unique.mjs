#!/usr/bin/env node
/**
 * One-shot migration: add UNIQUE(name) constraint to source_feeds.
 *
 * Audit finding W16 — the Drizzle schema declares `name: text("name").unique()`
 * but the live database was created before that declaration existed, so the
 * constraint is missing. Several routes (e.g. /api/admin/seed and
 * /api/cron/refresh) rely on `onConflictDoNothing({ target: sourceFeeds.name })`
 * working correctly; without the unique index they fall back to in-memory
 * dedupe, which races under concurrent cron triggers.
 *
 * Run: `node scripts/add-source-feeds-unique.mjs` from project root.
 * Reads DATABASE_URL from .env.local / .env.
 *
 * Safety: refuses to add the constraint if duplicate rows exist. You must
 * resolve duplicates manually first (the script prints them and exits non-
 * zero). The constraint add itself is wrapped in a transaction.
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set; cannot run migration");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });

async function main() {
  const dupes = await pool.query(`
    SELECT name, count(*) AS n
    FROM source_feeds
    GROUP BY name
    HAVING count(*) > 1
    ORDER BY n DESC;
  `);

  if (dupes.rows.length > 0) {
    console.error("Cannot add UNIQUE(name): duplicate rows present.");
    for (const r of dupes.rows) console.error(`  ${r.name}  (count=${r.n})`);
    console.error("Resolve duplicates manually, then re-run.");
    process.exit(2);
  }

  // Check if the constraint already exists; idempotent.
  const existing = await pool.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'source_feeds'::regclass
      AND contype  = 'u'
      AND conname  = 'source_feeds_name_unique';
  `);
  if (existing.rows.length > 0) {
    console.log("Constraint already present — nothing to do.");
    return;
  }

  console.log("Adding UNIQUE(name) constraint…");
  await pool.query("BEGIN");
  try {
    await pool.query(`ALTER TABLE source_feeds ADD CONSTRAINT source_feeds_name_unique UNIQUE (name);`);
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
  console.log("Done. /api/admin/seed onConflictDoNothing is now race-safe.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
