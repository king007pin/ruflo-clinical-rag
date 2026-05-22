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
if (!dbUrl) {
  console.error("DATABASE_URL not set in env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const sourceRes = await pool.query("SELECT COUNT(*) AS count FROM sources;");
    const embeddingRes = await pool.query("SELECT COUNT(*) AS count FROM embeddings;");
    
    console.log("Database Stats:");
    console.log("Sources count:", sourceRes.rows[0].count);
    console.log("Embeddings count:", embeddingRes.rows[0].count);

    // Let's check if there are columns or old dimension rows
    const dimRes = await pool.query(`
      SELECT 
        COUNT(*) AS count, 
        CASE 
          WHEN embedding::text LIKE '[%' THEN array_length(string_to_array(substring(embedding::text from 2 for length(embedding::text)-2), ','), 1)
          ELSE NULL 
        END AS dimension
      FROM embeddings
      GROUP BY dimension;
    `).catch(err => {
      console.log("Could not check vector dimension via simple array parse:", err.message);
      return null;
    });

    if (dimRes) {
      console.log("\nDimension breakdown:");
      console.table(dimRes.rows);
    }

    const typeRes = await pool.query(`
      SELECT type, COUNT(*) as count FROM sources GROUP BY type;
    `);
    console.log("\nSources by type:");
    console.table(typeRes.rows);

  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
