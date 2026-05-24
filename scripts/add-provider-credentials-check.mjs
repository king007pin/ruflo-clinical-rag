#!/usr/bin/env node
/**
 * W45 — Add Postgres CHECK constraint to `provider_credentials.encrypted_data`.
 *
 * The column is `text` holding a JSON envelope `{iv, authTag, data}` produced
 * by `src/lib/secretVault.ts`. Without a constraint, malformed rows fail only
 * at decrypt time. Constraint validates the JSON shape at write time.
 *
 * Idempotent: drops the constraint first if it already exists, then adds it.
 * Run once after deploy. Re-runs are safe.
 */
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
      if (!process.env[k]) {
        process.env[k] = rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not set in env");
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl, max: 1 });

const CHECK_NAME = "provider_credentials_envelope_check";
const CHECK_SQL = `
  ALTER TABLE provider_credentials
  ADD CONSTRAINT ${CHECK_NAME}
  CHECK (
    (encrypted_data::jsonb ? 'iv') AND
    (encrypted_data::jsonb ? 'authTag') AND
    (encrypted_data::jsonb ? 'data') AND
    jsonb_typeof((encrypted_data::jsonb)->'iv') = 'string' AND
    jsonb_typeof((encrypted_data::jsonb)->'authTag') = 'string' AND
    jsonb_typeof((encrypted_data::jsonb)->'data') = 'string'
  );
`;

async function main() {
  console.log(`Dropping existing ${CHECK_NAME} (if present)...`);
  await pool.query(`ALTER TABLE provider_credentials DROP CONSTRAINT IF EXISTS ${CHECK_NAME};`);
  console.log(`Adding ${CHECK_NAME}...`);
  await pool.query(CHECK_SQL);
  console.log("Done. Malformed envelopes will now fail on INSERT/UPDATE.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
}).finally(() => pool.end());
