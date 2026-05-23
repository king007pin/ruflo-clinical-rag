import fs from "node:fs";
import pg from "pg";
import { hash, Algorithm } from "@node-rs/argon2";

const { Pool } = pg;

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

const dbUrl = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const appPassword = process.env.APP_PASSWORD;

if (!dbUrl) throw new Error("DATABASE_URL is not set");
if (!adminEmail) throw new Error("ADMIN_EMAIL is not set");
if (!appPassword) throw new Error("APP_PASSWORD is not set");

const pool = new Pool({ connectionString: dbUrl, max: 1 });

async function main() {
  console.log(`Seeding admin: ${adminEmail}...`);
  const passwordHash = await hash(appPassword, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const client = await pool.connect();
  try {
    // 1. Ensure citext extension exists
    await client.query("CREATE EXTENSION IF NOT EXISTS citext");

    // 2. Try inserting admin user
    const check = await client.query("SELECT id FROM users WHERE email = $1", [
      adminEmail,
    ]);
    if (check.rows[0]) {
      console.log(
        `Admin user with email ${adminEmail} already exists. Skipping.`,
      );
      return;
    }

    await client.query(
      "INSERT INTO users (email, password_hash, active) VALUES ($1, $2, true)",
      [adminEmail, passwordHash],
    );
    console.log("Admin user successfully seeded!");
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
