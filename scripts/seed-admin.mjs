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

/**
 * W66 — Refuse to seed an admin account with a trivial password. Without this
 * floor, a weak APP_PASSWORD silently passes through the argon2id KDF and the
 * cost parameters become security theatre: an offline attacker who steals the
 * password_hash will exhaust a small dictionary in seconds. The banned-list is
 * illustrative rather than exhaustive — defence in depth, not the only line.
 */
function rejectWeakPassword(pw) {
  const reasons = [];
  if (pw.length < 12) reasons.push("must be at least 12 characters");
  if (!/[a-z]/.test(pw)) reasons.push("must contain a lowercase letter");
  if (!/[A-Z]/.test(pw)) reasons.push("must contain an uppercase letter");
  if (!/[0-9]/.test(pw)) reasons.push("must contain a digit");
  if (!/[^A-Za-z0-9]/.test(pw)) reasons.push("must contain a symbol");
  const banned = [
    "password",
    "admin",
    "qwerty",
    "letmein",
    "welcome",
    "changeme",
    "p@ssw0rd",
    "passw0rd",
    "iloveyou",
    "123456",
    "12345678",
    "mediq",
  ];
  const lower = pw.toLowerCase();
  if (banned.some((b) => lower.includes(b))) {
    reasons.push("contains a banned common-password substring");
  }
  if (reasons.length > 0) {
    throw new Error(
      `APP_PASSWORD rejected by W66 complexity check: ${reasons.join("; ")}.`,
    );
  }
}
rejectWeakPassword(appPassword);

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
        `Admin user with email ${adminEmail} already exists. Ensuring admin role, active state, and updating password hash...`,
      );
      await client.query(
        "UPDATE users SET role = 'admin', password_hash = $2, active = true WHERE email = $1",
        [adminEmail, passwordHash],
      );
      console.log("Admin user credentials and role ensured successfully!");
      return;
    }

    await client.query(
      "INSERT INTO users (email, password_hash, role, active) VALUES ($1, $2, 'admin', true)",
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
