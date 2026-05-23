import fs from "node:fs";
import pg from "pg";
import { encryptPhi, decryptPhi, isEncrypted } from "../src/lib/phi-vault";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (!process.env[k]) {
        process.env[k] = rest
          .join("=")
          .trim()
          .replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const APPLY = process.argv.includes("--apply");
const TARGETS = [
  {
    table: "case_profiles",
    cols: ["patient_name", "patient_age", "patient_details", "clinician_notes"],
  },
  { table: "query_sessions", cols: ["query", "consensus_snippet"] },
];

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL not set");

const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });

async function selftest() {
  const x = "self-test " + Date.now();
  const encrypted = encryptPhi(x);
  const decrypted = decryptPhi(encrypted);
  if (decrypted !== x) {
    throw new Error("Roundtrip self-test FAILED.");
  }
  console.log("Encryption roundtrip self-test passed.");
}

async function migrate({ table, cols }: { table: string; cols: string[] }) {
  // Find rows where at least one target column is populated and not already encrypted
  const where = cols
    .map((c) => `(${c} IS NOT NULL AND ${c} NOT LIKE 'v1.%')`)
    .join(" OR ");

  const { rows: stale } = await pool.query(
    `SELECT id FROM ${table} WHERE ${where} ORDER BY id`,
  );
  console.log(`Found ${stale.length} stale rows in ${table}`);

  for (const { id } of stale) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");

      // Lock row to prevent concurrent writes
      const {
        rows: [row],
      } = await c.query(
        `SELECT ${cols.join(",")} FROM ${table} WHERE id = $1 FOR UPDATE`,
        [id],
      );

      if (!row) {
        await c.query("ROLLBACK");
        continue;
      }

      const sets = [];
      const vals = [id];

      for (const col of cols) {
        const v = row[col];
        // Skip if cell is empty or already encrypted (idempotency)
        if (v == null || isEncrypted(String(v))) continue;

        sets.push(`${col} = $${vals.length + 1}`);
        vals.push(encryptPhi(typeof v === "number" ? String(v) : v));
      }

      if (!sets.length) {
        await c.query("ROLLBACK");
        continue;
      }

      if (APPLY) {
        await c.query(
          `UPDATE ${table} SET ${sets.join(",")} WHERE id = $1`,
          vals,
        );
        await c.query("COMMIT");
        console.log(`Successfully encrypted row id ${id} in ${table}`);
      } else {
        await c.query("ROLLBACK");
        console.log(`[DRY-RUN] Would encrypt row id ${id} in ${table}`);
      }
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
}

async function verifyZero() {
  for (const { table, cols } of TARGETS) {
    const where = cols
      .map((c) => `(${c} IS NOT NULL AND ${c} NOT LIKE 'v1.%')`)
      .join(" OR ");
    const {
      rows: [r],
    } = await pool.query(
      `SELECT count(*)::int c FROM ${table} WHERE ${where}`,
    );
    if (r.c > 0) {
      throw new Error(
        `Verification failed: [${table}] ${r.c} plaintext rows still remain!`,
      );
    }
  }
  console.log("Database verification passed: 0 plaintext rows remain.");
}

async function run() {
  await selftest();
  for (const t of TARGETS) {
    await migrate(t);
  }
  if (APPLY) {
    await verifyZero();
  } else {
    console.log("[DRY-RUN] Finished migration dry-run. No changes committed.");
  }
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
