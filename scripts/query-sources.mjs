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

const dbUrl = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const sourceTypes = await pool.query("SELECT type, COUNT(*) AS count FROM sources GROUP BY type;");
    console.log("Sources by type:");
    console.table(sourceTypes.rows);

    const embeddingCount = await pool.query("SELECT COUNT(*) AS count FROM embeddings;");
    console.log("Embeddings (Chunks) count:", embeddingCount.rows[0].count);

    const sourceFeeds = await pool.query("SELECT name, enabled, last_fetch_count, error_count FROM source_feeds;");
    console.log("\nSource Feeds:");
    console.table(sourceFeeds.rows);

  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
