import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
