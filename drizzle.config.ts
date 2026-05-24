import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// W75 — replace `process.env.DATABASE_URL!` with an explicit fail-fast guard.
// The non-null assertion told the type checker to trust the env, but at
// runtime an unset value silently fell through to drizzle-kit which then
// crashed deep in connection setup with a stack trace that did not say
// "DATABASE_URL is missing".
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "drizzle.config.ts: DATABASE_URL is required. Populate .env.local or export it before running drizzle-kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
