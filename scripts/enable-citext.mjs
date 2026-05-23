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

const pool = new Pool({ connectionString: dbUrl, max: 1 });

async function main() {
  console.log("Enabling citext extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS citext;");
  console.log("citext extension enabled successfully!");
}

main().catch(console.error).finally(() => pool.end());
